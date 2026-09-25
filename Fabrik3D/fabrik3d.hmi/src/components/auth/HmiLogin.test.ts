import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import HmiLogin from './HmiLogin.vue'
import { i18n } from '@/i18n'

const fetchAuthConfig = vi.fn()
const devLogin = vi.fn()
const bootstrap = vi.fn()

vi.mock('@/auth/authService', () => ({
  fetchAuthConfig: (...args: unknown[]) => fetchAuthConfig(...args),
  devLogin: (...args: unknown[]) => devLogin(...args),
  bootstrap: (...args: unknown[]) => bootstrap(...args),
}))

describe('HmiLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchAuthConfig.mockResolvedValue({
      mode: 'Test',
      developmentAuth: true,
      publicDemoEnabled: false,
      roles: ['Learner', 'Instructor', 'Engineer', 'Operator', 'Administrator'],
      warning: 'TEST AUTHENTICATION — NOT PRODUCTION SECURITY',
    })
    devLogin.mockResolvedValue({ subject: 'alice', roles: ['Operator'], mode: 'Test' })
  })

  it('prominently labels development/test authentication and never as production', async () => {
    const wrapper = mount(HmiLogin, { global: { plugins: [i18n] } })
    await flushPromises()

    const banner = wrapper.get('[data-testid="dev-auth-banner"]')
    expect(banner.text()).toContain('NOT PRODUCTION SECURITY')
    expect(banner.attributes('role')).toBe('alert')
  })

  it('submits the selected role and subject to the guarded server endpoint', async () => {
    const wrapper = mount(HmiLogin, { global: { plugins: [i18n] } })
    await flushPromises()

    await wrapper.get('#hmi-login-subject').setValue('alice')
    await wrapper.get('#hmi-login-role').setValue('Engineer')
    await wrapper.get('[data-testid="hmi-login-submit"]').trigger('submit')

    expect(devLogin).toHaveBeenCalledWith('Engineer', 'alice')
  })

  it('shows an explicit error instead of inventing a session when sign-in fails', async () => {
    devLogin.mockRejectedValue(Object.assign(new Error('denied'), { status: 403 }))
    const wrapper = mount(HmiLogin, { global: { plugins: [i18n] } })
    await flushPromises()

    await wrapper.get('#hmi-login-subject').setValue('mallory')
    await wrapper.get('[data-testid="hmi-login-submit"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="hmi-login-error"]').text().length).toBeGreaterThan(0)
  })
})
