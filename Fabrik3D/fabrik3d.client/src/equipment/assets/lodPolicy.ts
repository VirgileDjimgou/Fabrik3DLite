import type { Vector3Meters } from '../types'

/**
 * S54 centralized LOD policy.
 *
 * The policy is deliberately renderer-independent and deterministic so it can be
 * unit-tested without a GPU. It maps a camera distance and the asset's declared
 * bounds to a discrete visual level (0 = primary/highest detail, 1..n = manifest
 * LODs in decreasing triangle budget).
 *
 * It never reads or mutates simulation, collision or telemetry state.
 */
export type AssetQualityProfile = 'performance' | 'balanced' | 'quality'

export interface QualityProfilePolicy {
  /**
   * Scales the distance thresholds. Lower values switch to a reduced LOD sooner
   * (performance), higher values keep the detailed mesh for longer (quality).
   */
  distanceScale: number
  /**
   * Highest level index this profile may request. The number of manifest LODs
   * is a hard upper bound; this only lowers it for cheaper profiles.
   */
  maxLevel: number
}

export const QUALITY_PROFILE_POLICIES: Record<AssetQualityProfile, QualityProfilePolicy> = {
  performance: { distanceScale: 0.6, maxLevel: 1 },
  balanced: { distanceScale: 1.0, maxLevel: 2 },
  quality: { distanceScale: 1.6, maxLevel: 3 },
}

export const ASSET_QUALITY_PROFILES: readonly AssetQualityProfile[] = ['performance', 'balanced', 'quality']

/** Number of asset radii at which the next reduced level becomes attractive. */
export const BASE_DISTANCE_MULTIPLIER = 4

/** Fraction of the threshold band used as hysteresis to avoid LOD thrashing. */
export const DEFAULT_HYSTERESIS_RATIO = 0.25

/** Half of the largest declared extent; a stable, resolution-independent size. */
export function assetRadiusMeters(bounds: Vector3Meters): number {
  const largest = Math.max(Math.abs(bounds.x), Math.abs(bounds.y), Math.abs(bounds.z))
  return Math.max(largest / 2, 0.001)
}

export function isAssetQualityProfile(value: unknown): value is AssetQualityProfile {
  return value === 'performance' || value === 'balanced' || value === 'quality'
}

/**
 * Distance (meters) below which `levelIndex` is preferred. The final available
 * level has no upper threshold and is therefore never returned here.
 */
export function lodDistanceThreshold(
  levelIndex: number,
  boundsMeters: Vector3Meters,
  profile: AssetQualityProfile,
): number {
  const policy = QUALITY_PROFILE_POLICIES[profile]
  return assetRadiusMeters(boundsMeters) * BASE_DISTANCE_MULTIPLIER * (levelIndex + 1) * policy.distanceScale
}

export interface LodSelectionInput {
  distanceMeters: number
  boundsMeters: Vector3Meters
  /** Total available levels, including the primary. Must be >= 1. */
  levelCount: number
  profile: AssetQualityProfile
  /** Currently displayed level, when known; enables hysteresis. */
  currentLevel?: number
  hysteresisRatio?: number
}

/** Highest level index `profile` is allowed to request for `levelCount` levels. */
export function effectiveMaxLevel(levelCount: number, profile: AssetQualityProfile): number {
  return Math.max(0, Math.min(levelCount - 1, QUALITY_PROFILE_POLICIES[profile].maxLevel))
}

/** Distance-only level selection without hysteresis (used internally and in tests). */
export function desiredLodLevel(input: Omit<LodSelectionInput, 'currentLevel' | 'hysteresisRatio'>): number {
  const maxLevel = effectiveMaxLevel(input.levelCount, input.profile)
  const distance = Math.max(0, input.distanceMeters)
  for (let level = 0; level < maxLevel; level += 1) {
    if (distance <= lodDistanceThreshold(level, input.boundsMeters, input.profile)) return level
  }
  return maxLevel
}

/**
 * Selects the LOD level with deterministic hysteresis. A pending change is only
 * applied once the camera has moved past the switching threshold by the
 * hysteresis band, which prevents visible thrashing around a boundary.
 */
export function selectLodLevel(input: LodSelectionInput): number {
  const levelCount = Math.max(1, Math.floor(input.levelCount))
  const maxLevel = effectiveMaxLevel(levelCount, input.profile)
  const desired = desiredLodLevel({
    distanceMeters: input.distanceMeters,
    boundsMeters: input.boundsMeters,
    levelCount,
    profile: input.profile,
  })
  const current = input.currentLevel
  if (current === undefined || !Number.isFinite(current) || current < 0 || current > maxLevel) return desired
  const currentLevel = Math.floor(current)
  if (desired === currentLevel) return currentLevel

  const hysteresisRatio = input.hysteresisRatio ?? DEFAULT_HYSTERESIS_RATIO
  const band = assetRadiusMeters(input.boundsMeters) * hysteresisRatio * QUALITY_PROFILE_POLICIES[input.profile].distanceScale
  const distance = Math.max(0, input.distanceMeters)

  if (desired < currentLevel) {
    // Wants more detail: cross the upper bound of the target band, minus hysteresis.
    const boundary = currentLevel > 0 ? lodDistanceThreshold(currentLevel - 1, input.boundsMeters, input.profile) : Number.POSITIVE_INFINITY
    return distance <= boundary - band ? desired : currentLevel
  }
  // Wants less detail: cross the lower bound of the current band, plus hysteresis.
  const boundary = lodDistanceThreshold(currentLevel, input.boundsMeters, input.profile)
  return distance >= boundary + band ? desired : currentLevel
}
