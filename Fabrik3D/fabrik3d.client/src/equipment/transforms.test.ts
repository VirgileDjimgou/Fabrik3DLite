import { describe, expect, it } from 'vitest'
import { createTransform, transformPoint } from './transforms'

describe('equipment transforms', () => {
  it('rotates in radians and translates in meters with numeric tolerance', () => {
    const transformed = transformPoint(
      createTransform({ x: 2, y: 1, z: -3 }, { x: 0, y: Math.PI / 2, z: 0 }),
      { x: 1, y: 0, z: 0 },
    )

    expect(transformed.x).toBeCloseTo(2, 10)
    expect(transformed.y).toBeCloseTo(1, 10)
    expect(transformed.z).toBeCloseTo(-4, 10)
  })
})
