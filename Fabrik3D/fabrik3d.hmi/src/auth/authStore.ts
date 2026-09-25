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
const ROLE_CLAIM = 'role'
const SUBJECT_CLAIM = 'sub'
const NAME_CLAIM = 'name'

export const accessToken = ref<string | null>(null)
export const identity = ref<AuthIdentity | null>(null)
/** True after a request was rejected with 401 while a token was attached (explicit re-auth needed). */
export const sessionExpired = ref(false)

let unauthorizedHandler: (() => void) | null = null

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

/** True when the token has no expiry, or the expiry is at/behind the optional skew. */
export function isTokenExpired(token: string, skewSeconds = 0): boolean {
  const payload = decodeJwtPayload(token)
  const exp = payload?.exp
  if (typeof exp !== 'number') return true
  return exp * 1000 <= Date.now() + skewSeconds * 1000
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

export function setSession(token: string, next: AuthIdentity): void {
  accessToken.value = token
  identity.value = next
  sessionExpired.value = false
  const store = storage()
  if (store) {
    store.setItem(TOKEN_KEY, token)
    store.setItem(IDENTITY_KEY, JSON.stringify(next))
  }
}

/** Restores a non-expired session from sessionStorage. Returns true when a session is active. */
export function restoreSession(): boolean {
  const store = storage()
  if (!store) return false
  const token = store.getItem(TOKEN_KEY)
  const storedIdentity = store.getItem(IDENTITY_KEY)
  if (!token || !storedIdentity) return false
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
  accessToken.value = null
  identity.value = null
  sessionExpired.value = options.expired ?? false
  const store = storage()
  if (store) {
    store.removeItem(TOKEN_KEY)
    store.removeItem(IDENTITY_KEY)
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
