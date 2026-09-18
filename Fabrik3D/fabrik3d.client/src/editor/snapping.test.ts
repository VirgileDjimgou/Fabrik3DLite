import { describe, expect, it } from 'vitest'
import { normalizeGridValue, snapAngle, snapDistance } from './snapping'

describe('grid snapping', () => {
  it('snaps distances to the grid', () => {
    expect(snapDistance(0.37, 0.1)).toBeCloseTo(0.4, 9)
    expect(snapDistance(0.12, 0.1)).toBeCloseTo(0.1, 9)
    expect(snapDistance(2.0, 0.5)).toBeCloseTo(2.0, 9)
  })

  it('snaps angles to the grid in degrees', () => {
    expect(snapAngle(Math.PI / 2, 15)).toBeCloseTo(Math.PI / 2, 9)
    expect(snapAngle(0.1, 15)).toBeCloseTo(0, 9) // 0.1 rad ≈ 5.7° → 0°
    expect(snapAngle(Math.PI, 15)).toBeCloseTo(Math.PI, 9)
  })

  it('returns the value unchanged when the grid is zero', () => {
    expect(snapDistance(0.37, 0)).toBeCloseTo(0.37, 9)
    expect(snapAngle(0.1, 0)).toBeCloseTo(0.1, 9)
  })

  it('normalizes grid values to a deterministic epsilon', () => {
    expect(normalizeGridValue(0.1 + 1e-9)).toBe(0.1)
    expect(normalizeGridValue(1.23456789)).toBeCloseTo(1.234568, 6)
  })
})