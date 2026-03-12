import { AXIS_COUNT } from './AxisLimits'

export interface TrajectoryPoint {
  time: number
  angles: number[]
  velocities: number[]
}

export interface Trajectory {
  duration: number
  points: TrajectoryPoint[]
}

/**
 * Plan a smooth joint-space trajectory between two configurations.
 * Uses a cubic polynomial (ease-in / ease-out) for each joint.
 *
 * @param startAngles  start joint angles (radians)
 * @param targetAngles target joint angles (radians)
 * @param duration     total motion time in seconds
 * @param sampleRate   number of samples per second
 */
export function planJointTrajectory(
  startAngles: number[],
  targetAngles: number[],
  duration: number,
  sampleRate = 60,
): Trajectory {
  const steps = Math.max(1, Math.round(duration * sampleRate))
  const points: TrajectoryPoint[] = []

  for (let s = 0; s <= steps; s++) {
    const t = (s / steps) * duration
    const u = t / duration                        // normalised time [0, 1]
    const blend = 3 * u * u - 2 * u * u * u       // cubic ease-in-out
    const blendDot = (6 * u - 6 * u * u) / duration

    const angles: number[] = []
    const velocities: number[] = []

    for (let j = 0; j < AXIS_COUNT; j++) {
      const start = startAngles[j] ?? 0
      const end = targetAngles[j] ?? 0
      const delta = end - start
      angles.push(start + delta * blend)
      velocities.push(delta * blendDot)
    }

    points.push({ time: t, angles, velocities })
  }

  return { duration, points }
}

/**
 * Sample a trajectory at a given elapsed time.
 * Returns interpolated joint angles.
 */
export function sampleTrajectory(trajectory: Trajectory, elapsed: number): number[] {
  if (elapsed <= 0) return trajectory.points[0]!.angles
  if (elapsed >= trajectory.duration) return trajectory.points[trajectory.points.length - 1]!.angles

  // Binary search for surrounding points
  const pts = trajectory.points
  let lo = 0
  let hi = pts.length - 1
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1
    if (pts[mid]!.time <= elapsed) lo = mid
    else hi = mid
  }

  const p0 = pts[lo]!
  const p1 = pts[hi]!
  const f = (elapsed - p0.time) / (p1.time - p0.time || 1)

  return p0.angles.map((a, i) => a + (p1.angles[i]! - a) * f)
}
