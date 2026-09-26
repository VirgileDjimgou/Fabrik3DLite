import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import InstructorSessionList from './InstructorSessionList.vue'
import { i18n } from '@/i18n'
import { makeSession } from '@/instructor/dashboardFixtures'

const NOW = Date.parse('2026-09-20T10:10:00Z')

describe('InstructorSessionList', () => {
  it('renders sessions with status, elapsed time and server score', () => {
    const wrapper = mount(InstructorSessionList, {
      props: {
        sessions: [
          makeSession(),
          makeSession({ id: 'session-2', alias: null, learnerSubject: 'learner-2', status: 'running', endedAtUtc: null, assessmentStatus: 'Pending', assessment: undefined, score: 0 }),
        ],
        selectedId: 'session-1',
        loading: false,
        error: null,
        now: NOW,
      },
      global: { plugins: [i18n] },
    })

    expect(wrapper.findAll('[data-testid^="session-row-"]')).toHaveLength(2)
    expect(wrapper.text()).toContain('100/100')
    // A running session has no assessment yet; it must not show a fabricated score.
    expect(wrapper.get('[data-testid="session-row-session-2"]').text()).not.toContain('0/0')
  })

  it('selects a session by mouse and keyboard for accessible navigation', async () => {
    const wrapper = mount(InstructorSessionList, {
      props: { sessions: [makeSession()], selectedId: '', loading: false, error: null, now: NOW },
      global: { plugins: [i18n] },
    })

    await wrapper.get('[data-testid="session-row-session-1"]').trigger('click')
    await wrapper.get('[data-testid="session-row-session-1"]').trigger('keydown.enter')
    expect(wrapper.emitted('select')).toHaveLength(2)
  })

  it('shows an explanatory empty state', () => {
    const wrapper = mount(InstructorSessionList, {
      props: { sessions: [], selectedId: '', loading: false, error: null, now: NOW },
      global: { plugins: [i18n] },
    })
    expect(wrapper.find('[data-testid="sessions-empty"]').exists()).toBe(true)
  })
})
