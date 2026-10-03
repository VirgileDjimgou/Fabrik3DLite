/**
 * S66 scenario robot motion adapter.
 *
 * Thin, deterministic adapter that turns an authoritative scenario cell state
 * into joint-space motion on the *existing* robot stack:
 *
 *   authoritative scenario state/event
 *     → `ScenarioMotionPlan` waypoints
 *     → `MotionSafetyEngine` gate + `RobotController` (owning J1…J6)
 *     → `RobotVisualBinding` semantic joints
 *
 * The controller stays the sole owner of joint state and the visual binding only
 * mirrors it. The adapter owns no scenario truth, no collision authority and no
 * telemetry: it only requests motion the scenario asked for. Motion progression
 * uses an injectable deterministic simulation clock, never the render frame rate.
 */

import { createDefaultRobotCatalog, toJointLimits, type RobotDefinition } from '../robot/catalog'
import { RobotController } from '../simulation/RobotController'
import { clampJoints } from '../simulation/AxisLimits'
import { createRobotKinematics, type KinematicVector3 } from '../kinematics'
import { MotionSafetyEngine } from '../safety/motionSafety'
import { createSafetyRobotModel } from '../safety/robotModel'
import { vec, type Vec3 } from '../safety/collision'
import type { CellCollisionWorld } from '../safety/cellObstacles'
import type { SimulationAlarm } from '../safety/alarms'
import type { CellVisualState } from './cellVisualState'
import {
  createScenarioMotionPlan,
  motionInhibitReason,
  scenarioMotionSafetyConditions,
  type ScenarioMotionBlockReason,
  type ScenarioMotionPlan,
  type ScenarioMotionSafetyConditions,
  type ScenarioMotionWaypoint,
} from './scenarioRobotMotion'

/** Minimal visual sink; satisfied by `RobotVisualBinding`. */
export interface ScenarioRobotVisualSink {
  setJointAngles(angles: readonly number[]): void
}

export interface ScenarioRobotMotionAdapterOptions {
  plan?: ScenarioMotionPlan
  /** Overrides the plan's selected catalog profile. */
  profile?: RobotDefinition
  /** Reuses an externally owned controller instead of constructing one. */
  controller?: RobotController
  /** Visual-only mirror of the controller joints. */
  visualBinding?: ScenarioRobotVisualSink | null
  /** Reuses an existing safety engine; a floor-only default is built otherwise. */
  safety?: MotionSafetyEngine | null
  /** Deterministic simulation clock in seconds; defaults to the controller clock. */
  now?: () => number
}

export interface ScenarioRobotMotionSnapshot {
  kind: string
  profileId: string
  phase: string | null
  stepIndex: number
  totalSteps: number
  started: boolean
  complete: boolean
  blocked: boolean
  blockReason: ScenarioMotionBlockReason | 'motion-safety' | null
  carrying: boolean
  jointAngles: number[]
  /** Tool position in the robot base frame (SI metres), or null without kinematics. */
  toolPosition: KinematicVector3 | null
}

/**
 * A floor-only collision world. Scenario cell obstacle proxies are not yet
 * modelled (S67/S68 follow-up); the engine still enforces joint limits and
 * self-collision, and the scenario safety conditions are gated by the adapter.
 */
export function createScenarioSafetyWorld(): CellCollisionWorld {
  return {
    defaultMarginMeters: 0.02,
    obstacles: [{
      id: 'floor',
      kind: 'floor',
      primitive: { kind: 'plane', point: vec(0, 0, 0), normal: vec(0, 1, 0) },
      clearanceMeters: 0.02,
    }],
  }
}

export class ScenarioRobotMotionAdapter {
  readonly controller: RobotController
  readonly plan: ScenarioMotionPlan
  readonly profile: RobotDefinition

  private readonly visualBinding: ScenarioRobotVisualSink | null
  private readonly safetyEngine: MotionSafetyEngine | null
  private readonly now: () => number
  private readonly limits: ReturnType<typeof toJointLimits>

  private simTime = 0
  private started = false
  private complete = false
  private stepIndex = 0
  private segmentActive = false
  private phase: string | null = null
  private carrying = false
  private blocked = false
  private blockReason: ScenarioRobotMotionSnapshot['blockReason'] = null
  private lastAlarm: SimulationAlarm | null = null
  private safetyConditions: ScenarioMotionSafetyConditions = { emergencyStop: false, gateOpen: false, scannerMuted: false }
  private readonly trace: number[][] = []

  constructor(options: ScenarioRobotMotionAdapterOptions) {
    this.plan = options.plan ?? createScenarioMotionPlan('cnc-machine-tending')
    this.profile = options.profile ?? createDefaultRobotCatalog().getRobot(this.plan.robotProfileId)
    this.limits = toJointLimits(this.profile.joints)
    this.now = options.now ?? (() => this.simTime)
    this.controller = options.controller ?? new RobotController({
      limits: this.limits,
      kinematics: createRobotKinematics(this.profile),
      now: this.now,
    })
    this.visualBinding = options.visualBinding ?? null
    this.safetyEngine = options.safety === undefined ? this.createSafety() : options.safety
    this.syncVisual()
  }

