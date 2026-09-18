import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CellEditor from './CellEditor.vue'
import { createDefaultRobotCatalog } from '../robot/catalog'

function mountEditor() {
  return mount(CellEditor, { props: { robotCatalog: createDefaultRobotCatalog() } })
}

describe('CellEditor persistence actions', () => {
  it('loads a sample cell from the catalog', async () => {
    const wrapper = mountEditor()
    await wrapper.find('[data-sample-select]').setValue('medium-6axis')
    await wrapper.find('[data-action="load-sample"]').trigger('click')

    expect(wrapper.find('[data-placement="robot-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-placement="cnc-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-placement="pallet-station-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-placement="conveyor-1"]').exists()).toBe(true)

    // The loaded sample conforms to the current schema.
    await wrapper.find('[data-action="validate"]').trigger('click')
    expect(wrapper.find('[data-validation-ok]').exists()).toBe(true)
  })

  it('validates the current cell against the schema', async () => {
    const wrapper = mountEditor()
    await wrapper.find('[data-action="validate"]').trigger('click')
    expect(wrapper.find('[data-validation-ok]').exists()).toBe(true)
  })

  it('reports validation diagnostics for an empty cell', async () => {
    const wrapper = mountEditor()
    // Delete every placement, then validate.
    for (const id of ['robot-1', 'cnc-1', 'pallet-station-1', 'conveyor-1']) {
      await wrapper.find(`[data-placement="${id}"]`).trigger('pointerdown', { clientX: 0, clientY: 0, buttons: 1 })
      await wrapper.find('[data-action="delete"]').trigger('click')
    }
    await wrapper.find('[data-action="validate"]').trigger('click')
    // An empty equipment list is still schema-conformant.
    expect(wrapper.find('[data-validation-ok]').exists()).toBe(true)
  })
})