import { describe, expect, it } from 'vitest'
import { SCENE_QUALITY_PRESETS, resolveSceneQuality } from './useThreeScene'

describe('scene quality presets', () => {
  it('defaults to the documented medium profile and accepts explicit low/high modes', () => {
    expect(resolveSceneQuality()).toBe('medium')
    expect(resolveSceneQuality('?quality=low')).toBe('low')
    expect(resolveSceneQuality('?quality=high')).toBe('high')
    expect(resolveSceneQuality('?quality=unknown')).toBe('medium')
  })

  it('degrades predictably while medium remains the reference quality', () => {
    expect(SCENE_QUALITY_PRESETS.low.shadows).toBe(false)
    expect(SCENE_QUALITY_PRESETS.medium.shadowMapSize).toBe(2048)
    expect(SCENE_QUALITY_PRESETS.high.shadowMapSize).toBeGreaterThan(SCENE_QUALITY_PRESETS.medium.shadowMapSize)
  })

  it('keeps the default exposure bright and quality-monotonic', () => {
    expect(SCENE_QUALITY_PRESETS.low.toneMappingExposure).toBeGreaterThanOrEqual(1)
    expect(SCENE_QUALITY_PRESETS.medium.toneMappingExposure).toBeGreaterThan(SCENE_QUALITY_PRESETS.low.toneMappingExposure)
    expect(SCENE_QUALITY_PRESETS.high.toneMappingExposure).toBeGreaterThan(SCENE_QUALITY_PRESETS.medium.toneMappingExposure)
  })
})
