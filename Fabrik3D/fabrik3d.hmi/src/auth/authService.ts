import type { AuthConfig, AuthIdentity, AuthToken } from './authTypes'
import {
  clearSession,
  identityFromToken,
  restoreSession,
  setSession,
  getAccessToken,
} from './authStore'

/**
 * Server-side identity client. It talks to the same orchestration base as the rest of the HMI and
 * never fabricates an identity locally: tokens come from the guarded server dev/test endpoint or a
 * real OIDC provider, and the subject/roles are always re-read from the server.
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

/** Public discovery; no token required. */
export function fetchAuthConfig(): Promise<AuthConfig> {
  return json<AuthConfig>('/auth/config')
}

/** Requests a guarded development/test identity token. Refused by the server outside dev/test. */
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

/** Re-validates the current token against the server and refreshes roles. */
export async function refreshIdentity(): Promise<AuthIdentity | null> {
  const token = getAccessToken()
  if (!token) return null
  const me = await json<{ subject: string; name?: string | null; roles: string[]; authenticationType: string }>(
    '/auth/me',
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const next: AuthIdentity = {
    subject: me.subject,
    name: me.name ?? me.subject,
    roles: me.roles,
    mode: 'server',
  }
  setSession(token, next)
  return next
}

export function logout(): void {
  clearSession()
}

/**
 * Restores a persisted session on startup. A 401 during validation clears the session and marks it
 * expired so the operator sees explicit recovery instead of a silent anonymous fallback.
 */
export async function bootstrap(): Promise<void> {
  if (!restoreSession()) return
  try {
    await refreshIdentity()
  } catch (error) {
    const status = (error as { status?: number }).status
    if (status === 401 || status === 403) clearSession({ expired: true })
  }
}
