import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import EditorPropertyPanel from './EditorPropertyPanel.vue'
import { createDefaultRobotCatalog } from '../robot/catalog'
import { buildReferencePlacements } from '../editor/referenceCell'
import { createEditorCatalog } from '../editor/catalog'

const placement = buildReferencePlacements(createEditorCatalog(createDefaultRobotCatalog()))[0]!

describe('EditorPropertyPanel', () => {
  it('shows numeric transform fields for the selected placement', () => {
    const wrapper = mount(EditorPropertyPanel, {
      props: { placement, invalid: false },
    })
    expect(wrapper.text()).toContain('Robot (medium 6-axis)')
    expect(wrapper.find('[data-field="x"]').element as HTMLInputElement).toHaveProperty('value', '0.000')
    expect(wrapper.find('[data-field="rotation"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Reach')
  })

  it('emits numeric transform updates', async () => {
    const wrapper = mount(EditorPropertyPanel, { props: { placement, invalid: false } })
    const xInput = wrapper.find('[data-field="x"]')
    await xInput.setValue('1.5')
    await xInput.trigger('change')
    expect(wrapper.emitted('update')?.[0]).toEqual(['x', 1.5])
  })

  it('shows a clear invalid-placement indicator', () => {
    const wrapper = mount(EditorPropertyPanel, { props: { placement, invalid: true } })
    expect(wrapper.find('[data-invalid-indicator]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Invalid placement')
  })

  it('emits delete for the selected placement', async () => {
    const wrapper = mount(EditorPropertyPanel, { props: { placement, invalid: false } })
    await wrapper.find('[data-action="delete"]').trigger('click')
    expect(wrapper.emitted('delete')).toHaveLength(1)
  })

  it('shows an empty state without a selection', () => {
    const wrapper = mount(EditorPropertyPanel, { props: { placement: null, invalid: false } })
    expect(wrapper.text()).toContain('No element selected')
  })
})