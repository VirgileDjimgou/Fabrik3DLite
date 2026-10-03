import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import MaterialFlowScenarioHost from './MaterialFlowScenarioHost.vue'
import { createDefaultScenePresetCatalog } from '../scenes'
import { resolveScenarioSceneBinding } from '../scenarios'
import { EquipmentAssetRuntime, ThreeGlbAssetLoader, createIndustrialAssetRegistry } from '../equipment/assets'
import { ASSET_RUNTIME_KEY } from '../composables/injectionKeys'

/**
 * S65: scenario equipment now prefers a generated GLB package, so the cell is
 * assembled asynchronously. These component tests inject the shared offline
 * asset runtime (the same deterministic pattern as `ScenarioRuntimeHost.test.ts`)
 * so the real host runs without reaching the network: every GLB level fails fast
 * and the runtime degrades to the procedural visual, keeping the equipment count
 * and scenario-state assertions deterministic.
 */
function offlineRuntime(): EquipmentAssetRuntime {
  const loadAsync = vi.fn(async () => { throw new Error('offline component test runtime') })
  return new EquipmentAssetRuntime(createIndustrialAssetRegistry(), new ThreeGlbAssetLoader({ loadAsync }))
}

function mountOptions() {
  return { global: { provide: { [ASSET_RUNTIME_KEY]: offlineRuntime() } } }
}

describe('MaterialFlowScenarioHost', () => {
  it('mounts a real 3D scenario runtime and runs a deterministic cycle then requires explicit recovery', async () => {
    const preset = createDefaultScenePresetCatalog().get('vision-sorting')
    const binding = resolveScenarioSceneBinding(preset.defaultScenarioId!, createDefaultScenePresetCatalog())
    const wrapper = mount(MaterialFlowScenarioHost, { props: { preset }, ...mountOptions() })
    await flushPromises()

    // The plan-view preview is no longer the runtime view; a 3D cell is.
    expect(wrapper.find('[data-scenario-runtime]').exists()).toBe(true)
    expect(wrapper.find('[data-layout-preview]').exists()).toBe(false)
    await vi.waitFor(() => {
      expect(wrapper.get('[data-scenario-runtime]').attributes('data-runtime-equipment-count'))
        .toBe(String(binding.cell.equipment.length))
    })

    await wrapper.get('[data-action="run-material-flow"]').trigger('click')
    expect(wrapper.get('[data-runtime-state]').attributes('data-runtime-state')).toBe('running')
    // S59: the visible cell state is bound to the authoritative run event.
    expect(wrapper.get('[data-cell-state]').attributes('data-cell-classification')).toBe('accepted')
    await wrapper.get('[data-action="recover-material-flow"]').trigger('click')
    expect(wrapper.get('[data-runtime-state]').attributes('data-runtime-state')).toBe('completed')
    expect(wrapper.text()).toContain('sim-vision-sorting-sorting-normal-cycle')
  })

  it('surfaces a jam recovery scenario as a visible fault state until recovery', async () => {
    const preset = createDefaultScenePresetCatalog().get('vision-sorting')
    const binding = { ...preset, defaultScenarioId: 'sorting-jam-recovery' }
    const wrapper = mount(MaterialFlowScenarioHost, { props: { preset: binding }, ...mountOptions() })
    await flushPromises()

    expect(wrapper.get('[data-cell-state]').attributes('data-cell-jam')).toBe('true')
    await wrapper.get('[data-action="run-material-flow"]').trigger('click')
    expect(wrapper.get('[data-cell-state]').attributes('data-cell-classification')).toBe('rejected')
    await wrapper.get('[data-action="recover-material-flow"]').trigger('click')
    expect(wrapper.get('[data-cell-state]').attributes('data-cell-jam')).toBe('false')
  })

  it('drives the declared process to a requested execution stage for capture', async () => {
    window.history.replaceState({}, '', '/?stage=palletizing-pick')
    try {
      const preset = createDefaultScenePresetCatalog().get('robot-palletizing')
      const wrapper = mount(MaterialFlowScenarioHost, { props: { preset }, ...mountOptions() })
      await flushPromises()

      await vi.waitFor(() => {
        const stage = wrapper.find('[data-execution-stage]')
        expect(stage.exists()).toBe(true)
        expect(stage.attributes('data-execution-stage-reached')).toBe('true')
      })
      const stage = wrapper.get('[data-execution-stage]')
      expect(stage.attributes('data-execution-stage-id')).toBe('palletizing-pick')
      expect(stage.attributes('data-execution-scenario')).toBe('palletizing-normal-cycle')
      expect(stage.attributes('data-execution-stage-sequence')).toContain('palletizing-pick')
      // The visible cell state follows the same authoritative stage event.
      expect(wrapper.get('[data-cell-state]').attributes('data-cell-kind')).toBe('robot-palletizing')
    } finally {
      window.history.replaceState({}, '', '/')
    }
  })

  it('fails closed when the requested execution stage is unknown', async () => {
    window.history.replaceState({}, '', '/?stage=not-a-real-stage')
    try {
      const preset = createDefaultScenePresetCatalog().get('vision-sorting')
      const wrapper = mount(MaterialFlowScenarioHost, { props: { preset }, ...mountOptions() })
      await flushPromises()

      await vi.waitFor(() => {
        const stage = wrapper.find('[data-execution-stage]')
        expect(stage.exists()).toBe(true)
        expect(stage.attributes('data-execution-stage-reached')).toBe('false')
      })
    } finally {
      window.history.replaceState({}, '', '/')
    }
  })
})
