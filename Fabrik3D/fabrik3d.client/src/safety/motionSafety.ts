/**
 * Motion safety engine: validates targets and swept motion paths before
 * execution, emitting structured simulation alarms when a move is unsafe.
 */

import { planJointTrajectory } from '../simulation/TrajectoryPlanner'
import { addPalletObstacle, type CellCollisionWorld } from './cellObstacles'
import { primitiveDistance, primitivesIntersect, type Vec3 } from './collision'
import { type SimulationAlarm, AlarmLog, createSimulationAlarm, SIMULATION_ALARM_CODES } from './alarms'
import { buildRobotArmSegments, selfCollision, type SafetyRobotModel } from './robotModel'
import { jointsWithinLimits, reachEnvelopeMeters, validateTargetReachability, type ReachabilityResult } from './reachability'
import type { KinematicPose } from '../kinematics'
import type { CollisionPrimitive } from './collision'

export interface SafetyOptions {
  /** Set false to bypass all safety checks (diagnostics disabled). */
  enabled: boolean
  selfCollisionEnabled: boolean
  linkRadiusMeters: number
  toolRadiusMeters: number
  /** Number of samples along a swept path. */
  sweptSampleCount: number
  /** Baseline margin added to every obstacle test (meters). */
  defaultMarginMeters: number
  /** Extra margin used while approaching a work object. */
  approachClearanceMeters: number
  /** Extra margin used while retracting from a work object. */
  retractClearanceMeters: number
  /** Nominal duration used only to sample the geometric path. */
  nominalTrajectoryDuration: number
}

export const DEFAULT_SAFETY_OPTIONS: SafetyOptions = {
  enabled: true,
  selfCollisionEnabled: true,
  linkRadiusMeters: 0.09,
  toolRadiusMeters: 0.05,
  sweptSampleCount: 24,
  defaultMarginMeters: 0.015,
  approachClearanceMeters: 0.02,
  retractClearanceMeters: 0.02,
  nominalTrajectoryDuration: 1,
}

export interface MotionCheckResult {
  ok: boolean
  blocked: boolean
  alarm: SimulationAlarm | null
  distanceMeters: number | null
  collisionPoint: Vec3 | null
  sampleIndex: number | null
}

export interface TargetCheckResult {
  ok: boolean
  blocked: boolean
  alarm: SimulationAlarm | null
  reachability: ReachabilityResult | null
}

const APPROACH_PHASES = new Set([
  'MOVE_ABOVE_PALLET_SLOT', 'DESCEND_TO_PICK', 'MOVE_TO_CNC_APPROACH', 'OPEN_CNC_DOOR',
  'MOVE_TO_CNC_INSERT', 'OPEN_CNC_DOOR_RETRIEVE', 'MOVE_TO_CNC_RETRIEVE',
  'MOVE_ABOVE_ORIGIN_SLOT', 'DESCEND_TO_ORIGIN_SLOT',
])

const RETRACT_PHASES = new Set([
  'LIFT_FROM_PALLET', 'RETRACT_FROM_CNC', 'LIFT_FROM_CNC', 'LIFT_AFTER_PLACE',
  'RETRIEVE_PART', 'CLOSE_CNC_DOOR',
])

export class MotionSafetyEngine {
  private readonly log: AlarmLog
  readonly options: SafetyOptions

  constructor(
    private readonly model: SafetyRobotModel,
    private world: CellCollisionWorld,
    log: AlarmLog = new AlarmLog(),
    options: Partial<SafetyOptions> = {},
  ) {
    this.options = { ...DEFAULT_SAFETY_OPTIONS, ...options }
    this.log = log
  }

  get alarms(): AlarmLog { return this.log }
  get enabled(): boolean { return this.options.enabled }

  /** Estimated reach radius of the robot, in meters. */
  getReachEnvelopeMeters(): number { return reachEnvelopeMeters(this.model) }

  /** Updates the dynamic pallet obstacle to the given world X (null removes it). */
  updatePalletObstacle(palletWorldX: number | null): void {
    this.world = palletWorldX === null
      ? { ...this.world, obstacles: this.world.obstacles.filter((obstacle) => obstacle.id !== 'pallet-work-object') }
      : addPalletObstacle(this.world, palletWorldX)
  }

  /** Validates a frame-aware target with IK. Unreachable targets warn but do not block. */
  checkTarget(target: KinematicPose, phase: string): TargetCheckResult {
    if (!this.options.enabled) return { ok: true, blocked: false, alarm: null, reachability: null }
    const reachability = validateTargetReachability(this.model, target)
    if (reachability.ok) return { ok: true, blocked: false, alarm: null, reachability }

    const alarm = createSimulationAlarm({
      code: SIMULATION_ALARM_CODES.UNREACHABLE_TARGET,
      severity: 'warning',
      message: `Target ${reachability.diagnostics.status}: ${reachability.diagnostics.message}`,
      equipmentId: 'robot-1',
      phase,
      distanceMeters: Math.max(0, reachability.targetDistanceMeters - reachability.reachableRadiusMeters),
    })
    this.log.raise(alarm)
    return { ok: false, blocked: false, alarm, reachability }
  }

