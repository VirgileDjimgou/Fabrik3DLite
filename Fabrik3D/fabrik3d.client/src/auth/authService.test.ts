import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  beginOidcLogin,
  bootstrap,
  completeOidcLogin,
  isOidcCallbackUrl,
  isOidcMode,
  oidcLogout,
  refreshIdentity,
} from './authService'
import { clearSession, getAccessToken, identity, sessionExpired, setSession } from './authStore'
import type { AuthConfig } from './authTypes'
import type { CryptoProvider } from './oidcPkce'

const VERIFIER_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'

function fixedCrypto(verifier: string): CryptoProvider {
  return {
    randomBytes(length) {
      const out = new Uint8Array(length)
      for (let index = 0; index < length; index += 1) {
        out[index] = VERIFIER_ALPHABET.indexOf(verifier[index % verifier.length]!)
      }
      return out
    },
    sha256: (data) => Promise.resolve(new Uint8Array(createHash('sha256').update(data).digest())),
  }
}

const oidcConfig: AuthConfig = {
  mode: 'Oidc',
  developmentAuth: false,
  publicDemoEnabled: false,
  roles: ['Operator', 'Engineer'],
  warning: null,
  oidc: {
    authority: 'https://idp.example.test/realms/demo',
    clientId: 'fabrik3d-simulator',
    scopes: ['openid', 'profile'],
    redirectPath: '/auth/callback',
    postLogoutRedirectPath: '/',
    endSessionEnabled: true,
  },
}

const testConfig: AuthConfig = {
  mode: 'Test',
  developmentAuth: true,
  publicDemoEnabled: false,
  roles: ['Operator'],
  warning: 'Development authentication',
}

const discovery = {
  issuer: 'https://idp.example.test/realms/demo',
  authorization_endpoint: 'https://idp.example.test/authorize',
  token_endpoint: 'https://idp.example.test/token',
  end_session_endpoint: 'https://idp.example.test/logout',
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

function oidcFetch(overrides: { me?: unknown; meStatus?: number } = {}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('.well-known/openid-configuration')) return jsonResponse(discovery)
    if (url === discovery.token_endpoint) {
      return jsonResponse({ access_token: 'opaque-access-token', token_type: 'Bearer', expires_in: 300, id_token: 'id-token-1' })
    }
    if (url.endsWith('/api/auth/me')) {
      if (overrides.meStatus && overrides.meStatus >= 400) return jsonResponse({ code: 'unauthorized' }, overrides.meStatus)
      return jsonResponse(overrides.me ?? {
        subject: 'sim-operator',
        name: 'Sim Operator',
        roles: ['Engineer'],
        organizationId: 'org-1',
        organizationName: 'Org One',
      })
    }
    throw new Error(`unexpected fetch: ${url}`)
  }) as unknown as typeof fetch
}

