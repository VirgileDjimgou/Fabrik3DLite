/** Framework-independent kinematics contracts. All units are SI. */

import type { JointLimit } from '../simulation/AxisLimits'

export interface KinematicVector3 { x: number; y: number; z: number }
export interface KinematicQuaternion { x: number; y: number; z: number; w: number }

export interface KinematicPose {
  position: KinematicVector3
  orientation: KinematicQuaternion
  /** Frame that expresses this pose, usually `world`. */
  frameId: string
}

export interface DhLinkDefinition {
  thetaOffsetRad: number
  dMeters: number
  aMeters: number
  alphaRad: number
}

export interface KinematicsDiagnostics {
  status: 'converged' | 'unreachable' | 'singular' | 'invalid-target' | 'max-iterations'
  iterations: number
  positionErrorMeters: number
  orientationErrorRadians: number
  message: string
}

export interface InverseKinematicsResult {
  jointsRad: number[] | null
  diagnostics: KinematicsDiagnostics
}

export interface InverseKinematicsOptions {
  initialJointsRad?: number[]
  maxIterations?: number
  positionToleranceMeters?: number
  orientationToleranceRadians?: number
  damping?: number
}

/** Reusable model boundary. It never relies on a Three.js scene or mesh. */
export interface RobotKinematicsModel {
  readonly id: string
  readonly jointLimits: readonly JointLimit[]
  forward(jointsRad: readonly number[]): KinematicPose
  /** Pose of every joint origin along the chain, base … flange … tool tip. */
  jointTransforms(jointsRad: readonly number[]): KinematicPose[]
  inverse(target: KinematicPose, options?: InverseKinematicsOptions): InverseKinematicsResult
}