  private createSafety(): MotionSafetyEngine | null {
    if (this.plan.waypoints.length === 0) return null
    return new MotionSafetyEngine(createSafetyRobotModel(this.profile), createScenarioSafetyWorld())
  }

  // ── Read-only state ──────────────────────────────────────────────

  get jointAngles(): readonly number[] { return this.controller.jointAngles }
  get jointHistory(): readonly (readonly number[])[] { return this.trace }
  get isMoving(): boolean { return this.controller.isMoving }
  get isBlocked(): boolean { return this.blocked }
  get alarm(): SimulationAlarm | null { return this.lastAlarm }

  hasMotion(): boolean { return this.plan.waypoints.length > 0 }

  snapshot(): ScenarioRobotMotionSnapshot {
    const pose = this.controller.getKinematicPose()
    return {
      kind: this.plan.kind,
      profileId: this.profile.id,
      phase: this.phase,
      stepIndex: this.stepIndex,
      totalSteps: this.plan.waypoints.length,
      started: this.started,
      complete: this.complete,
      blocked: this.blocked,
      blockReason: this.blockReason,
      carrying: this.carrying,
      jointAngles: [...this.controller.jointAngles],
      toolPosition: pose ? { ...pose.position } : null,
    }
  }

  /** Tool position in the robot base frame, from the injected kinematics. */
  toolPosition(): KinematicVector3 | null {
    const pose = this.controller.getKinematicPose()
    return pose ? { ...pose.position } : null
  }

  // ── Authoritative scenario state ─────────────────────────────────

  /**
   * Applies the authoritative, derived visible scenario state. A running
   * scenario starts the plan; an active simulated safety condition inhibits it
   * immediately and only clears through the existing controlled recovery path
   * (the scenario recovery event producing a safe state).
   */
  observeState(state: Pick<CellVisualState, 'lifecycle' | 'emergencyStop' | 'gateOpen' | 'scannerMuted'>): void {
    const conditions = scenarioMotionSafetyConditions(state)
    this.safetyConditions = conditions
    const reason = motionInhibitReason(conditions)
    if (reason) {
      // Stop immediately without teleporting: hold the current joint pose.
      this.controller.cancelMotion()
      this.segmentActive = false
      this.blocked = true
      this.blockReason = reason
      return
    }
    this.blocked = false
    this.blockReason = null
    if (state.lifecycle === 'running' && !this.started && this.hasMotion()) this.start()
  }

  get conditions(): ScenarioMotionSafetyConditions { return { ...this.safetyConditions } }

  /** Requests (or restarts) the plan. Idempotent while running. */
  start(): void {
    if (!this.hasMotion() || this.started) return
    this.started = true
    this.complete = false
    this.stepIndex = 0
    this.segmentActive = false
    this.phase = null
    this.carrying = false
    this.trace.length = 0
    this.record()
  }

  /**
   * Advances deterministic simulation time by `deltaSeconds`. Only motion that
   * the scenario requested and that is not safety-inhibited is executed.
   */
  tick(deltaSeconds: number): void {
    const dt = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0
    this.simTime += dt

    if (this.blocked) {
      this.controller.cancelMotion()
      this.segmentActive = false
      this.record()
      this.syncVisual()
      return
    }

    if (!this.started || this.complete) {
      this.controller.update(this.simTime)
      this.record()
      this.syncVisual()
      return
    }

    if (this.segmentActive) {
      this.controller.update(this.simTime)
      if (this.controller.isMoving) {
        this.record()
        this.syncVisual()
        return
      }
      this.segmentActive = false
      this.stepIndex += 1
    }

    this.startNextSegment()
    this.record()
    this.syncVisual()
  }

  private startNextSegment(): void {
    const waypoint = this.plan.waypoints[this.stepIndex]
    if (!waypoint) {
      this.complete = true
      this.phase = null
      this.carrying = false
      return
    }
    const from = [...this.controller.jointAngles]
    const target = clampJoints([...waypoint.targetJointsRad], this.limits)
    const check = this.safetyEngine?.checkMotion(from, target, waypoint.phase)
    if (check?.blocked) {
      this.lastAlarm = check.alarm
      this.blocked = true
      this.blockReason = 'motion-safety'
      return
    }
    this.phase = waypoint.phase
    this.carrying = waypoint.carrying
    this.controller.moveJoints(target, waypoint.durationSeconds)
    this.segmentActive = true
    // Sample the segment start so the first visible frame is the current pose.
    this.controller.update(this.simTime)
  }

  private record(): void {
    if (this.trace.length >= 4096) return
    this.trace.push([...this.controller.jointAngles])
  }

  private syncVisual(): void {
    this.visualBinding?.setJointAngles(this.controller.jointAngles)
  }
}

/** Convenience: measure the tool position of a waypoint without a controller. */
export function waypointToolPosition(profile: RobotDefinition, waypoint: ScenarioMotionWaypoint): Vec3 {
  const pose = createRobotKinematics(profile).forward([...waypoint.targetJointsRad])
  return vec(pose.position.x, pose.position.y, pose.position.z)
}
