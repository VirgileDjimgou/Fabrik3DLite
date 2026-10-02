import type { AuthConfig, AuthIdentity, AuthToken } from './authTypes'
import {
  buildAuthorizationUrl,
  buildLogoutUrl,
  createPkcePair,
  exchangeCodeForToken,
  fetchDiscovery,
  parseAuthorizationResponse,
  randomState,
  resolveRedirectUri,
  verifyState,
  webCryptoProvider,
  type CryptoProvider,
} from './oidcPkce'
import { clearSession, getAccessToken, identityFromToken, restoreSession, setSession } from './authStore'

/**
 * Server-side identity client for the simulator. The simulator never fabricates an identity: it
 * uses the guarded development/test endpoint locally or a standard OIDC provider in production
 * (Authorization Code + PKCE), and roles are always re-read from the verified server token. Tokens,
 * codes and verifiers are never logged.
 */

const ORCHESTRATOR_BASE = import.meta.env.VITE_ORCHESTRATOR_URL as string | undefined
const BASE = ORCHESTRATOR_BASE ? `${ORCHESTRATOR_BASE.replace(/\/+$/, '')}/api` : '/api'

const PKCE_VERIFIER_KEY = 'fabrik3d.auth.pkce.verifier'
const PKCE_STATE_KEY = 'fabrik3d.auth.pkce.state'

/** OIDC id token kept in memory only (used as the logout hint); never persisted, never logged. */
let oidcIdToken: string | null = null

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

/** True when the server advertises a standard OIDC browser flow. Test/Demo mode is never OIDC. */
export function isOidcMode(config: AuthConfig | null | undefined): boolean {
  return (config?.mode ?? '').toLowerCase() === 'oidc' && Boolean(config?.oidc)
}

function browserStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.sessionStorage ? window.sessionStorage : null
  } catch {
    return null
  }
}

function currentOrigin(explicit?: string): string {
  if (explicit) return explicit
  return typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
}

export async function devLogin(role: string, subject?: string, name?: string): Promise<AuthIdentity> {
  const token = await json<AuthToken>('/auth/dev-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, subject, name }),
  })
  const next = identityFromToken(token.accessToken, token.mode)
  setSession(token.accessToken, next)
  // Enrich with the server-resolved organization; a failure keeps the token-authenticated identity.
  return (await refreshIdentity().catch(() => null)) ?? next
}

export interface OidcLoginDependencies {
  config?: AuthConfig
  crypto?: CryptoProvider
  fetchImpl?: typeof fetch
  navigate?: (url: string) => void
  origin?: string
  storage?: Storage | null
}

/**
 * Starts the Authorization Code + PKCE flow: discovers provider metadata, creates an S256 PKCE
 * pair and a CSRF state, persists only the verifier/state in sessionStorage, and navigates to the
 * provider. The callback is completed by {@link completeOidcLogin}.
 */
export async function beginOidcLogin(deps: OidcLoginDependencies = {}): Promise<void> {
  const config = deps.config ?? await fetchAuthConfig()
  if (!isOidcMode(config)) throw new Error('oidc_not_configured')
  const oidc = config.oidc!
  const discovery = await fetchDiscovery(oidc, deps.fetchImpl ?? fetch)
  const { verifier, challenge } = await createPkcePair(deps.crypto ?? webCryptoProvider)
  const state = randomState(deps.crypto ?? webCryptoProvider)

  const storage = deps.storage ?? browserStorage()
  storage?.setItem(PKCE_VERIFIER_KEY, verifier)
  storage?.setItem(PKCE_STATE_KEY, state)

  const redirectUri = resolveRedirectUri(currentOrigin(deps.origin), oidc.redirectPath)
  const url = buildAuthorizationUrl(discovery, oidc, { redirectUri, state, codeChallenge: challenge })
  const navigate = deps.navigate ?? ((target: string) => { window.location.assign(target) })
  navigate(url)
}

/**
 * Completes the OIDC callback: validates the CSRF state, exchanges the code (PKCE) and re-reads the
 * authenticated principal from the server. Roles are never taken from an opaque access token. A
 * failed callback clears the session and throws so the UI reports an explicit authentication error.
 */
