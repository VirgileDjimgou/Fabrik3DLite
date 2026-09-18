/**
 * Simplified collision primitives used for robot safety checks.
 *
 * These are deliberately independent from rendered mesh geometry: the
 * simulator uses boxes, capsules, spheres and planes whose sizes come
 * from the cell definition, not from Three.js meshes. All lengths are
 * meters.
 */

export interface Vec3 {
  x: number
  y: number
  z: number
}

export type CollisionPrimitive =
  | { kind: 'sphere'; center: Vec3; radius: number }
  | { kind: 'capsule'; start: Vec3; end: Vec3; radius: number }
  | { kind: 'box'; min: Vec3; max: Vec3 }
  | { kind: 'plane'; point: Vec3; normal: Vec3 }

/** Distance below which two primitives count as touching (meters). */
export const COLLISION_EPSILON_METERS = 1e-6

// ── Vector helpers ─────────────────────────────────────────────────

export function vec(x: number, y: number, z: number): Vec3 { return { x, y, z } }
export function sub(a: Vec3, b: Vec3): Vec3 { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z } }
export function dot(a: Vec3, b: Vec3): number { return a.x * b.x + a.y * b.y + a.z * b.z }
export function length(v: Vec3): number { return Math.hypot(v.x, v.y, v.z) }
export function distance(a: Vec3, b: Vec3): number { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) }

// ── Distances ──────────────────────────────────────────────────────

export function pointToSegmentDistance(point: Vec3, a: Vec3, b: Vec3): number {
  const ab = sub(b, a)
  const lengthSquared = dot(ab, ab)
  if (lengthSquared <= COLLISION_EPSILON_METERS) return distance(point, a)
  const t = Math.max(0, Math.min(1, dot(sub(point, a), ab) / lengthSquared))
  return distance(point, { x: a.x + t * ab.x, y: a.y + t * ab.y, z: a.z + t * ab.z })
}

export function segmentSegmentDistance(a1: Vec3, a2: Vec3, b1: Vec3, b2: Vec3): number {
  const d1 = sub(a2, a1)
  const d2 = sub(b2, b1)
  const r = sub(a1, b1)
  const a = dot(d1, d1); const e = dot(d2, d2); const f = dot(d2, r)
  const c = dot(d1, r)
  const b = dot(d1, d2)
  const denom = a * e - b * b
  let s: number
  let t: number
  if (Math.abs(denom) <= COLLISION_EPSILON_METERS) {
    s = 0
    t = f / (e || 1)
  } else {
    s = (b * f - c * e) / denom
    t = (a * f - b * c) / denom
  }
  const clampedS = Math.max(0, Math.min(1, s))
  const clampedT = Math.max(0, Math.min(1, t))
  return distance(
    { x: a1.x + clampedS * d1.x, y: a1.y + clampedS * d1.y, z: a1.z + clampedS * d1.z },
    { x: b1.x + clampedT * d2.x, y: b1.y + clampedT * d2.y, z: b1.z + clampedT * d2.z },
  )
}

/** Distance from a point to the surface of an axis-aligned box (0 inside). */
export function pointToBoxDistance(point: Vec3, min: Vec3, max: Vec3): number {
  const dx = Math.max(min.x - point.x, 0, point.x - max.x)
  const dy = Math.max(min.y - point.y, 0, point.y - max.y)
  const dz = Math.max(min.z - point.z, 0, point.z - max.z)
  return Math.hypot(dx, dy, dz)
}

export function pointToPlaneDistance(point: Vec3, plane: { point: Vec3; normal: Vec3 }): number {
  return Math.abs(dot(sub(point, plane.point), plane.normal)) / (length(plane.normal) || 1)
}

// ── Primitive intersection tests ────────────────────────────────────

export function sphereIntersectsSphere(
  a: { center: Vec3; radius: number },
  b: { center: Vec3; radius: number },
  margin = 0,
): { intersects: boolean; distanceMeters: number } {
  const gap = distance(a.center, b.center) - a.radius - b.radius
  return { intersects: gap < margin + COLLISION_EPSILON_METERS, distanceMeters: Math.max(0, gap) }
}

export function capsuleIntersectsSphere(
  capsule: { start: Vec3; end: Vec3; radius: number },
  sphere: { center: Vec3; radius: number },
  margin = 0,
): { intersects: boolean; distanceMeters: number } {
  const gap = pointToSegmentDistance(sphere.center, capsule.start, capsule.end) - capsule.radius - sphere.radius
  return { intersects: gap < margin + COLLISION_EPSILON_METERS, distanceMeters: Math.max(0, gap) }
}

export function capsuleIntersectsCapsule(
  a: { start: Vec3; end: Vec3; radius: number },
  b: { start: Vec3; end: Vec3; radius: number },
  margin = 0,
): { intersects: boolean; distanceMeters: number } {
  const gap = segmentSegmentDistance(a.start, a.end, b.start, b.end) - a.radius - b.radius
  return { intersects: gap < margin + COLLISION_EPSILON_METERS, distanceMeters: Math.max(0, gap) }
}

