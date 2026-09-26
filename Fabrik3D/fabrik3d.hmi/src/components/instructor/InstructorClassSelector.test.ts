import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import InstructorClassSelector from './InstructorClassSelector.vue'
import { i18n } from '@/i18n'
import { makeClass } from '@/instructor/dashboardFixtures'

describe('InstructorClassSelector', () => {
  it('lists classes and reports the selected class detail', async () => {
    const wrapper = mount(InstructorClassSelector, {
      props: { classes: [makeClass(), makeClass({ id: 'class-2', name: 'Cohort B', learnerSubjects: [] })], selectedId: 'class-1', loading: false, error: null },
      global: { plugins: [i18n] },
    })

    const options = wrapper.findAll('[data-testid="class-select"] option')
    expect(options.map((option) => option.text())).toContain('Cohort A')
    expect(wrapper.get('[data-testid="class-learner-count"]').text()).toBe('2')

    await wrapper.get('[data-testid="class-select"]').setValue('class-2')
    expect(wrapper.emitted('select')?.[0]).toEqual(['class-2'])
  })

  it('shows the empty state when the organization has no classes', () => {
    const wrapper = mount(InstructorClassSelector, {
      props: { classes: [], selectedId: '', loading: false, error: null },
      global: { plugins: [i18n] },
    })
    expect(wrapper.find('[data-testid="class-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="class-select"]').exists()).toBe(false)
  })

  it('shows a loading state before the class list resolves', () => {
    const wrapper = mount(InstructorClassSelector, {
      props: { classes: [], selectedId: '', loading: true, error: null },
      global: { plugins: [i18n] },
    })
    expect(wrapper.find('[data-testid="class-loading"]').exists()).toBe(true)
  })
})
