import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MaterialFlowScenarioHost from './MaterialFlowScenarioHost.vue'
import { createDefaultScenePresetCatalog } from '../scenes'

describe('MaterialFlowScenarioHost', () => {
  it('runs a deterministic cycle then requires explicit recovery', async () => {
    const preset = createDefaultScenePresetCatalog().get('vision-sorting')
    const wrapper = mount(MaterialFlowScenarioHost, { props: { preset } })
    await wrapper.get('[data-action="run-material-flow"]').trigger('click')
    expect(wrapper.get('[data-runtime-state]').attributes('data-runtime-state')).toBe('running')
    await wrapper.get('[data-action="recover-material-flow"]').trigger('click')
    expect(wrapper.get('[data-runtime-state]').attributes('data-runtime-state')).toBe('completed')
    expect(wrapper.text()).toContain('sim-vision-sorting-sorting-normal-cycle')
  })
})
