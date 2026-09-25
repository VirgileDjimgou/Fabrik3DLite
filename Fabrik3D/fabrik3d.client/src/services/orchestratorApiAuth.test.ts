import { afterEach, describe, expect, it, vi } from 'vitest'
import { getJobs } from './orchestratorApi'
import { clearSession, getAccessToken, sessionExpired, setSession } from '@/auth/authStore'

function base64Url(value: Record<string, unknown>): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function token(): string {
  return `${base64Url({ alg: 'HS256' })}.${base64Url({
    sub: 'sim-operator',
    role: 'Operator',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.sig`
}

describe('orchestrator API authentication', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    clearSession()
    sessionStorage.clear()
  })

  it('attaches the bearer token to simulator requests', async () => {
    setSession(token(), { subject: 'sim-operator', roles: ['Operator'], mode: 'Test' })
    const fetchMock = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await getJobs()

    const init = fetchMock.mock.calls[0]![1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toMatch(/^Bearer /)
  })

  it('requires explicit re-auth when the server rejects an attached token', async () => {
    setSession(token(), { subject: 'sim-operator', roles: ['Operator'], mode: 'Test' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 'unauthorized', message: 'Authentication is required for this operation.', status: 401,
    }), { status: 401 })))

    await expect(getJobs()).rejects.toMatchObject({ status: 401 })
    expect(sessionExpired.value).toBe(true)
    expect(getAccessToken()).toBeNull()
  })
})
