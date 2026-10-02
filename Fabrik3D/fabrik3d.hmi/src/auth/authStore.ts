import { ref } from 'vue'
import type { AuthIdentity } from './authTypes'

/**
 * HMI identity store.
 *
 * Token storage decision (S42): the short-lived access token is kept in memory and mirrored to
 * `sessionStorage` only so an operator can survive a page refresh. This is a deliberate trade-off:
 * any storage readable by JavaScript is exposed to a successful XSS, and `localStorage` would keep
 * the token longer. We mitigate with short-lived tokens, no token in URLs, no token in logs, and a
 * server-side role check on every request. A cookie-based flow would require CSRF protection and is
 * intentionally not used here.
 *
 * Frontends never decide authorization: the store only reflects roles from the verified server
 * token and the 401/403 responses the server returns.
 */

const TOKEN_KEY = 'fabrik3d.auth.token'
const IDENTITY_KEY = 'fabrik3d.auth.identity'
const EXPIRES_KEY = 'fabrik3d.auth.expiresAt'
const ROLE_CLAIM = 'role'
const SUBJECT_CLAIM = 'sub'
const NAME_CLAIM = 'name'

export const accessToken = ref<string | null>(null)
export const identity = ref<AuthIdentity | null>(null)
/** True after a request was rejected with 401 while a token was attached (explicit re-auth needed). */
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
  if (parts.length !== 3) return null
  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/')
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

function jwtExpiryMs(token: string): number | null {
  const payload = decodeJwtPayload(token)
  const exp = payload?.exp
  return typeof exp === 'number' ? exp * 1000 : null
}

/** True when the token has no known expiry, or the expiry is at/behind the optional skew. */
export function isTokenExpired(token: string, skewSeconds = 0): boolean {
  const expiry = sessionExpiresAtMs ?? jwtExpiryMs(token)
  if (expiry === null) return true
  return expiry <= Date.now() + skewSeconds * 1000
}

function rolesFromClaims(payload: Record<string, unknown> | null): string[] {
  const raw = payload?.[ROLE_CLAIM]
  if (typeof raw === 'string') return [raw]
  if (Array.isArray(raw)) return raw.filter((value): value is string => typeof value === 'string')
  return []
}

/** Materializes an identity from a verified server token payload. */
export function identityFromToken(token: string, mode: string): AuthIdentity {
  const payload = decodeJwtPayload(token)
  const subject = typeof payload?.[SUBJECT_CLAIM] === 'string'
    ? (payload[SUBJECT_CLAIM] as string)
    : 'authenticated'
  const name = typeof payload?.[NAME_CLAIM] === 'string' ? (payload[NAME_CLAIM] as string) : subject
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

/** Restores a non-expired session from sessionStorage. Returns true when a session is active. */
export function restoreSession(): boolean {
  const store = storage()
  if (!store) return false
  const token = store.getItem(TOKEN_KEY)
  const storedIdentity = store.getItem(IDENTITY_KEY)
  const storedExpiry = store.getItem(EXPIRES_KEY)
  if (!token || !storedIdentity) return false
  const parsedExpiry = storedExpiry ? Number(storedExpiry) : null
  sessionExpiresAtMs = parsedExpiry !== null && Number.isFinite(parsedExpiry) ? parsedExpiry : null
  if (isTokenExpired(token)) {
    clearSession({ expired: true })
    return false
  }
  try {
    accessToken.value = token
    identity.value = JSON.parse(storedIdentity) as AuthIdentity
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

export function rolesOf(): string[] {
  return identity.value?.roles ?? []
}

export function hasAnyRole(roles: readonly string[]): boolean {
  return rolesOf().some((role) => roles.includes(role))
}

// Role → permission helpers, mirroring the documented server permission matrix. They only shape
// the UI; the server re-checks every request.
export function canRead(): boolean {
  return isAuthenticated()
}
export function canOperate(): boolean {
  return hasAnyRole(['Operator', 'Engineer', 'Administrator'])
}
export function canEngineer(): boolean {
  return hasAnyRole(['Engineer', 'Administrator'])
}
export function canInstruct(): boolean {
  return hasAnyRole(['Instructor', 'Administrator'])
}
export function canAdmin(): boolean {
  return hasAnyRole(['Administrator'])
}

/** Registers the handler invoked when the server rejects an attached token with 401. */
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
