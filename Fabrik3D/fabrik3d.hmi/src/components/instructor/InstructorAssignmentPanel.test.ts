import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import InstructorAssignmentPanel from './InstructorAssignmentPanel.vue'
import { i18n } from '@/i18n'
import { makeAssignment } from '@/instructor/dashboardFixtures'

const baseProps = {
  classId: 'class-1',
  scenarioOptions: ['pick-and-place'],
  loading: false,
  error: null,
  pending: false,
  feedback: null,
}

describe('InstructorAssignmentPanel', () => {
  it('lists assignments and emits an unassign action by id', async () => {
    const wrapper = mount(InstructorAssignmentPanel, {
      props: { ...baseProps, assignments: [makeAssignment()] },
      global: { plugins: [i18n] },
    })

    expect(wrapper.get('[data-testid="assignments-list"]').text()).toContain('pick-and-place')
    await wrapper.get('[data-testid="unassign-assignment-1"]').trigger('click')
    expect(wrapper.emitted('unassign')?.[0]).toEqual(['assignment-1'])
  })

  it('emits an assign action with the chosen kind and resource id', async () => {
    const wrapper = mount(InstructorAssignmentPanel, {
      props: { ...baseProps, assignments: [] },
      global: { plugins: [i18n] },
    })

    await wrapper.get('[data-testid="assignment-kind"]').setValue('CellTemplate')
    await wrapper.get('[data-testid="assignment-resource"]').setValue('cnc-cell')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('assign')?.[0]).toEqual([{ kind: 'CellTemplate', resourceId: 'cnc-cell' }])
  })

  it('shows an empty state when the class has no assignments', () => {
    const wrapper = mount(InstructorAssignmentPanel, {
      props: { ...baseProps, assignments: [] },
      global: { plugins: [i18n] },
    })
    expect(wrapper.find('[data-testid="assignments-empty"]').exists()).toBe(true)
  })
})
