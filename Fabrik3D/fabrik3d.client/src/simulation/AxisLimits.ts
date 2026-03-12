export interface JointLimit {
  min: number
  max: number
}

/** Default joint limits in radians for a 6-axis industrial robot. */
export const DEFAULT_JOINT_LIMITS: readonly JointLimit[] = [
  { min: -Math.PI, max: Math.PI },           // axis 1: ±180°
  { min: -Math.PI / 2, max: (135 * Math.PI) / 180 }, // axis 2: -90° to +135°
  { min: -(150 * Math.PI) / 180, max: (150 * Math.PI) / 180 }, // axis 3: ±150°
  { min: -Math.PI, max: Math.PI },           // axis 4: ±180°
  { min: -(120 * Math.PI) / 180, max: (120 * Math.PI) / 180 }, // axis 5: ±120°
  { min: -2 * Math.PI, max: 2 * Math.PI },   // axis 6: ±360°
] as const

export const AXIS_COUNT = 6

/** Clamp a single joint value to its limit. */
export function clampJoint(value: number, limit: JointLimit): number {
  return Math.max(limit.min, Math.min(limit.max, value))
}

/** Clamp an array of joint values to the corresponding limits. */
export function clampJoints(
  values: number[],
  limits: readonly JointLimit[] = DEFAULT_JOINT_LIMITS,
): number[] {
  return values.map((v, i) => clampJoint(v, limits[i]!))
}
