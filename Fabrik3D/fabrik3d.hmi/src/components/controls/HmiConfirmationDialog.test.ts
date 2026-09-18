import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import HmiConfirmationDialog from './HmiConfirmationDialog.vue'
describe('HmiConfirmationDialog', () => {
  it('names the target and exposes confirm/cancel controls', async () => {
    const wrapper = mount(HmiConfirmationDialog, { props: { open: true, title: 'Confirm', message: 'Proceed?', targetLabel: 'Target job', target: 'Job 42', confirmLabel: 'Start', cancelLabel: 'Cancel' } })
    expect(wrapper.get('[role="dialog"]').text()).toContain('Job 42')
    await wrapper.get('.btn-hmi').trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })
})
