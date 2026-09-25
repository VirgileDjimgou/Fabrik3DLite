import { afterEach, describe, expect, it, vi } from 'vitest'
import { getJobs } from './api'
import { clearSession, getAccessToken, sessionExpired, setSession } from '@/auth/authStore'

function base64Url(value: Record<string, unknown>): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function token(expSecondsFromNow = 3600): string {
  return `${base64Url({ alg: 'HS256' })}.${base64Url({
    sub: 'test-operator',
    role: 'Operator',
    exp: Math.floor(Date.now() / 1000) + expSecondsFromNow,
  })}.sig`
}

describe('orchestrator API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    clearSession()
    sessionStorage.clear()
  })

  it('returns a useful error when the orchestrator rejects a request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Service unavailable', { status: 503 })))

    await expect(getJobs()).rejects.toThrow('[503] GET /jobs: Service unavailable')
  })

  it('preserves the normalized API error code and validation details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 'validation_failed',
      message: 'One or more request fields are invalid.',
      status: 400,
      details: { name: ['The Name field is required.'] },
    }), { status: 400 })))

    await expect(getJobs()).rejects.toMatchObject({
      code: 'validation_failed',
      status: 400,
      details: { name: ['The Name field is required.'] },
    })
  })

  it('attaches the access token as a bearer header', async () => {
    setSession(token(), { subject: 'test-operator', roles: ['Operator'], mode: 'Test' })
    const fetchMock = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await getJobs()

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>
    expect(headers.Authorization).toMatch(/^Bearer /)
  })

  it('marks the session expired when the server rejects an attached token', async () => {
    setSession(token(), { subject: 'test-operator', roles: ['Operator'], mode: 'Test' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 'unauthorized', message: 'Authentication is required for this operation.', status: 401,
    }), { status: 401 })))

    await expect(getJobs()).rejects.toMatchObject({ code: 'unauthorized', status: 401 })

    expect(sessionExpired.value).toBe(true)
    expect(getAccessToken()).toBeNull()
  })
})
