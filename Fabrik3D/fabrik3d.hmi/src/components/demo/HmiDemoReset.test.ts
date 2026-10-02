import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import HmiDemoReset from './HmiDemoReset.vue'
import { i18n } from '@/i18n'

const fetchAuthConfig = vi.fn()
const resetDemo = vi.fn()
const canOperate = vi.fn()

vi.mock('@/auth/authService', () => ({
  fetchAuthConfig: (...args: unknown[]) => fetchAuthConfig(...args),
}))
vi.mock('@/services/api', () => ({
  resetDemo: (...args: unknown[]) => resetDemo(...args),
}))
vi.mock('@/auth/authStore', () => ({
  canOperate: () => canOperate(),
}))

function config(demoResetEnabled: boolean) {
  return {
    mode: 'Test',
    developmentAuth: true,
    publicDemoEnabled: true,
    roles: ['Operator'],
    warning: null,
    demoResetEnabled,
  }
}

describe('HmiDemoReset', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    canOperate.mockReturnValue(true)
    fetchAuthConfig.mockResolvedValue(config(true))
    resetDemo.mockResolvedValue({ resetAtUtc: '2026-01-01T00:00:00Z', actorId: 'op', organizationId: 'org', counts: {} })
  })

  it('stays hidden when the deployment does not enable the demo profile', async () => {
    fetchAuthConfig.mockResolvedValue(config(false))
    const wrapper = mount(HmiDemoReset, { global: { plugins: [i18n] } })
    await flushPromises()

    expect(wrapper.find('[data-testid="hmi-demo-reset"]').exists()).toBe(false)
  })

  it('stays hidden for a read-only identity even when the demo profile is enabled', async () => {
    canOperate.mockReturnValue(false)
    const wrapper = mount(HmiDemoReset, { global: { plugins: [i18n] } })
    await flushPromises()

    expect(wrapper.find('[data-testid="hmi-demo-reset"]').exists()).toBe(false)
  })

  it('confirms the target, resets and reports success', async () => {
    const wrapper = mount(HmiDemoReset, { global: { plugins: [i18n] } })
    await flushPromises()

    await wrapper.get('[data-testid="hmi-demo-reset-button"]').trigger('click')
    // The confirmation identifies the target before the destructive action.
    expect(wrapper.get('[data-testid="confirm-target"]').text()).toBe('public-demo')

    await wrapper.get('.hmi-confirm .btn-hmi').trigger('click')
    await flushPromises()

    expect(resetDemo).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="hmi-demo-reset-success"]').exists()).toBe(true)
  })

  it('reports failure explicitly and never claims success', async () => {
    resetDemo.mockRejectedValue(new Error('server error'))
    const wrapper = mount(HmiDemoReset, { global: { plugins: [i18n] } })
    await flushPromises()

    await wrapper.get('[data-testid="hmi-demo-reset-button"]').trigger('click')
    await wrapper.get('.hmi-confirm .btn-hmi').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="hmi-demo-reset-success"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="hmi-demo-reset-failure"]').exists()).toBe(true)
  })
})