export async function completeOidcLogin(deps: OidcLoginDependencies & { url?: string } = {}): Promise<AuthIdentity> {
  const url = deps.url ?? (typeof window !== 'undefined' ? window.location.href : '')
  const response = parseAuthorizationResponse(url)
  if (response.error) {
    throw Object.assign(new Error(`oidc_${response.error}`), { oidcError: response.error })
  }

  const storage = deps.storage ?? browserStorage()
  const verifier = storage?.getItem(PKCE_VERIFIER_KEY) ?? null
  const expectedState = storage?.getItem(PKCE_STATE_KEY)
  if (!response.code || !verifier || !verifyState(expectedState, response.state)) {
    throw new Error('oidc_invalid_callback')
  }

  const config = deps.config ?? await fetchAuthConfig()
  if (!isOidcMode(config)) throw new Error('oidc_not_configured')
  const oidc = config.oidc!
  const discovery = await fetchDiscovery(oidc, deps.fetchImpl ?? fetch)
  const redirectUri = resolveRedirectUri(currentOrigin(deps.origin), oidc.redirectPath)

  const token = await exchangeCodeForToken({
    discovery,
    config: oidc,
    code: response.code,
    codeVerifier: verifier,
    redirectUri,
    fetchImpl: deps.fetchImpl ?? fetch,
  })

  storage?.removeItem(PKCE_VERIFIER_KEY)
  storage?.removeItem(PKCE_STATE_KEY)
  oidcIdToken = token.idToken ?? null

  // An OIDC access token can be opaque, so materialize a provisional session and immediately ask the
  // server for the authoritative roles. A failure clears the session rather than inventing roles.
  const expiresAtMs = token.expiresInSeconds > 0 ? Date.now() + token.expiresInSeconds * 1000 : Date.now()
  const provisional: AuthIdentity = { subject: 'authenticated', name: 'authenticated', roles: [], mode: 'Oidc' }
  setSession(token.accessToken, provisional, expiresAtMs)
  try {
    return (await refreshIdentity(token.accessToken)) ?? provisional
  } catch (error) {
    clearSession({ expired: true })
    throw error
  }
}

/**
 * Re-validates a token against the server and refreshes roles plus the resolved organization (S43).
 * `tokenOverride` lets the OIDC callback validate the freshly exchanged opaque token before it is
 * consulted from storage.
 */
export async function refreshIdentity(tokenOverride?: string): Promise<AuthIdentity | null> {
  const token = tokenOverride ?? getAccessToken()
  if (!token) return null
  const me = await json<{
    subject: string
    name?: string | null
    roles: string[]
    organizationId?: string | null
    organizationName?: string | null
  }>('/auth/me', { headers: { Authorization: `Bearer ${token}` } })
  const next: AuthIdentity = {
    subject: me.subject,
    name: me.name ?? me.subject,
    roles: me.roles,
    mode: 'server',
    organizationId: me.organizationId ?? null,
    organizationName: me.organizationName ?? null,
  }
  setSession(token, next)
  return next
}

/** Clears the local session. For OIDC use {@link oidcLogout} to also end the provider session. */
export function logout(): void {
  oidcIdToken = null
  clearSession()
}

/**
 * Clears the local session and, when the provider supports it, performs RP-initiated logout. Safe to
 * call in Test/Demo mode: it degrades to a plain local logout.
 */
export async function oidcLogout(deps: OidcLoginDependencies = {}): Promise<void> {
  const config = deps.config ?? await fetchAuthConfig().catch(() => null)
  oidcIdToken = null
  clearSession()
  if (!isOidcMode(config)) return
  const oidc = config!.oidc!
  let discovery
  try {
    discovery = await fetchDiscovery(oidc, deps.fetchImpl ?? fetch)
  } catch {
    return
  }
  const postLogout = resolveRedirectUri(currentOrigin(deps.origin), oidc.postLogoutRedirectPath || '/')
  const url = buildLogoutUrl(discovery, oidc, postLogout)
  if (url) (deps.navigate ?? ((target: string) => { window.location.assign(target) }))(url)
}

/** True when the given URL looks like an OIDC authorization callback for the configured path. */
export function isOidcCallbackUrl(url: string, config: AuthConfig | null | undefined): boolean {
  if (!isOidcMode(config)) return false
  try {
    const parsed = new URL(url)
    const expected = config!.oidc!.redirectPath.replace(/\/+$/, '')
    const actual = parsed.pathname.replace(/\/+$/, '')
    if (expected && actual !== expected) return false
    return parsed.searchParams.has('code') || parsed.searchParams.has('error') || parsed.searchParams.has('state')
  } catch {
    return false
  }
}

/**
 * Restores a persisted session on startup. A 401 while validating clears the session and marks it
 * expired so the simulator shows explicit re-auth instead of silently dropping to anonymous.
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