export function capsuleIntersectsBox(
  capsule: { start: Vec3; end: Vec3; radius: number },
  box: { min: Vec3; max: Vec3 },
  margin = 0,
): { intersects: boolean; distanceMeters: number } {
  // Segment-AABB distance: sample the segment generously plus point-box distance.
  const samples = 12
  let minDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index <= samples; index++) {
    const t = index / samples
    const point = {
      x: capsule.start.x + (capsule.end.x - capsule.start.x) * t,
      y: capsule.start.y + (capsule.end.y - capsule.start.y) * t,
      z: capsule.start.z + (capsule.end.z - capsule.start.z) * t,
    }
    minDistance = Math.min(minDistance, pointToBoxDistance(point, box.min, box.max))
  }
  const gap = minDistance - capsule.radius
  return { intersects: gap < margin + COLLISION_EPSILON_METERS, distanceMeters: Math.max(0, gap) }
}

export function sphereIntersectsBox(
  sphere: { center: Vec3; radius: number },
  box: { min: Vec3; max: Vec3 },
  margin = 0,
): { intersects: boolean; distanceMeters: number } {
  const gap = pointToBoxDistance(sphere.center, box.min, box.max) - sphere.radius
  return { intersects: gap < margin + COLLISION_EPSILON_METERS, distanceMeters: Math.max(0, gap) }
}

export function sphereIntersectsPlane(
  sphere: { center: Vec3; radius: number },
  plane: { point: Vec3; normal: Vec3 },
  margin = 0,
): { intersects: boolean; distanceMeters: number } {
  const gap = pointToPlaneDistance(sphere.center, plane) - sphere.radius
  return { intersects: gap < margin + COLLISION_EPSILON_METERS, distanceMeters: Math.max(0, gap) }
}

export function capsuleIntersectsPlane(
  capsule: { start: Vec3; end: Vec3; radius: number },
  plane: { point: Vec3; normal: Vec3 },
  margin = 0,
): { intersects: boolean; distanceMeters: number } {
  const signed = (p: Vec3) => dot(sub(p, plane.point), plane.normal)
  const d1 = signed(capsule.start)
  const d2 = signed(capsule.end)
  const crossing = d1 * d2 <= 0
  const gap = crossing ? -capsule.radius : Math.min(Math.abs(d1), Math.abs(d2)) - capsule.radius
  return { intersects: gap < margin + COLLISION_EPSILON_METERS, distanceMeters: Math.max(0, gap) }
}

export function boxIntersectsPlane(
  box: { min: Vec3; max: Vec3 },
  plane: { point: Vec3; normal: Vec3 },
  margin = 0,
): { intersects: boolean; distanceMeters: number } {
  const corners: Vec3[] = [
    vec(box.min.x, box.min.y, box.min.z), vec(box.max.x, box.min.y, box.min.z),
    vec(box.min.x, box.max.y, box.min.z), vec(box.max.x, box.max.y, box.min.z),
    vec(box.min.x, box.min.y, box.max.z), vec(box.max.x, box.min.y, box.max.z),
    vec(box.min.x, box.max.y, box.max.z), vec(box.max.x, box.max.y, box.max.z),
  ]
  const signed = (p: Vec3) => dot(sub(p, plane.point), plane.normal)
  const distances = corners.map(signed)
  const minAbs = Math.min(...distances.map(Math.abs))
  const crosses = distances.some((d) => d < 0) && distances.some((d) => d > 0)
  const gap = crosses ? 0 : minAbs
  return { intersects: gap < margin + COLLISION_EPSILON_METERS, distanceMeters: Math.max(0, gap) }
}

// ── Generic dispatch ────────────────────────────────────────────────

/**
 * Returns true when two primitives intersect within the given margin.
 * The margin acts as a safety clearance in meters.
 */
export function primitivesIntersect(a: CollisionPrimitive, b: CollisionPrimitive, margin = 0): boolean {
  return primitiveDistance(a, b) < margin + COLLISION_EPSILON_METERS
}

/** Shortest distance between two primitives (0 when they touch). */
export function primitiveDistance(a: CollisionPrimitive, b: CollisionPrimitive): number {
  if (a.kind === 'sphere' && b.kind === 'sphere') return sphereIntersectsSphere(a, b).distanceMeters
  if (a.kind === 'capsule' && b.kind === 'sphere') return capsuleIntersectsSphere(a, b).distanceMeters
  if (a.kind === 'sphere' && b.kind === 'capsule') return capsuleIntersectsSphere(b, a).distanceMeters
  if (a.kind === 'capsule' && b.kind === 'capsule') return capsuleIntersectsCapsule(a, b).distanceMeters
  if (a.kind === 'capsule' && b.kind === 'box') return capsuleIntersectsBox(a, b).distanceMeters
  if (a.kind === 'box' && b.kind === 'capsule') return capsuleIntersectsBox(b, a).distanceMeters
  if (a.kind === 'sphere' && b.kind === 'box') return sphereIntersectsBox(a, b).distanceMeters
  if (a.kind === 'box' && b.kind === 'sphere') return sphereIntersectsBox(b, a).distanceMeters
if (a.kind === 'sphere' && b.kind === 'plane') return sphereIntersectsPlane(a, b).distanceMeters
  if (a.kind === 'plane' && b.kind === 'sphere') return sphereIntersectsPlane(b, a).distanceMeters
  if (a.kind === 'capsule' && b.kind === 'plane') return capsuleIntersectsPlane(a, b).distanceMeters
  if (a.kind === 'plane' && b.kind === 'capsule') return capsuleIntersectsPlane(b, a).distanceMeters
  if (a.kind === 'box' && b.kind === 'plane') return boxIntersectsPlane(a, b).distanceMeters
  if (a.kind === 'plane' && b.kind === 'box') return boxIntersectsPlane(b, a).distanceMeters
  throw new Error(`Unsupported primitive pair: ${a.kind} × ${b.kind}`)
}
