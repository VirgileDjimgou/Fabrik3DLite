import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MaterialFlowScenarioHost from './MaterialFlowScenarioHost.vue'
import { createDefaultScenePresetCatalog } from '../scenes'
import { resolveScenarioSceneBinding } from '../scenarios'

describe('MaterialFlowScenarioHost', () => {
  it('mounts a real 3D scenario runtime and runs a deterministic cycle then requires explicit recovery', async () => {
    const preset = createDefaultScenePresetCatalog().get('vision-sorting')
    const binding = resolveScenarioSceneBinding(preset.defaultScenarioId!, createDefaultScenePresetCatalog())
    const wrapper = mount(MaterialFlowScenarioHost, { props: { preset } })
    await flushPromises()

    // The plan-view preview is no longer the runtime view; a 3D cell is.
    expect(wrapper.find('[data-scenario-runtime]').exists()).toBe(true)
    expect(wrapper.find('[data-layout-preview]').exists()).toBe(false)
    expect(wrapper.get('[data-scenario-runtime]').attributes('data-runtime-equipment-count'))
      .toBe(String(binding.cell.equipment.length))

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
    const wrapper = mount(MaterialFlowScenarioHost, { props: { preset: binding } })
    await flushPromises()

    expect(wrapper.get('[data-cell-state]').attributes('data-cell-jam')).toBe('true')
    await wrapper.get('[data-action="run-material-flow"]').trigger('click')
    expect(wrapper.get('[data-cell-state]').attributes('data-cell-classification')).toBe('rejected')
    await wrapper.get('[data-action="recover-material-flow"]').trigger('click')
    expect(wrapper.get('[data-cell-state]').attributes('data-cell-jam')).toBe('false')
  })
})
