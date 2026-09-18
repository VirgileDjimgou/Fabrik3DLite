import { describe, expect, it } from 'vitest'
import { BUILT_IN_SCENE_PRESETS, ScenePresetCatalog, createDefaultScenePresetCatalog } from './catalog'

describe('ScenePresetCatalog', () => {
  it('registers five distinct industrial presets', () => {
    const catalog = createDefaultScenePresetCatalog()
    expect(catalog.list()).toHaveLength(5)
    expect(catalog.get('cnc-machine-tending').cell.id).toBe('single-conveyor-machining-cell')
    expect(catalog.get('robot-safety-training').capability).toBe('simulation-ready')
  })

  it('rejects duplicate preset ids', () => {
    const catalog = new ScenePresetCatalog(new Set(['robot-axes', 'coordinate-frames', 'pick-and-place', 'cnc-loading', 'pallet-processing']))
    catalog.register(BUILT_IN_SCENE_PRESETS[0]!)
    expect(() => catalog.register(BUILT_IN_SCENE_PRESETS[0]!)).toThrow('already registered')
  })
})
