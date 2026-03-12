import { AXIS_COUNT, clampJoints, type JointLimit, DEFAULT_JOINT_LIMITS } from './AxisLimits'
import { computeForwardKinematics, type FKResult, type DHParameter, DEFAULT_DH_PARAMS } from './ForwardKinematics'
import { planJointTrajectory, sampleTrajectory, type Trajectory } from './TrajectoryPlanner'

export interface RobotControllerOptions {
  limits?: readonly JointLimit[]
  dhParams?: readonly DHParameter[]
}

/**
 * High-level controller that owns joint state, enforces limits,
 * and drives trajectory-based motions.
 */
export class RobotController {
  readonly jointAngles: number[]
  private readonly limits: readonly JointLimit[]
  private readonly dhParams: readonly DHParameter[]

  private activeTrajectory: Trajectory | null = null
  private trajectoryStart = 0

  /** Callback fired whenever joints change. */
  onJointsChanged: ((angles: number[]) => void) | null = null

  constructor(options: RobotControllerOptions = {}) {
    this.limits = options.limits ?? DEFAULT_JOINT_LIMITS
    this.dhParams = options.dhParams ?? DEFAULT_DH_PARAMS
    this.jointAngles = new Array<number>(AXIS_COUNT).fill(0)
  }

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

  /** Start a smooth motion to the target angles over the given duration. */
  moveJoints(targetAngles: number[], duration = 1): void {
    const clamped = clampJoints(targetAngles, this.limits)
    this.activeTrajectory = planJointTrajectory([...this.jointAngles], clamped, duration)
    this.trajectoryStart = performance.now() / 1000
  }

  /** True while a trajectory motion is in progress. */
  get isMoving(): boolean {
    return this.activeTrajectory !== null
  }

  /** Compute forward kinematics for the current joint state. */
  getFK(): FKResult {
    return computeForwardKinematics(this.jointAngles, this.dhParams)
  }

  /**
   * Call every frame. Advances trajectory if active.
   * @param time  current time in seconds (e.g. performance.now() / 1000)
   */
  update(time: number): void {
    if (!this.activeTrajectory) return

    const elapsed = time - this.trajectoryStart
    const angles = sampleTrajectory(this.activeTrajectory, elapsed)
    this.setJointAngles(angles)

    if (elapsed >= this.activeTrajectory.duration) {
      this.activeTrajectory = null
    }
  }
}
