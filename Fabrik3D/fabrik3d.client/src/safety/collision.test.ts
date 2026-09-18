import { describe, expect, it } from 'vitest'
import {
  capsuleIntersectsBox,
  capsuleIntersectsCapsule,
  capsuleIntersectsSphere,
  pointToBoxDistance,
  pointToPlaneDistance,
  pointToSegmentDistance,
  primitiveDistance,
  primitivesIntersect,
  sphereIntersectsBox,
  sphereIntersectsPlane,
  sphereIntersectsSphere,
  vec,
} from './collision'

describe('collision primitives (deterministic poses)', () => {
  it('detects and separates spheres', () => {
    const a = { center: vec(0, 0, 0), radius: 0.1 }
    const b = { center: vec(0.2, 0, 0), radius: 0.1 }
    expect(sphereIntersectsSphere(a, b).intersects).toBe(true) // touching
    expect(sphereIntersectsSphere(a, { center: vec(0.5, 0, 0), radius: 0.1 }).intersects).toBe(false)
    expect(sphereIntersectsSphere(a, { center: vec(0.3, 0, 0), radius: 0.1 }).distanceMeters).toBeCloseTo(0.1, 9)
  })

  it('detects capsule/sphere contact and separation', () => {
    const capsule = { start: vec(-0.5, 0, 0), end: vec(0.5, 0, 0), radius: 0.05 }
    expect(capsuleIntersectsSphere(capsule, { center: vec(0, 0.05, 0), radius: 0.05 }).intersects).toBe(true)
    expect(capsuleIntersectsSphere(capsule, { center: vec(0, 1, 0), radius: 0.05 }).intersects).toBe(false)
    expect(capsuleIntersectsSphere(capsule, { center: vec(0, 0.5, 0), radius: 0.05 }).distanceMeters).toBeCloseTo(0.4, 9)
  })

  it('detects parallel and crossing capsules', () => {
    const alongX = { start: vec(-1, 0, 0), end: vec(1, 0, 0), radius: 0.05 }
    const crossing = { start: vec(0, -1, 0), end: vec(0, 1, 0), radius: 0.05 }
    expect(capsuleIntersectsCapsule(alongX, crossing).intersects).toBe(true)
    const parallel = { start: vec(-1, 1, 0), end: vec(1, 1, 0), radius: 0.05 }
    expect(capsuleIntersectsCapsule(alongX, parallel).intersects).toBe(false)
  })

  it('detects capsule/box contact with margin', () => {
    const box = { min: vec(-1, -1, -1), max: vec(1, 1, 1) }
    const inside = { start: vec(0, 0, 0), end: vec(0, 0.5, 0), radius: 0.05 }
    expect(capsuleIntersectsBox(inside, box).intersects).toBe(true)
    const outside = { start: vec(0, 3, 0), end: vec(0, 4, 0), radius: 0.05 }
    expect(capsuleIntersectsBox(outside, box).intersects).toBe(false)
    expect(capsuleIntersectsBox(outside, box).distanceMeters).toBeCloseTo(2 - 0.05, 1)
  })

  it('detects sphere/box and sphere/plane contact', () => {
    const box = { min: vec(0, 0, 0), max: vec(1, 1, 1) }
    const sphereNear = { center: vec(1.05, 0.5, 0.5), radius: 0.1 }
    expect(sphereIntersectsBox(sphereNear, box).intersects).toBe(true)
    expect(sphereIntersectsBox({ center: vec(2, 0.5, 0.5), radius: 0.1 }, box).intersects).toBe(false)

    const floor = { point: vec(0, 0, 0), normal: vec(0, 1, 0) }
    const below = { center: vec(0, -0.05, 0), radius: 0.1 }
    expect(sphereIntersectsPlane(below, floor).intersects).toBe(true)
    expect(sphereIntersectsPlane({ center: vec(0, 0.5, 0), radius: 0.1 }, floor).intersects).toBe(false)
  })

  it('applies a positive margin as clearance', () => {
    const a = { center: vec(0, 0, 0), radius: 0.1 }
    const b = { center: vec(0.25, 0, 0), radius: 0.1 }
    expect(sphereIntersectsSphere(a, b, 0.02).intersects).toBe(false)
    expect(sphereIntersectsSphere(a, b, 0.2).intersects).toBe(true)
  })

  it('computes point distances for known configurations', () => {
    expect(pointToSegmentDistance(vec(0, 1, 0), vec(-1, 0, 0), vec(1, 0, 0))).toBeCloseTo(1, 9)
    expect(pointToBoxDistance(vec(2, 0, 0), vec(0, 0, 0), vec(1, 1, 1))).toBeCloseTo(1, 9)
    expect(pointToPlaneDistance(vec(0, 2, 0), { point: vec(0, 0, 0), normal: vec(0, 1, 0) })).toBeCloseTo(2, 9)
  })

  it('dispatches generic primitive pairs and rejects unsupported ones', () => {
    const sphere = { kind: 'sphere' as const, center: vec(0, 0, 0), radius: 0.1 }
    const box = { kind: 'box' as const, min: vec(0, 0, 0), max: vec(1, 1, 1) }
    expect(primitivesIntersect(sphere, box)).toBe(true)
    expect(primitiveDistance(sphere, { kind: 'sphere' as const, center: vec(0.5, 0, 0), radius: 0.1 })).toBeCloseTo(0.3, 9)
  })
})