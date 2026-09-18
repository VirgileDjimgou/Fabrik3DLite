import { describe, expect, it } from 'vitest'
import { DEFAULT_SCENE_PRESET_ID, createDefaultScenePresetCatalog } from './catalog'
import { SceneSelectionController } from './selection'

describe('SceneSelectionController', () => {
  it('remounts on scene change and clears back to the default on reset', () => {
    const selection = new SceneSelectionController(createDefaultScenePresetCatalog(), DEFAULT_SCENE_PRESET_ID)
    const initialKey = selection.hostKey

    expect(selection.canSimulate).toBe(true)
    expect(selection.select('robot-safety-training')).toBe(true)
    expect(selection.hostKey).not.toBe(initialKey)
    expect(selection.canSimulate).toBe(true)

    const layoutKey = selection.hostKey
    selection.reset()
    expect(selection.selectedId).toBe(DEFAULT_SCENE_PRESET_ID)
    expect(selection.hostKey).not.toBe(layoutKey)
    expect(selection.canSimulate).toBe(true)
  })

  it('does not remount when the selected id is unchanged', () => {
    const selection = new SceneSelectionController(createDefaultScenePresetCatalog(), DEFAULT_SCENE_PRESET_ID)
    const key = selection.hostKey
    expect(selection.select(DEFAULT_SCENE_PRESET_ID)).toBe(false)
    expect(selection.hostKey).toBe(key)
  })
})
