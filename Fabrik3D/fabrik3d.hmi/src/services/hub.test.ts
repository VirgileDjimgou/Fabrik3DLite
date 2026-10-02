import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * S63 SignalR lifecycle: the hub must read the *current* token on every (re)connect so a refreshed
 * token is used after automatic reconnect, and a closed hub with an expired/missing token must raise
 * an explicit re-auth signal instead of silently continuing anonymously.
 */

interface CapturedOptions { accessTokenFactory: () => string }
let capturedOptions: CapturedOptions | null = null
const handlers: Record<string, (...args: unknown[]) => void> = {}

const fakeConnection = {
  state: 'Connected',
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  on: vi.fn((name: string, cb: (...args: unknown[]) => void) => { handlers[name] = cb }),
  onreconnecting: vi.fn((cb: (...args: unknown[]) => void) => { handlers.reconnecting = cb }),
  onreconnected: vi.fn((cb: (...args: unknown[]) => void) => { handlers.reconnected = cb }),
  onclose: vi.fn((cb: (...args: unknown[]) => void) => { handlers.close = cb }),
}

vi.mock('@microsoft/signalr', () => ({
  HubConnectionBuilder: class {
    withUrl(_url: string, options: CapturedOptions) { capturedOptions = options; return this }
    withAutomaticReconnect() { return this }
    configureLogging() { return this }
    build() { return fakeConnection }
  },
  HubConnection: class {},
  LogLevel: { Information: 1 },
}))

import { connect, disconnect } from './hub'
import { clearSession, notifyUnauthorized, onUnauthorized, setSession } from '@/auth/authStore'

function tokenWith(payload: Record<string, unknown>): string {
  const encode = (value: Record<string, unknown>) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`
}

const futureExp = () => Math.floor(Date.now() / 1000) + 3600
const pastExp = () => Math.floor(Date.now() / 1000) - 3600

describe('hmi hub token lifecycle', () => {
  beforeEach(async () => {
    await disconnect()
    clearSession()
    sessionStorage.clear()
    capturedOptions = null
    for (const key of Object.keys(handlers)) delete handlers[key]
    vi.clearAllMocks()
  })

  it('reads the current token on every reconnect so a refreshed token is used', async () => {
    setSession(tokenWith({ sub: 'u', role: 'Operator', exp: futureExp() }), { subject: 'u', roles: ['Operator'], mode: 'Test' })
    await connect()

    expect(capturedOptions).not.toBeNull()
    const first = capturedOptions!.accessTokenFactory()
    expect(first).not.toBe('')

    // A refresh replaces the token; the factory must return the new one on the next reconnect.
    const refreshed = tokenWith({ sub: 'u', role: 'Engineer', exp: futureExp() })
    setSession(refreshed, { subject: 'u', roles: ['Engineer'], mode: 'server' }, Date.now() + 300_000)
    expect(capturedOptions!.accessTokenFactory()).toBe(refreshed)
  })

  it('raises an explicit re-auth signal when the hub closes with an expired token', async () => {
    const handler = vi.fn()
    onUnauthorized(handler)
    setSession(tokenWith({ sub: 'u', role: 'Operator', exp: pastExp() }), { subject: 'u', roles: ['Operator'], mode: 'Test' })
    await connect()

    handlers.close?.()

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('does not raise re-auth while a valid token is still attached', async () => {
    const handler = vi.fn()
    onUnauthorized(handler)
    setSession(tokenWith({ sub: 'u', role: 'Operator', exp: futureExp() }), { subject: 'u', roles: ['Operator'], mode: 'Test' })
    await connect()

    handlers.close?.()

    expect(handler).not.toHaveBeenCalled()
  })
})
