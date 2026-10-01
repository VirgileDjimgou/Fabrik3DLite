import { afterEach, describe, expect, it } from 'vitest'
import { navigationGuard } from './index'
import { clearSession, identityFromToken, setSession } from '@/auth/authStore'

function token(role: string): string {
  const payload = { sub: 'e2e-user', name: 'e2e-user', role, exp: Math.floor(Date.now() / 1000) + 3600 }
  const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${encode({ alg: 'none' })}.${encode(payload)}.signature`
}

function signIn(role: string): void {
  const value = token(role)
  setSession(value, identityFromToken(value, 'Test'))
}

afterEach(() => clearSession())

describe('navigationGuard', () => {
  it('lets the shell render the login surface when no session exists', () => {
    expect(navigationGuard({ path: '/' })).toBe(true)
    expect(navigationGuard({ path: '/robot-positions' })).toBe(true)
  })

  it('lets an operator reach the robot surface but sends a learner home', () => {
    signIn('Operator')
    expect(navigationGuard({ path: '/robot-positions' })).toBe(true)

    signIn('Learner')
    expect(navigationGuard({ path: '/robot-positions' })).toEqual({ name: 'home' })
    expect(navigationGuard({ path: '/' })).toBe(true)
    expect(navigationGuard({ path: '/current-job' })).toBe(true)
  })

  it('guards the instructor surface for non-instructors', () => {
    signIn('Operator')
    expect(navigationGuard({ path: '/instructor' })).toEqual({ name: 'home' })

    signIn('Instructor')
    expect(navigationGuard({ path: '/instructor' })).toBe(true)
  })
})
