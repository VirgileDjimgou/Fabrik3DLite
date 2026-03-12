import { AXIS_COUNT, clampJoints, type JointLimit, DEFAULT_JOINT_LIMITS } from './AxisLimits'
import { computeForwardKinematics, type FKResult, type DHParameter, DEFAULT_DH_PARAMS } from './ForwardKinematics'
import { planJointTrajectory, sampleTrajectory, type Trajectory } from './TrajectoryPlanner'

export type RobotState = 'IDLE' | 'EXECUTING_COMMAND' | 'MOVING'

export type RobotCommandType = 'ROTATE_AXIS' | 'MOVE_TO_POSITION' | 'PICK_PART' | 'PLACE_PART'

export interface RobotCommand {
  type: RobotCommandType
  /** Target joint index (for ROTATE_AXIS). */
  axis?: number
  /** Target angle in radians (for ROTATE_AXIS). */
  targetAngle?: number
  /** Target joint angles in radians (for MOVE_TO_POSITION, PICK_PART, PLACE_PART). */
  targetAngles?: number[]
  /** Duration of the movement in seconds. */
  duration?: number
}

export interface RobotControllerOptions {
  limits?: readonly JointLimit[]
  dhParams?: readonly DHParameter[]
}

/**
 * High-level controller that owns joint state, enforces limits,
 * and drives trajectory-based motions.
 *
 * The robot starts in IDLE state and only moves in response to
 * explicit commands (moveJoints, rotateAxis, enqueueCommand).
 */
export class RobotController {
  readonly jointAngles: number[]
  private readonly limits: readonly JointLimit[]
  private readonly dhParams: readonly DHParameter[]

  private activeTrajectory: Trajectory | null = null
  private trajectoryStart = 0

  private _state: RobotState = 'IDLE'
  private readonly commandQueue: RobotCommand[] = []

  /** Callback fired whenever joints change. */
  onJointsChanged: ((angles: number[]) => void) | null = null
  /** Callback fired whenever the controller state changes. */
  onStateChanged: ((state: RobotState) => void) | null = null

  constructor(options: RobotControllerOptions = {}) {
    this.limits = options.limits ?? DEFAULT_JOINT_LIMITS
    this.dhParams = options.dhParams ?? DEFAULT_DH_PARAMS
    this.jointAngles = new Array<number>(AXIS_COUNT).fill(0)
  }

  // ── State ──────────────────────────────────────────────────────

  /** Current controller state. */
  get state(): RobotState {
    return this._state
  }

  private setState(s: RobotState): void {
    if (this._state === s) return
    this._state = s
    this.onStateChanged?.(s)
  }

  // ── Direct joint setters ──────────────────────────────────────

  /** Set a single joint angle (clamped). */
  setJointAngle(axis: number, value: number): void {
    if (axis < 0 || axis >= AXIS_COUNT) return
    this.jointAngles[axis] = clampJoints(
      [value],
      [this.limits[axis]!],
    )[0]!
    this.onJointsChanged?.(this.jointAngles)
  }

  /** Set all joint angles at once (clamped). */
  setJointAngles(values: number[]): void {
    const clamped = clampJoints(values, this.limits)
    for (let i = 0; i < AXIS_COUNT; i++) {
      this.jointAngles[i] = clamped[i]!
    }
    this.onJointsChanged?.(this.jointAngles)
  }

  // ── Motion commands ───────────────────────────────────────────

  /** Start a smooth motion to the target angles over the given duration. */
  moveJoints(targetAngles: number[], duration = 1): void {
    const clamped = clampJoints(targetAngles, this.limits)
    this.activeTrajectory = planJointTrajectory([...this.jointAngles], clamped, duration)
    this.trajectoryStart = performance.now() / 1000
    this.setState('MOVING')
  }

  /** Smoothly rotate a single axis to the given angle (radians). */
  rotateAxis(axisIndex: number, targetAngle: number, duration = 1): void {
    if (axisIndex < 0 || axisIndex >= AXIS_COUNT) return
    const target = [...this.jointAngles]
    target[axisIndex] = targetAngle
    this.moveJoints(target, duration)
  }

  /** True while a trajectory motion is in progress. */
  get isMoving(): boolean {
    return this.activeTrajectory !== null
  }

  // ── Command queue ─────────────────────────────────────────────

  /** Add a command to the queue. It will execute after any pending commands finish. */
  enqueueCommand(command: RobotCommand): void {
    this.commandQueue.push(command)
  }

  /** Number of commands waiting in the queue. */
  get pendingCommands(): number {
    return this.commandQueue.length
  }

  /** Remove all pending commands and stop after the current motion completes. */
  clearCommands(): void {
    this.commandQueue.length = 0
  }

  private executeCommand(cmd: RobotCommand): void {
    const dur = cmd.duration ?? 1
    switch (cmd.type) {
      case 'ROTATE_AXIS':
        if (cmd.axis != null && cmd.targetAngle != null) {
          this.rotateAxis(cmd.axis, cmd.targetAngle, dur)
        }
        break
      case 'MOVE_TO_POSITION':
      case 'PICK_PART':
      case 'PLACE_PART':
        if (cmd.targetAngles) {
          this.moveJoints(cmd.targetAngles, dur)
        }
        break
    }
    this.setState('EXECUTING_COMMAND')
  }

  // ── FK ─────────────────────────────────────────────────────────

  /** Compute forward kinematics for the current joint state. */
  getFK(): FKResult {
    return computeForwardKinematics(this.jointAngles, this.dhParams)
  }

  // ── Frame update ──────────────────────────────────────────────

  /**
   * Call every frame. Advances the active trajectory and processes
   * the command queue. When no trajectory or commands remain the
   * controller returns to IDLE and the robot stays still.
   *
   * @param time  current time in seconds (e.g. performance.now() / 1000)
   */
  update(time: number): void {
    // Advance active trajectory
    if (this.activeTrajectory) {
      const elapsed = time - this.trajectoryStart
      const angles = sampleTrajectory(this.activeTrajectory, elapsed)
      this.setJointAngles(angles)

      if (elapsed >= this.activeTrajectory.duration) {
        this.activeTrajectory = null
      } else {
        return // still moving
      }
    }

    // Try to start the next queued command
    if (this.commandQueue.length > 0) {
      this.executeCommand(this.commandQueue.shift()!)
      return
    }

    // Nothing to do – stay idle
    this.setState('IDLE')
  }
}
