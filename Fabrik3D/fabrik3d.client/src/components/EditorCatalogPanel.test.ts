import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import EditorCatalogPanel from './EditorCatalogPanel.vue'
import { createDefaultRobotCatalog } from '../robot/catalog'
import { createEditorCatalog } from '../editor/catalog'

const entries = createEditorCatalog(createDefaultRobotCatalog())

describe('EditorCatalogPanel', () => {
  it('lists catalog equipment and emits the kind on insert', async () => {
    const wrapper = mount(EditorCatalogPanel, { props: { entries } })
    const buttons = wrapper.findAll('button')
    expect(buttons.map((b) => b.text())).toEqual(expect.arrayContaining(['CNC', 'Conveyor', 'Robot (medium 6-axis)', 'Pallet station', 'Safety zone']))

    await wrapper.find('[data-kind="cnc"]').trigger('click')
    expect(wrapper.emitted('insert')?.[0]).toEqual(['cnc'])
  })
})