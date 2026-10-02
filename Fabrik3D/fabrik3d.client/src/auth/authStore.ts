import { ref } from 'vue'
import type { AuthIdentity } from './authTypes'

/**
 * Simulator identity store.
 *
 * Token storage decision (S42): the short-lived access token is kept in memory and mirrored to
 * `sessionStorage`. Any JavaScript-readable storage is exposed to a successful XSS, so the token is
 * intentionally short-lived, never placed in a URL and never logged; `localStorage` (longer-lived)
 * is deliberately avoided. The simulator keeps working fully offline, in a clearly labelled local
 * demo mode, when no server session exists.
 */

const TOKEN_KEY = 'fabrik3d.auth.token'
const IDENTITY_KEY = 'fabrik3d.auth.identity'
const EXPIRES_KEY = 'fabrik3d.auth.expiresAt'

export const accessToken = ref<string | null>(null)
export const identity = ref<AuthIdentity | null>(null)
export const sessionExpired = ref(false)
/**
 * Incremented whenever the effective role set changes (login, logout or a server-side role change
 * observed on refresh). Views that gate on roles can react instead of showing stale controls.
 */
export const roleRevision = ref(0)

let unauthorizedHandler: (() => void) | null = null

/**
 * Explicit session expiry in epoch milliseconds. OIDC access tokens can be opaque (not a JWT), so
 * the provider's `expires_in` is tracked here instead of guessing from a JWT `exp` claim. When it is
 * null the JWT `exp` claim is used; a token with neither is treated as expired (fail closed).
 */
let sessionExpiresAtMs: number | null = null

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.sessionStorage ? window.sessionStorage : null
  } catch {
    return null
  }
}

/** Decodes the (unverified) JWT payload for display and expiry only; the server verifies signatures. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  const encoded = parts[1]
  if (parts.length !== 3 || !encoded) return null
  try {
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
    const json = decodeURIComponent(
      Array.from(atob(padded))
        .map((char) => `%${`00${char.charCodeAt(0).toString(16)}`.slice(-2)}`)
        .join(''),
    )
    const parsed = JSON.parse(json) as Record<string, unknown>
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function isTokenExpired(token: string, skewSeconds = 0): boolean {
  const expiry = sessionExpiresAtMs ?? jwtExpiryMs(token)
  if (expiry === null) return true
  return expiry <= Date.now() + skewSeconds * 1000
}

function jwtExpiryMs(token: string): number | null {
  const payload = decodeJwtPayload(token)
  const exp = payload?.exp
  return typeof exp === 'number' ? exp * 1000 : null
}

function rolesFromClaims(payload: Record<string, unknown> | null): string[] {
  const raw = payload?.role
  if (typeof raw === 'string') return [raw]
  if (Array.isArray(raw)) return raw.filter((value): value is string => typeof value === 'string')
  return []
}

export function identityFromToken(token: string, mode: string): AuthIdentity {
  const payload = decodeJwtPayload(token)
  const subject = typeof payload?.sub === 'string' ? (payload.sub as string) : 'authenticated'
  const name = typeof payload?.name === 'string' ? (payload.name as string) : subject
  return { subject, name, roles: rolesFromClaims(payload), mode }
}

/** True when two role lists differ as sets (order-independent, ordinal). */
export function rolesChanged(previous: readonly string[] | undefined, next: readonly string[]): boolean {
  const a = [...(previous ?? [])].sort()
  const b = [...next].sort()
  return a.length !== b.length || a.some((role, index) => role !== b[index])
}

/**
 * Persists a session. `expiresAtMs` is the provider-reported expiry for opaque OIDC tokens; when it
 * is omitted and the token changed, expiry falls back to the JWT `exp` claim. Re-attaching the same
 * token (for example after re-reading roles) preserves the known expiry.
 */
export function setSession(token: string, next: AuthIdentity, expiresAtMs?: number | null): void {
  if (rolesChanged(identity.value?.roles, next.roles)) roleRevision.value += 1
  if (expiresAtMs !== undefined) sessionExpiresAtMs = expiresAtMs
  else if (accessToken.value !== token) sessionExpiresAtMs = null
  accessToken.value = token
  identity.value = next
  sessionExpired.value = false
  const store = storage()
  if (store) {
    store.setItem(TOKEN_KEY, token)
    store.setItem(IDENTITY_KEY, JSON.stringify(next))
    if (sessionExpiresAtMs === null) store.removeItem(EXPIRES_KEY)
    else store.setItem(EXPIRES_KEY, String(sessionExpiresAtMs))
  }
}

export function restoreSession(): boolean {
  const store = storage()
  if (!store) return false
  const token = store.getItem(TOKEN_KEY)
  const stored = store.getItem(IDENTITY_KEY)
  const storedExpiry = store.getItem(EXPIRES_KEY)
  if (!token || !stored) return false
  const parsedExpiry = storedExpiry ? Number(storedExpiry) : null
  sessionExpiresAtMs = parsedExpiry !== null && Number.isFinite(parsedExpiry) ? parsedExpiry : null
  if (isTokenExpired(token)) {
    clearSession({ expired: true })
    return false
  }
  try {
    accessToken.value = token
    identity.value = JSON.parse(stored) as AuthIdentity
    return true
  } catch {
    clearSession()
    return false
  }
}

export function clearSession(options: { expired?: boolean } = {}): void {
  if (identity.value) roleRevision.value += 1
  sessionExpiresAtMs = null
  accessToken.value = null
  identity.value = null
  sessionExpired.value = options.expired ?? false
  const store = storage()
  if (store) {
    store.removeItem(TOKEN_KEY)
    store.removeItem(IDENTITY_KEY)
    store.removeItem(EXPIRES_KEY)
  }
}

export function getAccessToken(): string | null {
  if (accessToken.value && isTokenExpired(accessToken.value)) {
    clearSession({ expired: true })
    return null
  }
  return accessToken.value
}

export function isAuthenticated(): boolean {
  return getAccessToken() !== null
}

export function onUnauthorized(handler: () => void): void {
  unauthorizedHandler = handler
}

/** Called by the REST client and hub on a 401. Produces explicit re-auth, never silent anonymity. */
export function notifyUnauthorized(): void {
  if (accessToken.value) {
    clearSession({ expired: true })
  }
  unauthorizedHandler?.()
}
