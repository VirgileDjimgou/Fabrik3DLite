import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import HmiGauge from './HmiGauge.vue'

describe('HmiGauge', () => {
  it('exposes the value as an accessible image instead of decorative graphics only', () => {
    const wrapper = mount(HmiGauge, { props: { value: 42, label: 'Progress' } })
    const svg = wrapper.get('svg')
    expect(svg.attributes('role')).toBe('img')
    expect(svg.attributes('aria-label')).toBe('Progress 42%')
  })

  it('clamps out-of-range values and falls back to a bare percentage label', () => {
    const wrapper = mount(HmiGauge, { props: { value: 140 } })
    expect(wrapper.get('svg').attributes('aria-label')).toBe('100%')
  })
})
