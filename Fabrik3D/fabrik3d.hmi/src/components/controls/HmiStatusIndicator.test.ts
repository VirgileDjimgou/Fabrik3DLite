import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import HmiStatusIndicator, { type HmiVisualState } from './HmiStatusIndicator.vue'
describe('HmiStatusIndicator', () => {
  it.each(['normal', 'loading', 'pending', 'success', 'warning', 'fault', 'disabled', 'offline'] as HmiVisualState[])('renders %s state semantically', state => {
    const wrapper = mount(HmiStatusIndicator, { props: { state, label: state } })
    expect(wrapper.attributes('role')).toBe('status')
    expect(wrapper.classes()).toContain(`hmi-status--${state}`)
    expect(wrapper.text()).toContain(state)
  })
})
