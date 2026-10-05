import { describe, expect, it } from 'vitest'
import {
  POST_PROCESSING_PRESETS,
  POST_PROCESSING_SCHEMA_VERSION,
  resolvePostProcessingDecision,
  validatePostProcessingPresets,
} from './postProcessing'

describe('post-processing presets (S74)', () => {
  it('declares a valid, bounded configuration for every quality preset', () => {
    expect(validatePostProcessingPresets()).toEqual([])
    expect(POST_PROCESSING_SCHEMA_VERSION).toBe('1.0')
  })

  it('disables post-processing for low quality and enables it for medium/high', () => {
    expect(POST_PROCESSING_PRESETS.low.enabled).toBe(false)
    expect(POST_PROCESSING_PRESETS.low.passes).toEqual([])
    expect(POST_PROCESSING_PRESETS.medium.enabled).toBe(true)
    expect(POST_PROCESSING_PRESETS.high.enabled).toBe(true)
    expect(POST_PROCESSING_PRESETS.medium.passes).toEqual(['depth-ao', 'bloom', 'fxaa'])
  })

  it('keeps bloom selective so status colors stay readable', () => {
    for (const quality of ['medium', 'high'] as const) {
      const preset = POST_PROCESSING_PRESETS[quality]
      expect(preset.bloomThreshold).toBeGreaterThanOrEqual(0.5)
      expect(preset.bloomStrength).toBeLessThanOrEqual(1)
    }
  })

  it('runs the AO/bloom targets at a reduced internal resolution', () => {
    for (const quality of ['medium', 'high'] as const) {
      const preset = POST_PROCESSING_PRESETS[quality]
      expect(preset.renderScale).toBeGreaterThan(0)
      expect(preset.renderScale).toBeLessThanOrEqual(1)
    }
    expect(POST_PROCESSING_PRESETS.high.renderScale).toBeGreaterThanOrEqual(
      POST_PROCESSING_PRESETS.medium.renderScale,
    )
  })

  it('uses a stronger depth AO at high quality', () => {
    expect(POST_PROCESSING_PRESETS.high.aoIntensity).toBeGreaterThan(
      POST_PROCESSING_PRESETS.medium.aoIntensity,
    )
  })
})

describe('post-processing fallback decision (S74)', () => {
  const webgl2 = { hasContext: true, webgl2: true, acceleration: 'hardware' as const }

  it('falls back to the direct render path for low quality', () => {
    const decision = resolvePostProcessingDecision('low', webgl2)
    expect(decision.enabled).toBe(false)
    expect(decision.passes).toEqual([])
    expect(decision.reason).toContain('direct render')
  })

  it('enables the composer for medium/high on a hardware WebGL2 context', () => {
    const medium = resolvePostProcessingDecision('medium', webgl2)
    expect(medium.enabled).toBe(true)
    expect(medium.passes).toEqual(['depth-ao', 'bloom', 'fxaa'])
    const high = resolvePostProcessingDecision('high', webgl2)
    expect(high.enabled).toBe(true)
  })

  it('falls back cleanly when there is no context', () => {
    const decision = resolvePostProcessingDecision('high', { hasContext: false, webgl2: false, acceleration: 'unknown' })
    expect(decision.enabled).toBe(false)
    expect(decision.reason).toContain('no WebGL context')
  })

  it('falls back cleanly on a WebGL1-only context', () => {
    const decision = resolvePostProcessingDecision('high', { hasContext: true, webgl2: false, acceleration: 'hardware' })
    expect(decision.enabled).toBe(false)
    expect(decision.reason).toContain('WebGL2')
  })

  it('falls back cleanly on a software or unidentified renderer', () => {
    const software = resolvePostProcessingDecision('high', { hasContext: true, webgl2: true, acceleration: 'software' })
    expect(software.enabled).toBe(false)
    expect(software.reason).toContain('hardware-accelerated')
    const unknown = resolvePostProcessingDecision('medium', { hasContext: true, webgl2: true, acceleration: 'unknown' })
    expect(unknown.enabled).toBe(false)
    expect(unknown.reason).toContain('hardware-accelerated')
  })

  it('always returns a non-empty reason', () => {
    for (const quality of ['low', 'medium', 'high'] as const) {
      for (const capabilities of [
        webgl2,
        { hasContext: false, webgl2: false, acceleration: 'unknown' as const },
        { hasContext: true, webgl2: false, acceleration: 'hardware' as const },
        { hasContext: true, webgl2: true, acceleration: 'software' as const },
      ]) {
        expect(resolvePostProcessingDecision(quality, capabilities).reason.length).toBeGreaterThan(0)
      }
    }
  })
})
