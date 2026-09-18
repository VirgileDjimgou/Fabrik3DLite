import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import SceneSelectorPanel from './SceneSelectorPanel.vue'
import { createDefaultScenePresetCatalog } from '../scenes'

describe('SceneSelectorPanel', () => {
  beforeEach(() => localStorage.clear())

  it('selects a scene and exposes the simulated scenario brief', async () => {
    const presets = createDefaultScenePresetCatalog().list()
    const wrapper = mount(SceneSelectorPanel, { props: { presets, selectedId: 'cnc-machine-tending', locale: 'fr' } })
    await wrapper.find('[data-scene-select]').setValue('robot-safety-training')
    expect(wrapper.emitted('select')?.[0]).toEqual(['robot-safety-training'])

    await wrapper.setProps({ selectedId: 'robot-safety-training' })
    expect(wrapper.get('[data-scene-capability]').text()).toContain('Simulation ready')
    expect(wrapper.get('[data-scenario-brief]').text()).toContain('SIMULATED DATA')
  })

  it('emits reset from the default-scene button', async () => {
    const wrapper = mount(SceneSelectorPanel, { props: { presets: createDefaultScenePresetCatalog().list(), selectedId: 'robot-safety-training' } })
    await wrapper.get('[data-action="reset-scene"]').trigger('click')
    expect(wrapper.emitted('reset')).toHaveLength(1)
  })
})
