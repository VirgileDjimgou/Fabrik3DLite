/**
 * Target reachability and joint-limit validation. Reachability failures
 * are reported explicitly, never approximated silently.
 *
 * Reachability is evaluated against the robot's reach envelope computed
 * from the visual linkage (radial distance from the base, plus the
 * above-floor constraint). Targets outside the envelope are reported
 * `unreachable` with a structured diagnostic; targets inside are
 * considered reachable (best-effort, deterministic geometry check).
 */

import type { JointLimit } from '../simulation/AxisLimits'
import type { KinematicPose } from '../kinematics'
import { type SafetyRobotModel } from './robotModel'

export interface ReachabilityResult {
  ok: boolean
  /** IK solution is not produced by the envelope check; always null. */
  jointsRad: number[] | null
  diagnostics: { status: string; message: string; positionErrorMeters: number; orientationErrorRadians: number }
  reachableRadiusMeters: number
  targetDistanceMeters: number
}

/** The robot reach envelope from the visual linkage, in meters. */
export function reachEnvelopeMeters(model: SafetyRobotModel): number {
  return model.maxReachMeters()
}

/**
 * Validates that a world-frame target lies inside the robot's reach
 * envelope. Returns an explicit `ok: false` with a structured diagnostic
 * when the target is invalid or unreachable.
 */
export function validateTargetReachability(model: SafetyRobotModel, target: KinematicPose): ReachabilityResult {
  const reachableRadiusMeters = reachEnvelopeMeters(model)
  const targetDistanceMeters = Math.hypot(target.position.x, target.position.y, target.position.z)

  if (
    ![target.position.x, target.position.y, target.position.z].every(Number.isFinite)
    || target.frameId !== 'world'
  ) {
    return {
      ok: false,
      jointsRad: null,
      diagnostics: { status: 'invalid-target', message: 'Target must be finite and expressed in the world frame.', positionErrorMeters: Number.POSITIVE_INFINITY, orientationErrorRadians: Number.POSITIVE_INFINITY },
      reachableRadiusMeters,
      targetDistanceMeters,
    }
  }

  if (target.position.y < 0) {
    return {
      ok: false,
      jointsRad: null,
      diagnostics: { status: 'unreachable', message: 'Target is below the base and outside the reach envelope.', positionErrorMeters: 0, orientationErrorRadians: 0 },
      reachableRadiusMeters,
      targetDistanceMeters,
    }
  }

  if (targetDistanceMeters > reachableRadiusMeters) {
    return {
      ok: false,
      jointsRad: null,
      diagnostics: { status: 'unreachable', message: `Target is outside the model reach envelope (${reachableRadiusMeters.toFixed(2)} m).`, positionErrorMeters: targetDistanceMeters - reachableRadiusMeters, orientationErrorRadians: 0 },
      reachableRadiusMeters,
      targetDistanceMeters,
    }
  }

  return {
    ok: true,
    jointsRad: null,
    diagnostics: { status: 'reachable', message: 'Target is inside the reach envelope.', positionErrorMeters: 0, orientationErrorRadians: 0 },
    reachableRadiusMeters,
    targetDistanceMeters,
  }
}

export interface JointLimitCheck {
  ok: boolean
  index: number | null
  value: number
  limit: JointLimit | null
}

/** Verifies joint values stay inside their declared limits. */
export function jointsWithinLimits(angles: readonly number[], limits: readonly JointLimit[]): JointLimitCheck {
  for (let index = 0; index < angles.length; index++) {
    const limit = limits[index]
    const value = angles[index]!
    if (limit && (value < limit.min || value > limit.max)) {
      return { ok: false, index, value, limit }
    }
  }
  return { ok: true, index: null, value: 0, limit: null }
}