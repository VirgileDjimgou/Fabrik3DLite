/**
 * Shared, persisted ambient-brightness preference for the 3D simulator.
 *
 * A module-level reactive value is intentional: the scene composable applies it
 * to whichever scene is mounted, while the slider component can live outside the
 * `<ThreeScene>` provider tree (for example in a docked panel) and still control
 * the live scene.
 *
 * Visual-only preference: it never affects simulation state, signals, safety,
 * collision or telemetry.
 */

import { ref } from 'vue'
import {
  AMBIENT_BRIGHTNESS_DEFAULT,
  readAmbientBrightness,
  writeAmbientBrightness,
  type BrightnessStorage,
} from '../equipment/visuals/ambientBrightness'

function browserStorage(): BrightnessStorage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

/** Current ambient brightness multiplier; 1 = the shipped preset baseline. */
export const ambientBrightness = ref(readAmbientBrightness(browserStorage()))

/** Clamps, persists and applies a new ambient brightness value. */
export function setAmbientBrightness(value: number): void {
  ambientBrightness.value = writeAmbientBrightness(value, browserStorage())
}

/** Restores the shipped default. */
export function resetAmbientBrightness(): void {
  setAmbientBrightness(AMBIENT_BRIGHTNESS_DEFAULT)
}
