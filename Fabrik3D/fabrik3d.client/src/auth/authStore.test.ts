import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearSession,
  getAccessToken,
  identityFromToken,
  isTokenExpired,
  notifyUnauthorized,
  onUnauthorized,
  restoreSession,
  sessionExpired,
  setSession,
} from './authStore'

function tokenWith(payload: Record<string, unknown>): string {
  const encode = (value: Record<string, unknown>) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`
}

const futureExp = () => Math.floor(Date.now() / 1000) + 3600
const pastExp = () => Math.floor(Date.now() / 1000) - 3600

describe('simulator auth store', () => {
  beforeEach(() => {
    clearSession()
    sessionStorage.clear()
  })

  it('reads identity claims from a server token', () => {
    const identity = identityFromToken(
      tokenWith({ sub: 'sim-operator', name: 'Operator', role: 'Operator', exp: futureExp() }),
      'Test',
    )
    expect(identity.subject).toBe('sim-operator')
    expect(identity.roles).toEqual(['Operator'])
  })

  it('treats expired or malformed tokens as expired', () => {
    expect(isTokenExpired(tokenWith({ exp: pastExp() }))).toBe(true)
    expect(isTokenExpired(tokenWith({ exp: futureExp() }))).toBe(false)
    expect(isTokenExpired('garbage')).toBe(true)
  })

  it('restores a valid persisted session and rejects an expired one explicitly', () => {
    sessionStorage.setItem('fabrik3d.auth.token', tokenWith({ sub: 'u', role: 'Engineer', exp: futureExp() }))
    sessionStorage.setItem('fabrik3d.auth.identity', JSON.stringify({ subject: 'u', roles: ['Engineer'], mode: 'Test' }))
    expect(restoreSession()).toBe(true)

    clearSession()
    sessionStorage.setItem('fabrik3d.auth.token', tokenWith({ sub: 'u', exp: pastExp() }))
    sessionStorage.setItem('fabrik3d.auth.identity', JSON.stringify({ subject: 'u', roles: ['Operator'], mode: 'Test' }))
    expect(restoreSession()).toBe(false)
    expect(sessionExpired.value).toBe(true)
  })

  it('clears an attached token on 401 and notifies for explicit re-auth', () => {
    const handler = vi.fn()
    onUnauthorized(handler)
    setSession(tokenWith({ sub: 'u', role: 'Operator', exp: futureExp() }), {
      subject: 'u', roles: ['Operator'], mode: 'Test',
    })

    notifyUnauthorized()

    expect(getAccessToken()).toBeNull()
    expect(sessionExpired.value).toBe(true)
    expect(handler).toHaveBeenCalledTimes(1)
  })
})