  /** Checks a single static pose for self-collision and obstacle collisions. */
  checkPose(jointsRad: readonly number[], phase: string, equipmentId = 'robot-1'): MotionCheckResult {
    if (!this.options.enabled) return okResult()
    const segments = this.buildSegments(jointsRad)
    return this.checkSegments(segments.links, segments.tool, phase, equipmentId)
  }

  /**
   * Swept-path check from `fromJoints` to `toJoints`. Blocking failures
   * (joint-limit violation, self-collision, obstacle collision) pause
   * execution before visible penetration.
   */
  checkMotion(fromJoints: readonly number[], toJoints: readonly number[], phase: string, equipmentId = 'robot-1'): MotionCheckResult {
    if (!this.options.enabled) return okResult()

    const limits = jointsWithinLimits(toJoints, this.model.jointLimits)
    if (!limits.ok) {
      const alarm = createSimulationAlarm({
        code: SIMULATION_ALARM_CODES.JOINT_LIMIT_VIOLATION,
        severity: 'error',
        message: `Joint J${(limits.index ?? 0) + 1} target ${limits.value.toFixed(3)} rad exceeds limit [${limits.limit!.min.toFixed(3)}, ${limits.limit!.max.toFixed(3)}] rad.`,
        equipmentId,
        phase,
      })
      this.log.raise(alarm)
      return { ok: false, blocked: true, alarm, distanceMeters: null, collisionPoint: null, sampleIndex: null }
    }

    const trajectory = planJointTrajectory(
      [...fromJoints], [...toJoints],
      this.options.nominalTrajectoryDuration,
      this.options.sweptSampleCount,
    )
    for (let index = 0; index < trajectory.points.length; index++) {
      const point = trajectory.points[index]!
      const segments = this.buildSegments(point.angles)
      const result = this.checkSegments(segments.links, segments.tool, phase, equipmentId, index)
      if (result.blocked) return result
    }
    return okResult()
  }

  private buildSegments(jointsRad: readonly number[]) {
    return buildRobotArmSegments(
      this.model,
      jointsRad,
      this.options.linkRadiusMeters,
      this.options.toolRadiusMeters,
    )
  }

  private checkSegments(
    links: CollisionPrimitive[],
    tool: CollisionPrimitive,
    phase: string,
    equipmentId: string,
    sampleIndex: number | null = null,
  ): MotionCheckResult {
    if (this.options.selfCollisionEnabled) {
      const self = selfCollision(links, this.options.defaultMarginMeters)
      if (self.collision) {
        const alarm = createSimulationAlarm({
          code: SIMULATION_ALARM_CODES.SELF_COLLISION,
          severity: 'critical',
          message: `Self-collision between arm segments ${self.indexA} and ${self.indexB}.`,
          equipmentId,
          phase,
          distanceMeters: self.distanceMeters,
        })
        this.log.raise(alarm)
        return { ok: false, blocked: true, alarm, distanceMeters: self.distanceMeters, collisionPoint: null, sampleIndex }
      }
    }

    const clearance = this.clearanceForPhase(phase)
    for (const obstacle of this.world.obstacles) {
      const margin = obstacle.clearanceMeters + this.options.defaultMarginMeters + clearance
      // The base link is mounted on the floor, so it never counts as a floor collision.
      const parts = obstacle.kind === 'floor' ? [tool, ...links.slice(1)] : [tool, ...links]
      for (const part of parts) {
        if (primitivesIntersect(part, obstacle.primitive, margin)) {
          const alarm = createSimulationAlarm({
            code: SIMULATION_ALARM_CODES.COLLISION_RISK,
            severity: 'critical',
            message: `Collision risk with '${obstacle.id}' during phase '${phase}'.`,
            equipmentId: obstacle.id,
            phase,
            distanceMeters: primitiveDistance(part, obstacle.primitive),
          })
          this.log.raise(alarm)
          const collisionPoint = tool.kind === 'capsule' ? tool.end : null
          return { ok: false, blocked: true, alarm, distanceMeters: alarm.distanceMeters ?? 0, collisionPoint, sampleIndex }
        }
      }
    }
    return okResult()
  }

  private clearanceForPhase(phase: string): number {
    if (APPROACH_PHASES.has(phase)) return this.options.approachClearanceMeters
    if (RETRACT_PHASES.has(phase)) return this.options.retractClearanceMeters
    return 0
  }
}

function okResult(): MotionCheckResult {
  return { ok: true, blocked: false, alarm: null, distanceMeters: null, collisionPoint: null, sampleIndex: null }
}