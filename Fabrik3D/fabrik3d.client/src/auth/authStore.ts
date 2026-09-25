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

export const accessToken = ref<string | null>(null)
export const identity = ref<AuthIdentity | null>(null)
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
  const payload = decodeJwtPayload(token)
  const exp = payload?.exp
  if (typeof exp !== 'number') return true
  return exp * 1000 <= Date.now() + skewSeconds * 1000
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

export function restoreSession(): boolean {
  const store = storage()
  if (!store) return false
  const token = store.getItem(TOKEN_KEY)
  const stored = store.getItem(IDENTITY_KEY)
  if (!token || !stored) return false
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
