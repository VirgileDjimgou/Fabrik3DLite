import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import InstructorMetricsPanel from './InstructorMetricsPanel.vue'
import { i18n } from '@/i18n'
import { makeMetrics } from '@/instructor/dashboardFixtures'

describe('InstructorMetricsPanel', () => {
  it('renders the documented metric cards and ranked tables', () => {
    const wrapper = mount(InstructorMetricsPanel, {
      props: { metrics: makeMetrics(), loading: false, error: null },
      global: { plugins: [i18n] },
    })

    expect(wrapper.get('[data-testid="metric-completionRate"]').text()).toContain('75%')
    expect(wrapper.get('[data-testid="metric-safetyViolations"]').text()).toContain('1')
    expect(wrapper.get('[data-testid="ranking-incorrect"]').text()).toContain('WRONG_GRIP')
    expect(wrapper.get('[data-testid="ranking-safety"]').text()).toContain('guard-door-open')
    expect(wrapper.find('[data-testid="metrics-truncated"]').exists()).toBe(false)
  })

  it('warns when the bounded query was truncated', () => {
    const wrapper = mount(InstructorMetricsPanel, {
      props: { metrics: makeMetrics({ truncated: true }), loading: false, error: null },
      global: { plugins: [i18n] },
    })
    expect(wrapper.get('[data-testid="metrics-truncated"]').text().length).toBeGreaterThan(0)
  })

  it('shows an empty state when no session matches the filters', () => {
    const wrapper = mount(InstructorMetricsPanel, {
      props: { metrics: makeMetrics({ sessionCount: 0 }), loading: false, error: null },
      global: { plugins: [i18n] },
    })
    expect(wrapper.find('[data-testid="metrics-empty"]').exists()).toBe(true)
  })

  it('shows an explicit error state instead of stale numbers', () => {
    const wrapper = mount(InstructorMetricsPanel, {
      props: { metrics: null, loading: false, error: 'offline' },
      global: { plugins: [i18n] },
    })
    expect(wrapper.find('[data-testid="metrics-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="metrics-cards"]').exists()).toBe(false)
  })
})
