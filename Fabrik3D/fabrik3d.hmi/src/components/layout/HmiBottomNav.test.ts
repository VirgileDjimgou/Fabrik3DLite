import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import HmiBottomNav from './HmiBottomNav.vue'
import { i18n } from '@/i18n'

function mountNav() {
  return mount(HmiBottomNav, {
    global: {
      plugins: [i18n],
      stubs: { 'router-link': { template: '<a><slot /></a>' } },
      mocks: { $router: { back: vi.fn() } },
    },
  })
}

describe('HmiBottomNav', () => {
  it('is a labelled navigation landmark with keyboard-reachable controls', () => {
    const wrapper = mountNav()
    const nav = wrapper.get('nav')
    expect(nav.attributes('aria-label')).toBe('Primary navigation')
    expect(wrapper.findAll('a')).toHaveLength(6)
    expect(wrapper.findAll('button[type="button"]')).toHaveLength(3)
  })

  it('marks every decorative icon aria-hidden so only labels are announced', () => {
    const wrapper = mountNav()
    for (const icon of wrapper.findAll('i')) {
      expect(icon.attributes('aria-hidden')).toBe('true')
    }
  })
})