describe('simulator auth service OIDC lifecycle', () => {
  beforeEach(() => {
    clearSession()
    sessionStorage.clear()
    vi.stubGlobal('fetch', oidcFetch())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    clearSession()
    sessionStorage.clear()
  })

  it('distinguishes OIDC mode from Test/Demo authentication', () => {
    expect(isOidcMode(oidcConfig)).toBe(true)
    expect(isOidcMode(testConfig)).toBe(false)
    expect(isOidcMode(null)).toBe(false)
    expect(isOidcMode({ ...oidcConfig, oidc: null })).toBe(false)
  })

  it('starts Authorization Code + PKCE and persists only the verifier and state', async () => {
    const navigate = vi.fn()
    const storage = window.sessionStorage

    await beginOidcLogin({
      config: oidcConfig,
      crypto: fixedCrypto('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
      navigate,
      origin: 'https://sim.example.test',
      storage,
    })

    const target = new URL(navigate.mock.calls[0]![0] as string)
    expect(target.origin + target.pathname).toBe('https://idp.example.test/authorize')
    expect(target.searchParams.get('code_challenge_method')).toBe('S256')
    expect(target.searchParams.get('redirect_uri')).toBe('https://sim.example.test/auth/callback')
    expect(storage.getItem('fabrik3d.auth.pkce.verifier')).toBeTruthy()
    expect(storage.getItem('fabrik3d.auth.pkce.state')).toBe(target.searchParams.get('state'))
    expect(getAccessToken()).toBeNull()
  })

  it('refuses to start OIDC when the server is not in OIDC mode', async () => {
    await expect(beginOidcLogin({ config: testConfig, navigate: vi.fn() })).rejects.toThrow('oidc_not_configured')
  })

  it('completes the callback, exchanges the code and re-reads authoritative roles', async () => {
    const storage = window.sessionStorage
    storage.setItem('fabrik3d.auth.pkce.verifier', 'verifier-1')
    storage.setItem('fabrik3d.auth.pkce.state', 'state-1')

    const result = await completeOidcLogin({
      config: oidcConfig,
      url: 'https://sim.example.test/auth/callback?code=code-1&state=state-1',
      origin: 'https://sim.example.test',
      storage,
    })

    expect(result.subject).toBe('sim-operator')
    expect(result.roles).toEqual(['Engineer'])
    expect(getAccessToken()).toBe('opaque-access-token')
    expect(storage.getItem('fabrik3d.auth.pkce.verifier')).toBeNull()
  })

  it('rejects a callback with a mismatched CSRF state without exchanging the code', async () => {
    const storage = window.sessionStorage
    storage.setItem('fabrik3d.auth.pkce.verifier', 'verifier-1')
    storage.setItem('fabrik3d.auth.pkce.state', 'expected-state')
    const fetchImpl = oidcFetch()
    vi.stubGlobal('fetch', fetchImpl)

    await expect(completeOidcLogin({
      config: oidcConfig,
      url: 'https://sim.example.test/auth/callback?code=code-1&state=attacker-state',
      origin: 'https://sim.example.test',
      storage,
    })).rejects.toThrow('oidc_invalid_callback')

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(getAccessToken()).toBeNull()
  })

  it('surfaces a provider error instead of falling back to anonymous access', async () => {
    const storage = window.sessionStorage
    storage.setItem('fabrik3d.auth.pkce.verifier', 'verifier-1')
    storage.setItem('fabrik3d.auth.pkce.state', 'state-1')

    await expect(completeOidcLogin({
      config: oidcConfig,
      url: 'https://sim.example.test/auth/callback?error=access_denied&state=state-1',
      origin: 'https://sim.example.test',
      storage,
    })).rejects.toThrow('oidc_access_denied')

    expect(getAccessToken()).toBeNull()
  })

  it('clears the session when the server rejects the freshly exchanged token', async () => {
    const storage = window.sessionStorage
    storage.setItem('fabrik3d.auth.pkce.verifier', 'verifier-1')
    storage.setItem('fabrik3d.auth.pkce.state', 'state-1')
    vi.stubGlobal('fetch', oidcFetch({ meStatus: 401 }))

    await expect(completeOidcLogin({
      config: oidcConfig,
      url: 'https://sim.example.test/auth/callback?code=code-1&state=state-1',
      origin: 'https://sim.example.test',
      storage,
    })).rejects.toThrow()

    expect(getAccessToken()).toBeNull()
    expect(sessionExpired.value).toBe(true)
  })

  it('refreshes roles and organization from the server (role change)', async () => {
    setSession('opaque-access-token', { subject: 'sim-operator', name: 'Sim', roles: ['Operator'], mode: 'server' }, Date.now() + 300_000)

    const next = await refreshIdentity()

    expect(next?.roles).toEqual(['Engineer'])
    expect(identity.value?.roles).toEqual(['Engineer'])
    expect(identity.value?.organizationName).toBe('Org One')
  })

  it('performs RP-initiated logout when the provider supports it and clears the session', async () => {
    setSession('opaque-access-token', { subject: 'sim-operator', roles: ['Engineer'], mode: 'server' }, Date.now() + 300_000)
    const navigate = vi.fn()

    await oidcLogout({ config: oidcConfig, navigate, origin: 'https://sim.example.test' })

    expect(getAccessToken()).toBeNull()
    const target = new URL(navigate.mock.calls[0]![0] as string)
    expect(target.origin + target.pathname).toBe('https://idp.example.test/logout')
    expect(target.searchParams.get('post_logout_redirect_uri')).toBe('https://sim.example.test/')
  })

  it('degrades to a local logout in Test/Demo mode', async () => {
    setSession('dev-token', { subject: 'bob', roles: ['Operator'], mode: 'Test' })
    const navigate = vi.fn()

    await oidcLogout({ config: testConfig, navigate })

    expect(getAccessToken()).toBeNull()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('recognizes only the configured callback path', () => {
    expect(isOidcCallbackUrl('https://sim.example.test/auth/callback?code=x&state=y', oidcConfig)).toBe(true)
    expect(isOidcCallbackUrl('https://sim.example.test/other?code=x', oidcConfig)).toBe(false)
    expect(isOidcCallbackUrl('https://sim.example.test/auth/callback', oidcConfig)).toBe(false)
    expect(isOidcCallbackUrl('https://sim.example.test/auth/callback?code=x', testConfig)).toBe(false)
  })

  it('marks an expired persisted session explicitly on bootstrap', async () => {
    const expired = `${btoa(JSON.stringify({ alg: 'none' }))}.${btoa(JSON.stringify({ sub: 'u', exp: 1 }))}.sig`
    sessionStorage.setItem('fabrik3d.auth.token', expired)
    sessionStorage.setItem('fabrik3d.auth.identity', JSON.stringify({ subject: 'u', roles: ['Operator'], mode: 'Test' }))

    await bootstrap()

    expect(sessionExpired.value).toBe(true)
    expect(getAccessToken()).toBeNull()
  })
})
