import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HYSTERESIS_RATIO,
  QUALITY_PROFILE_POLICIES,
  assetRadiusMeters,
  desiredLodLevel,
  effectiveMaxLevel,
  isAssetQualityProfile,
  lodDistanceThreshold,
  selectLodLevel,
} from './lodPolicy'

const bounds = { x: 2, y: 2, z: 2 } // radius 1 m

describe('S54 LOD policy', () => {
  it('derives a stable radius from declared bounds', () => {
    expect(assetRadiusMeters({ x: 2, y: 4, z: 1 })).toBe(2)
    expect(assetRadiusMeters({ x: 0, y: 0, z: 0 })).toBeGreaterThan(0)
  })

  it('keeps thresholds monotonic and scales them by profile', () => {
    const balanced0 = lodDistanceThreshold(0, bounds, 'balanced')
    const balanced1 = lodDistanceThreshold(1, bounds, 'balanced')
    expect(balanced1).toBeGreaterThan(balanced0)
    expect(lodDistanceThreshold(0, bounds, 'performance')).toBeLessThan(balanced0)
    expect(lodDistanceThreshold(0, bounds, 'quality')).toBeGreaterThan(balanced0)
  })

  it('selects the primary level up close and reduces detail with distance', () => {
    expect(desiredLodLevel({ distanceMeters: 2, boundsMeters: bounds, levelCount: 4, profile: 'balanced' })).toBe(0)
    expect(desiredLodLevel({ distanceMeters: 6, boundsMeters: bounds, levelCount: 4, profile: 'balanced' })).toBe(1)
    expect(desiredLodLevel({ distanceMeters: 10, boundsMeters: bounds, levelCount: 4, profile: 'balanced' })).toBe(2)
    expect(desiredLodLevel({ distanceMeters: 1000, boundsMeters: bounds, levelCount: 4, profile: 'balanced' })).toBe(2)
  })

  it('caps profiles at their configured and available level', () => {
    expect(QUALITY_PROFILE_POLICIES.performance.maxLevel).toBe(1)
    expect(effectiveMaxLevel(4, 'performance')).toBe(1)
    expect(effectiveMaxLevel(1, 'quality')).toBe(0)
    expect(desiredLodLevel({ distanceMeters: 1000, boundsMeters: bounds, levelCount: 4, profile: 'performance' })).toBe(1)
    expect(desiredLodLevel({ distanceMeters: 1000, boundsMeters: bounds, levelCount: 5, profile: 'quality' })).toBe(3)
  })

  it('applies hysteresis so small camera moves do not thrash the level', () => {
    const band = assetRadiusMeters(bounds) * DEFAULT_HYSTERESIS_RATIO
    const boundary = lodDistanceThreshold(0, bounds, 'balanced')
    // Wants to reduce detail, but not far enough past the threshold yet.
    expect(selectLodLevel({ distanceMeters: boundary + band / 2, boundsMeters: bounds, levelCount: 4, profile: 'balanced', currentLevel: 0 })).toBe(0)
    expect(selectLodLevel({ distanceMeters: boundary + band * 2, boundsMeters: bounds, levelCount: 4, profile: 'balanced', currentLevel: 0 })).toBe(1)
    // Wants to increase detail, but not close enough past the threshold yet.
    expect(selectLodLevel({ distanceMeters: boundary - band / 2, boundsMeters: bounds, levelCount: 4, profile: 'balanced', currentLevel: 1 })).toBe(1)
    expect(selectLodLevel({ distanceMeters: boundary - band * 2, boundsMeters: bounds, levelCount: 4, profile: 'balanced', currentLevel: 1 })).toBe(0)
  })

  it('falls back to the deselected level when the current level is unknown or out of range', () => {
    expect(selectLodLevel({ distanceMeters: 2, boundsMeters: bounds, levelCount: 4, profile: 'balanced' })).toBe(0)
    expect(selectLodLevel({ distanceMeters: 2, boundsMeters: bounds, levelCount: 4, profile: 'balanced', currentLevel: 99 })).toBe(0)
  })

  it('validates profile names', () => {
    expect(isAssetQualityProfile('balanced')).toBe(true)
    expect(isAssetQualityProfile('ultra')).toBe(false)
  })
})
