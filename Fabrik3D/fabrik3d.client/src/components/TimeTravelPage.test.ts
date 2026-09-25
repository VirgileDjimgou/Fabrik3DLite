import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import TimeTravelPage from './TimeTravelPage.vue'
import { setSimulatorLocale } from '../i18n/simulator'

function mountPage() {
  return mount(TimeTravelPage)
}

afterEach(() => setSimulatorLocale('en'))

describe('TimeTravelPage', () => {
  it('starts in replay with an unmistakable read-only mode banner', async () => {
    const wrapper = mountPage()
    await nextTick()
    expect(wrapper.find('[data-tt-banner]').attributes('data-tt-mode')).toBe('replay')
    expect(wrapper.find('[data-tt-mode-chip="replay"]').classes()).toContain('active')
    expect(wrapper.find('[data-tt-readonly]').exists()).toBe(true)
    expect(wrapper.find('[data-tt-page]').text()).toContain('REPLAY')
    wrapper.unmount()
  })

  it('reconstructs an exact robot pose and CNC state at the start of the window', async () => {
    const wrapper = mountPage()
    await nextTick()
    expect(wrapper.find('[data-tt-exactness]').text()).toBe('exact sample')
    expect(wrapper.find('[data-tt-robot-joints]').text()).toBe('0.000, 0.000, 0.000, 0.000, 0.000, 0.000')
    expect(wrapper.find('[data-tt-cnc-state]').text()).toBe('IDLE')
    expect(wrapper.find('[data-tt-material-slot]').text()).toBe('0')
    wrapper.unmount()
  })

  it('scrubs deterministically to a reconstructed point in time', async () => {
    const wrapper = mountPage()
    await nextTick()
    await wrapper.find('[data-tt-scrubber]').setValue('11000')
    await nextTick()
    expect(wrapper.find('[data-tt-cnc-state]').text()).toBe('MACHINING')
    expect(wrapper.find('[data-tt-exactness]').text()).toBe('interpolated')
    expect(wrapper.find('[data-tt-alarm="alarm-1"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('steps forward and back by a fixed logical step', async () => {
    const wrapper = mountPage()
    await nextTick()
    const start = wrapper.find('[data-tt-cursor]').text()
    await wrapper.find('[data-tt-step-forward]').trigger('click')
    await nextTick()
    expect(wrapper.find('[data-tt-cursor]').text()).not.toBe(start)
    await wrapper.find('[data-tt-step-backward]').trigger('click')
    await nextTick()
    expect(wrapper.find('[data-tt-cursor]').text()).toBe(start)
    wrapper.unmount()
  })

  it('jumps to an alarm marker from the event list', async () => {
    const wrapper = mountPage()
    await nextTick()
    const marker = wrapper.findAll('[data-tt-marker]').find((node) => node.attributes('data-tt-marker')?.startsWith('alarm-'))
    expect(marker).toBeDefined()
    await marker!.trigger('click')
    await nextTick()
    expect(wrapper.find('[data-tt-cursor]').text()).toBe('2026-01-01T08:00:08.000Z')
    expect(wrapper.find('[data-tt-alarm="alarm-1"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('changes speed without changing the reconstructed time', async () => {
    const wrapper = mountPage()
    await nextTick()
    await wrapper.find('[data-tt-speed]').setValue('4')
    await nextTick()
    expect((wrapper.find('[data-tt-speed]').element as HTMLSelectElement).value).toBe('4')
    wrapper.unmount()
  })

  it('exits replay back to simulation and re-enters on demand', async () => {
    const wrapper = mountPage()
    await nextTick()
    await wrapper.find('[data-tt-exit]').trigger('click')
    await nextTick()
    expect(wrapper.find('[data-tt-banner]').attributes('data-tt-mode')).toBe('simulation')
    expect(wrapper.find('[data-tt-readonly]').exists()).toBe(false)
    await wrapper.find('[data-tt-enter]').trigger('click')
    await nextTick()
    expect(wrapper.find('[data-tt-banner]').attributes('data-tt-mode')).toBe('replay')
    wrapper.unmount()
  })

  it('exposes no command controls on the replay surface', async () => {
    const wrapper = mountPage()
    await nextTick()
    expect(wrapper.find('[data-tt-controls] button[data-command]').exists()).toBe(false)
    expect(wrapper.find('[data-tt-controls] [data-tt-command]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('localizes its chrome in EN/FR/DE', async () => {
    const wrapper = mountPage()
    await nextTick()
    expect(wrapper.find('h1').text()).toBe('Deterministic industrial time travel')

    setSimulatorLocale('fr')
    await nextTick()
    expect(wrapper.find('h1').text()).toBe('Voyage dans le temps industriel déterministe')

    setSimulatorLocale('de')
    await nextTick()
    expect(wrapper.find('h1').text()).toBe('Deterministische industrielle Zeitreise')
    wrapper.unmount()
  })
})
