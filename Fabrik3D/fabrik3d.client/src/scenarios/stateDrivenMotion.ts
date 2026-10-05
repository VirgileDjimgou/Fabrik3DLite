/**
 * S75 deterministic state-driven motion helpers.
 *
 * Pure, render-agnostic functions that translate authoritative runtime state
 * (gripper holding, conveyor run/speed, robot joint pose) into bounded visible
 * motion. They carry no Three.js objects and no scenario truth: the
 * `ScenarioCellAnimator` is the only place that applies their output to the
 * scene graph, and it never feeds anything back into scenario state.
 *
 * Every function is deterministic and side-effect free so the motion can be
 * unit-tested without a WebGL context and replayed identically.
 */

/** Finger separation (metres) when the gripper is fully open. */
export const GRIPPER_FINGER_OPEN_METERS = 0.075
/** Finger separation (metres) when the gripper is fully closed on a part. */
export const GRIPPER_FINGER_CLOSED_METERS = 0.018

/**
 * Declared default belt speed used when a scenario is running. The scenario
 * declares *that* the conveyor runs (authoritative lifecycle); this constant is
 * the documented visual speed, not a new scenario signal.
 */
export const DECLARED_CONVEYOR_SPEED_MPS = 0.6

/** Distance (metres) a belt marker travels before wrapping back to the infeed. */
export const BELT_MARKER_TRAVEL_METERS = 1.6

/** Maximum bounded dress-pack flex (radians) applied from the robot pose. */
export const DRESS_PACK_MAX_FLEX_RADIANS = 0.35

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Interpolated finger separation between the previous and current holding
 * state. `transition` is the 0..1 animator transition factor. A closed gripper
 * has the fingers close together; an open gripper has them apart.
 */
export function gripperFingerGap(fromHolding: boolean, toHolding: boolean, transition: number): number {
  const from = fromHolding ? GRIPPER_FINGER_CLOSED_METERS : GRIPPER_FINGER_OPEN_METERS
  const to = toHolding ? GRIPPER_FINGER_CLOSED_METERS : GRIPPER_FINGER_OPEN_METERS
  return from + (to - from) * clamp01(transition)
}

/**
 * Advances a wrapping belt offset by `speedMps * deltaSeconds`. A stopped or
 * negative speed, a non-positive delta or a non-positive travel distance leaves
 * the offset unchanged, so a stopped conveyor produces no motion.
 */
export function advanceBeltOffset(
  offset: number,
  speedMps: number,
  deltaSeconds: number,
  travelMeters: number = BELT_MARKER_TRAVEL_METERS,
): number {
  if (!(speedMps > 0) || !(deltaSeconds > 0) || !(travelMeters > 0)) return offset
  const next = offset + speedMps * deltaSeconds
  return ((next % travelMeters) + travelMeters) % travelMeters
}

/**
 * Bounded dress-pack flex derived from the robot joint pose. Only the first
 * three joints (base/shoulder/elbow) contribute; the result is clamped so a
 * cable can never swing beyond a credible range.
 */
export function dressPackFlex(jointAngles: readonly number[]): number {
  const sum = (jointAngles[0] ?? 0) + (jointAngles[1] ?? 0) + (jointAngles[2] ?? 0)
  return clamp(sum * 0.05, -DRESS_PACK_MAX_FLEX_RADIANS, DRESS_PACK_MAX_FLEX_RADIANS)
}

/**
 * Robot-base beacon colour role derived from authoritative robot state. The
 * beacon is optional: a visual without the node simply skips it.
 */
export type RobotBeaconSignal = 'off' | 'running' | 'fault'

export function robotBeaconSignal(state: {
  lifecycle: string
  fault: boolean
  emergencyStop: boolean
}): RobotBeaconSignal {
  if (state.fault || state.emergencyStop) return 'fault'
  if (state.lifecycle === 'running') return 'running'
  return 'off'
}
