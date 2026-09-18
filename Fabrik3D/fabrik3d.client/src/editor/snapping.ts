/** Grid snapping for placement transforms. Distances in meters, angles in radians. */

export const DEFAULT_GRID_METERS = 0.1
export const DEFAULT_ANGLE_GRID_DEG = 15

/** Snap a distance to the nearest grid step (meters). */
export function snapDistance(value: number, gridMeters = DEFAULT_GRID_METERS): number {
  if (gridMeters <= 0) return value
  return Math.round(value / gridMeters) * gridMeters
}

/** Snap an angle to the nearest grid step (radians). */
export function snapAngle(value: number, gridDeg = DEFAULT_ANGLE_GRID_DEG): number {
  const gridRad = (gridDeg * Math.PI) / 180
  if (gridRad <= 0) return value
  return Math.round(value / gridRad) * gridRad
}

/** Round to a small epsilon to keep snap results deterministic. */
export function normalizeGridValue(value: number): number {
  return Math.round(value * 1e6) / 1e6
}