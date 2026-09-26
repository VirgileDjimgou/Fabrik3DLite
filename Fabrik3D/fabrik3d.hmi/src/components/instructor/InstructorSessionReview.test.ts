import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import InstructorSessionReview from './InstructorSessionReview.vue'
import { i18n } from '@/i18n'
import { makeAction, makeAssessment, makeSession } from '@/instructor/dashboardFixtures'

const baseProps = {
  actions: [
    makeAction({ id: 'x1', type: 'PICK_PART', correctness: 'correct', sequence: 1 }),
    makeAction({ id: 'x2', type: 'WRONG_GRIP', correctness: 'incorrect', sequence: 2 }),
  ],
  loading: false,
  error: null,
  restartPending: false,
  restartFeedback: null,
  now: Date.parse('2026-09-20T10:10:00Z'),
}

describe('InstructorSessionReview', () => {
  it('renders expected vs observed, evidence counters and server score evidence', () => {
    const wrapper = mount(InstructorSessionReview, {
      props: { ...baseProps, session: makeSession(), assessment: makeAssessment() },
      global: { plugins: [i18n] },
    })

    expect(wrapper.get('[data-testid="comparison-table"]').text()).toContain('PICK_PART')
    expect(wrapper.get('[data-testid="evidence-counters"]').text()).toContain('1')
    expect(wrapper.get('[data-testid="criteria-table"]').text()).toContain('Completion')
    expect(wrapper.get('[data-testid="educational-disclaimer"]').text()).toContain('does not certify')
  })

  it('requires an explicit target confirmation before restarting and emits the audit reason', async () => {
    const wrapper = mount(InstructorSessionReview, {
      props: { ...baseProps, session: makeSession(), assessment: makeAssessment() },
      global: { plugins: [i18n] },
    })

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    await wrapper.get('[data-testid="restart-reason"]').setValue('Second attempt')
    await wrapper.get('[data-testid="restart-open"]').trigger('click')

    const dialog = wrapper.get('[role="dialog"]')
    expect(dialog.text()).toContain('learner-one')
    expect(dialog.text()).toContain('pick-and-place')

    await dialog.get('.btn-hmi').trigger('click')
    expect(wrapper.emitted('restart')?.[0]).toEqual(['Second attempt'])
  })

  it('refuses to offer a restart for a running session', () => {
    const wrapper = mount(InstructorSessionReview, {
      props: {
        ...baseProps,
        session: makeSession({ status: 'running', endedAtUtc: null, assessmentStatus: 'Pending', assessment: undefined }),
        assessment: null,
      },
      global: { plugins: [i18n] },
    })

    expect(wrapper.find('[data-testid="restart-open"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="restart-unavailable"]').text().length).toBeGreaterThan(0)
    expect(wrapper.find('[data-testid="assessment-pending"]').exists()).toBe(true)
  })

  it('shows an empty state until a session is selected', () => {
    const wrapper = mount(InstructorSessionReview, {
      props: { ...baseProps, session: null, assessment: null },
      global: { plugins: [i18n] },
    })
    expect(wrapper.find('[data-testid="review-empty"]').exists()).toBe(true)
  })
})
