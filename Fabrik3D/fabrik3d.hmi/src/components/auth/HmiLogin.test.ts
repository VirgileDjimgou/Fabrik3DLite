import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import HmiLogin from './HmiLogin.vue'
import { i18n } from '@/i18n'

const fetchAuthConfig = vi.fn()
const devLogin = vi.fn()
const bootstrap = vi.fn()
const beginOidcLogin = vi.fn()

vi.mock('@/auth/authService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/auth/authService')>()
  return {
    ...actual,
    fetchAuthConfig: (...args: unknown[]) => fetchAuthConfig(...args),
    devLogin: (...args: unknown[]) => devLogin(...args),
    bootstrap: (...args: unknown[]) => bootstrap(...args),
    beginOidcLogin: (...args: unknown[]) => beginOidcLogin(...args),
  }
})

const oidcConfig = {
  mode: 'Oidc',
  developmentAuth: false,
  publicDemoEnabled: false,
  roles: ['Learner', 'Instructor', 'Engineer', 'Operator', 'Administrator'],
  warning: null,
  oidc: {
    authority: 'https://idp.example.test/realms/demo',
    clientId: 'fabrik3d-hmi',
    scopes: ['openid'],
    redirectPath: '/auth/callback',
    postLogoutRedirectPath: '/',
    endSessionEnabled: true,
  },
}

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

  it('offers the OIDC sign-in button only in OIDC mode and starts the PKCE redirect', async () => {
    fetchAuthConfig.mockResolvedValue(oidcConfig)
    const wrapper = mount(HmiLogin, { global: { plugins: [i18n] } })
    await flushPromises()

    // Test/Demo form is not shown; the provider button is.
    expect(wrapper.find('#hmi-login-subject').exists()).toBe(false)
    const button = wrapper.get('[data-testid="hmi-login-oidc"]')
    await button.trigger('click')

    expect(beginOidcLogin).toHaveBeenCalledTimes(1)
  })

  it('does not offer the OIDC button in Test/Demo mode', async () => {
    const wrapper = mount(HmiLogin, { global: { plugins: [i18n] } })
    await flushPromises()

    expect(wrapper.find('[data-testid="hmi-login-oidc"]').exists()).toBe(false)
    expect(wrapper.find('#hmi-login-subject').exists()).toBe(true)
  })
})
