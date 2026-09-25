import type { AuthConfig, AuthIdentity, AuthToken } from './authTypes'
import { clearSession, getAccessToken, identityFromToken, restoreSession, setSession } from './authStore'

/**
 * Server-side identity client for the simulator. The simulator never fabricates an identity: it
 * uses the guarded development/test endpoint locally or an external OIDC provider in production,
 * and roles are always re-read from the verified server token.
 */

const ORCHESTRATOR_BASE = import.meta.env.VITE_ORCHESTRATOR_URL as string | undefined
const BASE = ORCHESTRATOR_BASE ? `${ORCHESTRATOR_BASE.replace(/\/+$/, '')}/api` : '/api'

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let payload: unknown
    try { payload = text ? JSON.parse(text) : undefined } catch { payload = undefined }
    const error = new Error(`[${res.status}] ${path}`) as Error & { status?: number; payload?: unknown }
    error.status = res.status
    error.payload = payload
    throw error
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export function fetchAuthConfig(): Promise<AuthConfig> {
  return json<AuthConfig>('/auth/config')
}

export async function devLogin(role: string, subject?: string, name?: string): Promise<AuthIdentity> {
  const token = await json<AuthToken>('/auth/dev-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, subject, name }),
  })
  const next = identityFromToken(token.accessToken, token.mode)
  setSession(token.accessToken, next)
  return next
}

export function logout(): void {
  clearSession()
}

/**
 * Restores a persisted session on startup. A 401 while validating clears the session and marks it
 * expired so the simulator shows explicit re-auth instead of silently dropping to anonymous.
 */
export async function bootstrap(): Promise<void> {
  if (!restoreSession()) return
  const token = getAccessToken()
  if (!token) return
  try {
    const me = await json<{ subject: string; name?: string | null; roles: string[] }>('/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
    setSession(token, { subject: me.subject, name: me.name ?? me.subject, roles: me.roles, mode: 'server' })
  } catch (error) {
    const status = (error as { status?: number }).status
    if (status === 401 || status === 403) clearSession({ expired: true })
  }
}
