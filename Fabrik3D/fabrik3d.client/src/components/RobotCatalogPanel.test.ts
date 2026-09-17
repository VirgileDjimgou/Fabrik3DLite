import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import RobotCatalogPanel from './RobotCatalogPanel.vue'
import { createDefaultRobotCatalog } from '../robot/catalog'

function mountPanel(selectedId = 'medium-6axis') {
  const catalog = createDefaultRobotCatalog()
  const wrapper = mount(RobotCatalogPanel, {
    props: {
      robots: catalog.listRobots(),
      tools: catalog.listTools(),
      selectedId,
    },
  })
  return wrapper
}

describe('RobotCatalogPanel', () => {
  it('displays declared payload and reach metadata for the selected robot', () => {
    const wrapper = mountPanel('medium-6axis')

    expect(wrapper.text()).toContain('Medium 6-axis')
    expect(wrapper.text()).toContain('12 kg')
    expect(wrapper.text()).toContain('1.4 m')
    expect(wrapper.text()).toContain('generic-position')
    expect(wrapper.find('[data-selected-robot="medium-6axis"]').exists()).toBe(true)
  })

  it('lists all three profiles with their metadata', () => {
    const wrapper = mountPanel()
    const text = wrapper.text()
    expect(text).toContain('Compact 6-axis')
    expect(text).toContain('3 kg')
    expect(text).toContain('Heavy 6-axis')
    expect(text).toContain('50 kg')
  })

  it('emits the selected robot id when a profile is chosen', async () => {
    const wrapper = mountPanel()
    await wrapper.find('[data-robot-id="heavy-6axis"]').trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual(['heavy-6axis'])
  })

  it('marks a tool incompatible when robot payload is too low', async () => {
    const catalog = createDefaultRobotCatalog()
    catalog.registerTool({
      id: 'heavy-tool',
      name: 'Heavy tool',
      category: 'gripper',
      massKg: 4,
      mount: 'iso-50',
      workingPayloadKg: 0,
    })
    const wrapper = mount(RobotCatalogPanel, {
      props: { robots: catalog.listRobots(), tools: catalog.listTools(), selectedId: 'compact-6axis' },
    })
    expect(wrapper.text()).toContain('payload too low')
  })
})
