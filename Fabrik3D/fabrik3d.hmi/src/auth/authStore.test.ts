import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  canAdmin,
  canEngineer,
  canInstruct,
  canOperate,
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

describe('auth store', () => {
  beforeEach(() => {
    clearSession()
    sessionStorage.clear()
  })

  it('materializes the server token claims for display only', () => {
    const identity = identityFromToken(
      tokenWith({ sub: 'alice', name: 'Alice', role: 'Operator', exp: futureExp() }),
      'Test',
    )

    expect(identity.subject).toBe('alice')
    expect(identity.name).toBe('Alice')
    expect(identity.roles).toEqual(['Operator'])
    expect(identity.mode).toBe('Test')
  })

  it('treats expired, malformed and expiry-less tokens as expired', () => {
    expect(isTokenExpired(tokenWith({ exp: pastExp() }))).toBe(true)
    expect(isTokenExpired(tokenWith({ exp: futureExp() }))).toBe(false)
    expect(isTokenExpired('not-a-jwt')).toBe(true)
    expect(isTokenExpired(tokenWith({}))).toBe(true)
  })

  it('restores a persisted non-expired session from sessionStorage', () => {
    sessionStorage.setItem('fabrik3d.auth.token', tokenWith({ sub: 'bob', role: 'Engineer', exp: futureExp() }))
    sessionStorage.setItem('fabrik3d.auth.identity', JSON.stringify({ subject: 'bob', name: 'bob', roles: ['Engineer'], mode: 'Test' }))

    expect(restoreSession()).toBe(true)
    expect(getAccessToken()).not.toBeNull()
  })

  it('never restores an expired session and marks it explicitly expired', () => {
    sessionStorage.setItem('fabrik3d.auth.token', tokenWith({ sub: 'bob', exp: pastExp() }))
    sessionStorage.setItem('fabrik3d.auth.identity', JSON.stringify({ subject: 'bob', roles: ['Operator'], mode: 'Test' }))

    expect(restoreSession()).toBe(false)
    expect(sessionExpired.value).toBe(true)
    expect(getAccessToken()).toBeNull()
  })

  it('maps roles to the documented UI capabilities', () => {
    setSession(tokenWith({ sub: 'u', role: 'Operator', exp: futureExp() }), {
      subject: 'u', roles: ['Operator'], mode: 'Test',
    })
    expect(canOperate()).toBe(true)
    expect(canEngineer()).toBe(false)
    expect(canInstruct()).toBe(false)
    expect(canAdmin()).toBe(false)

    setSession(tokenWith({ sub: 'u', role: 'Administrator', exp: futureExp() }), {
      subject: 'u', roles: ['Administrator'], mode: 'Test',
    })
    expect(canOperate()).toBe(true)
    expect(canEngineer()).toBe(true)
    expect(canInstruct()).toBe(true)
    expect(canAdmin()).toBe(true)
  })

  it('turns an attached-token 401 into an explicit expired session', () => {
    const handler = vi.fn()
    onUnauthorized(handler)
    setSession(tokenWith({ sub: 'u', role: 'Operator', exp: futureExp() }), {
      subject: 'u', roles: ['Operator'], mode: 'Test',
    })

    notifyUnauthorized()

    expect(sessionExpired.value).toBe(true)
    expect(getAccessToken()).toBeNull()
    expect(handler).toHaveBeenCalledTimes(1)
  })
})
