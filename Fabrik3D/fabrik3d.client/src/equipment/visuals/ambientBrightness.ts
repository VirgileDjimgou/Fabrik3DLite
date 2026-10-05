/**
 * User-adjustable ambient brightness policy for the 3D simulator.
 *
 * The scene exposes a single "ambient brightness" multiplier that scales the
 * environment/ambient lighting vocabulary only (image-based environment,
 * hemisphere bounce, fill light, decorative local lights and background
 * intensity). It never scales the shadow-casting key light, so shadows keep
 * their definition, and it never touches simulation state, signals, safety,
 * collision or telemetry.
 *
 * The policy is deterministic and storage-agnostic so it can be unit-tested
 * without a browser: callers pass an optional `Storage`-like object.
 */

import type { IndustrialEnvironmentPreset } from './industrialEnvironment'

export const AMBIENT_BRIGHTNESS_SCHEMA_VERSION = '1.0' as const

/** Lowest selectable multiplier (darker than the shipped default). */
export const AMBIENT_BRIGHTNESS_MIN = 0.5
/** Highest selectable multiplier (brighter than the shipped default). */
export const AMBIENT_BRIGHTNESS_MAX = 3
/** Shipped default; 1 means the (already brightened) preset values. */
export const AMBIENT_BRIGHTNESS_DEFAULT = 1.4
/** Slider granularity. */
export const AMBIENT_BRIGHTNESS_STEP = 0.05
/**
 * Local preference key; a user choice survives reloads on the same browser.
 * Versioned so a stored value from the previous (darker) default does not hide
 * the new brighter shipped default.
 */
export const AMBIENT_BRIGHTNESS_STORAGE_KEY = 'fabrik3d.scene.ambientBrightness.v2'

/** Minimal storage surface; `window.localStorage` satisfies it. */
export interface BrightnessStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** Clamps a value into the supported range; non-finite input falls back to the default. */
export function clampAmbientBrightness(value: number): number {
  if (!Number.isFinite(value)) return AMBIENT_BRIGHTNESS_DEFAULT
  return Math.min(AMBIENT_BRIGHTNESS_MAX, Math.max(AMBIENT_BRIGHTNESS_MIN, value))
}

/** Parses a stored string; empty/invalid content falls back to the default. */
export function parseAmbientBrightness(raw: string | null | undefined): number {
  if (raw === null || raw === undefined || raw.trim() === '') return AMBIENT_BRIGHTNESS_DEFAULT
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? clampAmbientBrightness(parsed) : AMBIENT_BRIGHTNESS_DEFAULT
}

/** Reads the stored preference, degrading to the default when storage is unavailable. */
export function readAmbientBrightness(storage?: BrightnessStorage | null): number {
  try {
    return storage ? parseAmbientBrightness(storage.getItem(AMBIENT_BRIGHTNESS_STORAGE_KEY)) : AMBIENT_BRIGHTNESS_DEFAULT
  } catch {
    return AMBIENT_BRIGHTNESS_DEFAULT
  }
}

/** Clamps and persists a preference; returns the value actually stored. */
export function writeAmbientBrightness(value: number, storage?: BrightnessStorage | null): number {
  const clamped = clampAmbientBrightness(value)
  try {
    storage?.setItem(AMBIENT_BRIGHTNESS_STORAGE_KEY, String(clamped))
  } catch {
    // Storage can be unavailable (private mode, quota); the in-memory value still applies.
  }
  return clamped
}

/** Resolved lighting values for one preset and multiplier. */
export interface AmbientBrightnessApplication {
  multiplier: number
  environmentIntensity: number
  hemisphereIntensity: number
  fillLightIntensity: number
  /** Multiplier applied to every decorative local light's base intensity. */
  localLightScale: number
  /** Bounded scene background intensity. */
  backgroundIntensity: number
}

/**
 * Pure resolution of the ambient lighting values. The key light, shadow
 * configuration and post-processing are intentionally excluded.
 */
export function ambientBrightnessApplication(
  preset: Pick<IndustrialEnvironmentPreset, 'environmentIntensity' | 'hemisphereIntensity' | 'fillLightIntensity'>,
  multiplier: number,
): AmbientBrightnessApplication {
  const resolved = clampAmbientBrightness(multiplier)
  return {
    multiplier: resolved,
    environmentIntensity: preset.environmentIntensity * resolved,
    hemisphereIntensity: preset.hemisphereIntensity * resolved,
    fillLightIntensity: preset.fillLightIntensity * resolved,
    localLightScale: resolved,
    backgroundIntensity: Math.min(2.5, resolved),
  }
}

/** Human-readable percentage for the control label. */
export function ambientBrightnessPercent(value: number): string {
  return `${Math.round(clampAmbientBrightness(value) * 100)} %`
}
