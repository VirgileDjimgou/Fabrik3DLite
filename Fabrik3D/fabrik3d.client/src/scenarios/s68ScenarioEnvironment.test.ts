import { describe, expect, it, vi } from 'vitest'
import { EquipmentAssetRuntime, ThreeGlbAssetLoader, createIndustrialAssetRegistry } from '../equipment/assets'
import { collectMaterialIds, isMaterialId } from '../equipment/visuals/materialLibrary'
import { factoryEnvironmentDefinition } from '../equipment/visuals/factoryEnvironment'
import { createDefaultScenePresetCatalog } from '../scenes'
import { ScenarioRuntimeHost } from './ScenarioRuntimeHost'
import { resolveScenarioSceneBinding } from './sceneBinding'

/**
 * S68 acceptance criterion 1: the flagship material-flow cells all load the
 * coherent factory environment and use the shared material vocabulary. The CNC
 * flagship cell uses the same builder from `SingleConveyorFloor.vue` and is
 * covered by the visual regression capture.
 */
describe('S68 flagship scenario environments', () => {
  function testRuntime(): EquipmentAssetRuntime {
    const loadAsync = vi.fn(async () => { throw new Error('offline test runtime') })
    return new EquipmentAssetRuntime(createIndustrialAssetRegistry(), new ThreeGlbAssetLoader({ loadAsync }))
  }

  it('loads the shared environment and vocabulary for every material-flow flagship cell', async () => {
    const catalog = createDefaultScenePresetCatalog()
    const presets = catalog.list().filter((preset) => preset.runtimeProfile === 'material-flow')
    expect(presets).toHaveLength(4)

    for (const preset of presets) {
      const binding = resolveScenarioSceneBinding(preset.defaultScenarioId!, catalog)
      const host = new ScenarioRuntimeHost({ assetRuntime: testRuntime(), now: () => 0 })
      host.bind(binding)
      await host.loadVisuals()

      const environment = host.root.children.find((child) => child.name.startsWith('FactoryEnvironment:'))
      expect(environment, preset.id).toBeTruthy()
      const definition = factoryEnvironmentDefinition(environment!)
      expect(definition, preset.id).not.toBeNull()
      expect(definition!.variant, preset.id).toBe(binding.environmentLevel)
      expect(definition!.features, preset.id).toContain('industrial-floor')
      expect(definition!.features, preset.id).toContain('safety-zone-perimeter')
      if (binding.environmentLevel === 'industrial-hall') {
        expect(definition!.features, preset.id).toContain('operator-access-lane')
        expect(definition!.features, preset.id).toContain('cable-tray')
      }

      for (const id of collectMaterialIds(host.root)) {
        expect(isMaterialId(id), `${preset.id}: ${id}`).toBe(true)
      }
      host.dispose()
    }
  })
})
