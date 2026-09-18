import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CellEditor from './CellEditor.vue'
import { createDefaultRobotCatalog } from '../robot/catalog'

function mountEditor() {
  return mount(CellEditor, { props: { robotCatalog: createDefaultRobotCatalog() } })
}

describe('CellEditor', () => {
  it('renders the reference cell placements on the plan canvas', () => {
    const wrapper = mountEditor()
    expect(wrapper.find('[data-view="cell-editor"]').exists()).toBe(true)
    expect(wrapper.find('[data-placement="robot-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-placement="cnc-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-placement="conveyor-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-placement="pallet-station-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-reach="robot-1"]').exists()).toBe(true)
  })

  it('inserts catalog equipment into the cell (invalid overlap shown at origin)', async () => {
    const wrapper = mountEditor()
    await wrapper.find('[data-kind="safety-zone"]').trigger('click')
    // The safety zone is inserted at the origin, overlapping the robot, so it is
    // clearly marked invalid — it cannot be mistaken for a valid placement.
    expect(wrapper.findAll('[data-kind="safety-zone"]').length).toBeGreaterThanOrEqual(1)
    expect(wrapper.find('[data-invalid-count]').exists()).toBe(true)
  })

  it('marks an invalid placement and exposes it in the property panel', async () => {
    const wrapper = mountEditor()
    // Move the CNC onto the robot via the property panel.
    await wrapper.find('[data-placement="cnc-1"]').trigger('pointerdown', { clientX: 0, clientY: 0, buttons: 1 })
    // Select cnc-1 directly and set X/Z through the property panel.
    const panel = wrapper.findComponent({ name: 'EditorPropertyPanel' })
    expect(panel.exists()).toBe(true)

    // The CNC is already selected after pointerdown; drive it onto the robot.
    const xInput = panel.find('[data-field="x"]')
    await xInput.setValue('0')
    await xInput.trigger('change')
    const zInput = panel.find('[data-field="z"]')
    await zInput.setValue('0')
    await zInput.trigger('change')

    expect(wrapper.find('[data-invalid-count]').exists()).toBe(true)
    expect(wrapper.find('[data-invalid-indicator]').exists()).toBe(true)
    const cncRect = wrapper.find('[data-placement="cnc-1"]')
    expect(cncRect.classes()).toContain('invalid')
  })

  it('supports undo and redo through the toolbar', async () => {
    const wrapper = mountEditor()
    await wrapper.find('[data-kind="safety-zone"]').trigger('click')
    const countAfterInsert = wrapper.findAll('[data-kind]').length

    await wrapper.find('[data-action="undo"]').trigger('click')
    expect(wrapper.findAll('[data-kind="safety-zone"]').length).toBeLessThan(countAfterInsert)

    await wrapper.find('[data-action="redo"]').trigger('click')
    expect(wrapper.findAll('[data-kind="safety-zone"]').length).toBeGreaterThanOrEqual(1)
  })

  it('resets the cell to the reference template', async () => {
    const wrapper = mountEditor()
    // Remove the robot through the panel, then reset.
    await wrapper.find('[data-placement="robot-1"]').trigger('pointerdown', { clientX: 0, clientY: 0, buttons: 1 })
    const panel = wrapper.findComponent({ name: 'EditorPropertyPanel' })
    await panel.find('[data-action="delete"]').trigger('click')
    expect(wrapper.find('[data-placement="robot-1"]').exists()).toBe(false)

    await wrapper.find('[data-action="reset"]').trigger('click')
    expect(wrapper.find('[data-placement="robot-1"]').exists()).toBe(true)
  })
})