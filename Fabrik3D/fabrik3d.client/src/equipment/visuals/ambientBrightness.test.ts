import { describe, expect, it } from 'vitest'
import {
  AMBIENT_BRIGHTNESS_DEFAULT,
  AMBIENT_BRIGHTNESS_MAX,
  AMBIENT_BRIGHTNESS_MIN,
  AMBIENT_BRIGHTNESS_STORAGE_KEY,
  ambientBrightnessApplication,
  ambientBrightnessPercent,
  clampAmbientBrightness,
  parseAmbientBrightness,
  readAmbientBrightness,
  writeAmbientBrightness,
  type BrightnessStorage,
} from './ambientBrightness'
import { INDUSTRIAL_ENVIRONMENT_PRESETS } from './industrialEnvironment'

function memoryStorage(): BrightnessStorage & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value)
    },
  }
}

describe('ambient brightness policy', () => {
  it('clamps to the supported range and falls back for non-finite input', () => {
    expect(clampAmbientBrightness(0.1)).toBe(AMBIENT_BRIGHTNESS_MIN)
    expect(clampAmbientBrightness(9)).toBe(AMBIENT_BRIGHTNESS_MAX)
    expect(clampAmbientBrightness(Number.NaN)).toBe(AMBIENT_BRIGHTNESS_DEFAULT)
    expect(clampAmbientBrightness(1.25)).toBeCloseTo(1.25)
  })

  it('parses stored values and rejects invalid or empty content', () => {
    expect(parseAmbientBrightness('1.4')).toBeCloseTo(1.4)
    expect(parseAmbientBrightness('nope')).toBe(AMBIENT_BRIGHTNESS_DEFAULT)
    expect(parseAmbientBrightness('')).toBe(AMBIENT_BRIGHTNESS_DEFAULT)
    expect(parseAmbientBrightness(null)).toBe(AMBIENT_BRIGHTNESS_DEFAULT)
    expect(parseAmbientBrightness('99')).toBe(AMBIENT_BRIGHTNESS_MAX)
  })

  it('reads and writes through the storage port with the declared key', () => {
    const storage = memoryStorage()
    expect(readAmbientBrightness(storage)).toBe(AMBIENT_BRIGHTNESS_DEFAULT)
    expect(writeAmbientBrightness(1.6, storage)).toBeCloseTo(1.6)
    expect(storage.getItem(AMBIENT_BRIGHTNESS_STORAGE_KEY)).toBe('1.6')
    expect(readAmbientBrightness(storage)).toBeCloseTo(1.6)
  })

  it('degrades safely when storage throws', () => {
    const throwing: BrightnessStorage = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    }
    expect(readAmbientBrightness(throwing)).toBe(AMBIENT_BRIGHTNESS_DEFAULT)
    expect(writeAmbientBrightness(1.2, throwing)).toBeCloseTo(1.2)
  })

  it('scales the ambient terms monotonically and leaves the key light out', () => {
    const preset = INDUSTRIAL_ENVIRONMENT_PRESETS.medium
    const base = ambientBrightnessApplication(preset, 1)
    expect(base.environmentIntensity).toBeCloseTo(preset.environmentIntensity)
    expect(base.hemisphereIntensity).toBeCloseTo(preset.hemisphereIntensity)
    expect(base.fillLightIntensity).toBeCloseTo(preset.fillLightIntensity)

    const brighter = ambientBrightnessApplication(preset, 1.5)
    expect(brighter.environmentIntensity).toBeGreaterThan(base.environmentIntensity)
    expect(brighter.hemisphereIntensity).toBeGreaterThan(base.hemisphereIntensity)
    expect(brighter.fillLightIntensity).toBeGreaterThan(base.fillLightIntensity)
    expect(brighter.localLightScale).toBeCloseTo(1.5)
    expect(brighter.backgroundIntensity).toBeGreaterThan(base.backgroundIntensity)

    const clamped = ambientBrightnessApplication(preset, 99)
    expect(clamped.multiplier).toBe(AMBIENT_BRIGHTNESS_MAX)
    expect(clamped.backgroundIntensity).toBeLessThanOrEqual(2.5)
  })

  it('formats the control percentage deterministically', () => {
    expect(ambientBrightnessPercent(1)).toBe('100 %')
    expect(ambientBrightnessPercent(1.25)).toBe('125 %')
    expect(ambientBrightnessPercent(9)).toBe('300 %')
  })
})
