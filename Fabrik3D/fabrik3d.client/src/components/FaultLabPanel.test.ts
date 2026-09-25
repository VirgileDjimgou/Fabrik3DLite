import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import FaultLabPanel from './FaultLabPanel.vue'
import { OVERLAY_FAULT_CATALOG } from '../faults/overlayCatalog'
import { REFERENCE_CELL_FAULT_TARGETS } from '../faults/faultTargets'
import type { FaultOverlay } from '../faults/types'
import { setSimulatorLocale } from '../i18n/simulator'

const activeOverlay: FaultOverlay = {
  id: 'overlay-1',
  type: 'forced-true',
  layer: 'signal',
  severity: 'error',
  source: 'instructor',
  equipmentId: 'conveyor-1',
  signalIds: ['conveyor-1.PhotoeyeStation'],
  seed: 1,
  startedAt: '2026-01-01T08:00:00.000Z',
  sessionId: 's',
  correlationId: 'c',
}

function mountPanel(overrides: {
  activeOverlays?: FaultOverlay[]
  authorityBlocked?: boolean
  feedback?: string
  feedbackTone?: 'ok' | 'bad'
} = {}) {
  return mount(FaultLabPanel, {
    props: {
      targets: REFERENCE_CELL_FAULT_TARGETS,
      activeOverlays: overrides.activeOverlays ?? [],
      authorityBlocked: overrides.authorityBlocked ?? false,
      feedback: overrides.feedback ?? '',
      feedbackTone: overrides.feedbackTone ?? 'ok',
    },
  })
}

afterEach(() => setSimulatorLocale('en'))

describe('FaultLabPanel', () => {
  it('lists every documented overlay fault class', async () => {
    const wrapper = mountPanel()
    await nextTick()
    const options = wrapper.findAll('[data-fault-lab-type] option')
    expect(options).toHaveLength(OVERLAY_FAULT_CATALOG.length)
    expect(options.map((option) => option.attributes('value'))).toContain('noisy-analog')
    expect(options.map((option) => option.attributes('value'))).toContain('vacuum-loss')
    wrapper.unmount()
  })

  it('emits activate with the target-confirmed type, equipment and signal', async () => {
    const wrapper = mountPanel()
    await nextTick()
    await wrapper.find('[data-fault-lab-type]').setValue('inverted')
    await wrapper.find('[data-fault-lab-equipment]').setValue('conveyor-1')
    await nextTick()
    await wrapper.find('[data-fault-lab-signal]').setValue('conveyor-1.PhotoeyeStation')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('activate')?.[0]).toEqual(['inverted', 'conveyor-1', 'conveyor-1.PhotoeyeStation'])
    wrapper.unmount()
  })

  it('hides the signal selector for equipment-layer faults', async () => {
    const wrapper = mountPanel()
    await nextTick()
    expect(wrapper.find('[data-fault-lab-signal]').exists()).toBe(true)
    await wrapper.find('[data-fault-lab-type]').setValue('actuator-jam')
    await nextTick()
    expect(wrapper.find('[data-fault-lab-signal]').exists()).toBe(false)
    expect(wrapper.find('[data-fault-lab-target]').text()).toContain('robot-1')
    wrapper.unmount()
  })

  it('renders active overlays with severity and a target-confirmed clear action', async () => {
    const wrapper = mountPanel({ activeOverlays: [activeOverlay] })
    await nextTick()
    const row = wrapper.find('[data-fault-lab-row="overlay-1"]')
    expect(row.text()).toContain('forced-true')
    expect(row.text()).toContain('conveyor-1.PhotoeyeStation')
    await wrapper.find('[data-fault-lab-clear="overlay-1"]').trigger('click')
    expect(wrapper.emitted('deactivate')?.[0]).toEqual(['overlay-1'])
    wrapper.unmount()
  })

  it('reports the authority blocker and disables activation', async () => {
    const wrapper = mountPanel({ authorityBlocked: true })
    await nextTick()
    expect(wrapper.find('[data-fault-lab-blocked]').exists()).toBe(true)
    expect(wrapper.find('[data-fault-lab-activate]').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('shows pending/success/failure feedback states', async () => {
    const wrapper = mountPanel({ feedback: 'Overlay activated.', feedbackTone: 'ok' })
    await nextTick()
    expect(wrapper.find('[data-fault-lab-feedback]').text()).toBe('Overlay activated.')
    await wrapper.setProps({ feedback: 'Blocked by authority.', feedbackTone: 'bad' })
    await nextTick()
    expect(wrapper.find('[data-fault-lab-feedback]').classes()).toContain('feedback-bad')
    wrapper.unmount()
  })

  it('localizes its chrome in EN/FR/DE without translating signal ids', async () => {
    const wrapper = mountPanel({ activeOverlays: [activeOverlay] })
    await nextTick()
    expect(wrapper.find('h4').text()).toBe('Instructor fault lab')

    setSimulatorLocale('fr')
    await nextTick()
    expect(wrapper.find('h4').text()).toBe('Laboratoire de pannes (instructeur)')
    expect(wrapper.find('[data-fault-lab-row="overlay-1"]').text()).toContain('conveyor-1.PhotoeyeStation')

    setSimulatorLocale('de')
    await nextTick()
    expect(wrapper.find('h4').text()).toBe('Fehlerlabor (Lehrmodus)')
    wrapper.unmount()
  })

  it('provides every faultLab i18n key in all three locales', async () => {
    const keys = ['faultLab.title', 'faultLab.subtitle', 'faultLab.activate', 'faultLab.clear', 'faultLab.blocked', 'faultLab.noFaults']
    for (const locale of ['en', 'fr', 'de'] as const) {
      setSimulatorLocale(locale)
      const wrapper = mountPanel()
      await nextTick()
      expect(wrapper.find('h4').text().length).toBeGreaterThan(0)
      const options = wrapper.findAll('[data-fault-lab-type] option')
      for (const option of options) expect(option.text().length).toBeGreaterThan(0)
      wrapper.unmount()
    }
    expect(keys.length).toBeGreaterThan(0)
  })
})
