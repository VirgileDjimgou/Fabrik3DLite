import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import HmiConfirmationDialog from './HmiConfirmationDialog.vue'

const props = {
  open: true,
  title: 'Confirm',
  message: 'Proceed?',
  targetLabel: 'Target job',
  target: 'Job 42',
  confirmLabel: 'Start',
  cancelLabel: 'Cancel',
}

describe('HmiConfirmationDialog', () => {
  it('names the target and exposes confirm/cancel controls', async () => {
    const wrapper = mount(HmiConfirmationDialog, { props })
    expect(wrapper.get('[role="dialog"]').text()).toContain('Job 42')
    await wrapper.get('.btn-hmi').trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })

  it('is an accessible modal that describes its message and target', () => {
    const wrapper = mount(HmiConfirmationDialog, { props })
    const dialog = wrapper.get('[role="dialog"]')
    expect(dialog.attributes('aria-modal')).toBe('true')
    expect(dialog.attributes('aria-labelledby')).toBe('hmi-confirm-title')
    expect(dialog.attributes('aria-describedby')).toBe('hmi-confirm-message')
    expect(wrapper.get('#hmi-confirm-message').text()).toContain('Proceed?')
    expect(wrapper.get('[data-testid="confirm-target"]').text()).toBe('Job 42')
  })

  it('cancels on Escape and focuses the confirm action when opened', async () => {
    const wrapper = mount(HmiConfirmationDialog, { props: { ...props, open: false }, attachTo: document.body })
    await wrapper.setProps({ open: true })
    await wrapper.vm.$nextTick()

    expect(document.activeElement).toBe(wrapper.get('.btn-hmi').element)

    await wrapper.get('[role="dialog"]').trigger('keydown.esc')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    wrapper.unmount()
  })
})
