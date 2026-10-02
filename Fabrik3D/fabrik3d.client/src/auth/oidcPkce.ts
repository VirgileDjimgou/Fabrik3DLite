/**
 * Standard OIDC Authorization Code + PKCE helpers (S63).
 *
 * Portable, dependency-free and provider-agnostic: it builds a standards-compliant authorization
 * request with an S256 PKCE challenge, parses the callback, exchanges the code at the provider's
 * token endpoint and builds an RP-initiated logout URL. There is no provider-specific business
 * logic and no custom identity server: any standard OIDC provider works through its discovery
 * document. Tokens, codes and verifiers are never logged.
 */

export interface OidcBrowserConfig {
  authority: string
  clientId: string
  scopes: string[]
  redirectPath: string
  postLogoutRedirectPath?: string | null
  endSessionEnabled: boolean
}

export interface OidcDiscovery {
  issuer?: string
  authorization_endpoint: string
  token_endpoint: string
  end_session_endpoint?: string
}

/** Crypto seam so the PKCE flow is deterministic in tests without a real browser Web Crypto. */
export interface CryptoProvider {
  randomBytes(length: number): Uint8Array
  sha256(data: Uint8Array): Promise<Uint8Array>
}

export const webCryptoProvider: CryptoProvider = {
  randomBytes(length: number): Uint8Array {
    const source = globalThis.crypto
    if (!source?.getRandomValues) throw new Error('web_crypto_unavailable')
    const bytes = new Uint8Array(length)
    source.getRandomValues(bytes)
    return bytes
  },
  async sha256(data: Uint8Array): Promise<Uint8Array> {
    const source = globalThis.crypto
    if (!source?.subtle) throw new Error('web_crypto_unavailable')
    return new Uint8Array(await source.subtle.digest('SHA-256', data as unknown as BufferSource))
  },
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// RFC 7636 unreserved characters for the code verifier.
const VERIFIER_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'

export function randomVerifier(crypto: CryptoProvider = webCryptoProvider, length = 64): string {
  const bytes = crypto.randomBytes(length)
  let out = ''
  for (let index = 0; index < length; index += 1) {
    out += VERIFIER_ALPHABET[bytes[index]! % VERIFIER_ALPHABET.length]
  }
  return out
}

export interface PkcePair {
  verifier: string
  challenge: string
}

/**
 * Creates an S256 PKCE verifier/challenge pair. The verifier length defaults to 64 (well within the
 * RFC 7636 43-128 range) and is parameterized so the RFC 7636 Appendix B vector can be reproduced.
 */
export async function createPkcePair(crypto: CryptoProvider = webCryptoProvider, verifierLength = 64): Promise<PkcePair> {
  const verifier = randomVerifier(crypto, verifierLength)
  const digest = await crypto.sha256(new TextEncoder().encode(verifier))
  return { verifier, challenge: base64UrlEncode(digest) }
}

/** Opaque, high-entropy CSRF state value. */
export function randomState(crypto: CryptoProvider = webCryptoProvider): string {
  return base64UrlEncode(crypto.randomBytes(16))
}

export function resolveRedirectUri(origin: string, redirectPath: string): string {
  const base = origin.replace(/\/+$/, '')
  const path = redirectPath.startsWith('/') ? redirectPath : `/${redirectPath}`
  return `${base}${path}`
}

export function buildAuthorizationUrl(
  discovery: OidcDiscovery,
  config: OidcBrowserConfig,
  params: { redirectUri: string; state: string; codeChallenge: string },
): string {
  const url = new URL(discovery.authorization_endpoint)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', params.redirectUri)
  url.searchParams.set('scope', config.scopes.join(' '))
  url.searchParams.set('state', params.state)
  url.searchParams.set('code_challenge', params.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

export interface AuthorizationResponse {
  code?: string
  state?: string
  error?: string
  errorDescription?: string
}

export function parseAuthorizationResponse(url: string): AuthorizationResponse {
  const params = new URL(url).searchParams
  return {
    code: params.get('code') ?? undefined,
    state: params.get('state') ?? undefined,
    error: params.get('error') ?? undefined,
    errorDescription: params.get('error_description') ?? undefined,
  }
}

/** Constant comparison is not required here: both values are public CSRF nonces, not secrets. */
export function verifyState(expected: string | null | undefined, actual: string | undefined): boolean {
  return Boolean(expected) && expected === actual
}

export interface OidcTokenResponse {
  accessToken: string
  tokenType: string
  expiresInSeconds: number
  refreshToken?: string
  idToken?: string
}

interface RawTokenResponse {
  access_token?: unknown
  token_type?: unknown
  expires_in?: unknown
  refresh_token?: unknown
  id_token?: unknown
}

export async function fetchDiscovery(
  config: OidcBrowserConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<OidcDiscovery> {
  const metadataUrl = `${config.authority.replace(/\/+$/, '')}/.well-known/openid-configuration`
  const response = await fetchImpl(metadataUrl, { headers: { Accept: 'application/json' } })
  if (!response.ok) {
    throw Object.assign(new Error('oidc_discovery_unavailable'), { status: response.status })
  }
  const document = (await response.json()) as Record<string, unknown>
  const authorization = document.authorization_endpoint
  const token = document.token_endpoint
  if (typeof authorization !== 'string' || typeof token !== 'string') {
    throw new Error('oidc_discovery_invalid')
  }
  return {
    issuer: typeof document.issuer === 'string' ? document.issuer : undefined,
    authorization_endpoint: authorization,
    token_endpoint: token,
    end_session_endpoint:
      typeof document.end_session_endpoint === 'string' ? document.end_session_endpoint : undefined,
  }
}

export async function exchangeCodeForToken(options: {
  discovery: OidcDiscovery
  config: OidcBrowserConfig
  code: string
  codeVerifier: string
  redirectUri: string
  fetchImpl?: typeof fetch
}): Promise<OidcTokenResponse> {
  const fetchImpl = options.fetchImpl ?? fetch
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: options.code,
    redirect_uri: options.redirectUri,
    client_id: options.config.clientId,
    code_verifier: options.codeVerifier,
  })
  const response = await fetchImpl(options.discovery.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  })
  if (!response.ok) {
    throw Object.assign(new Error('oidc_token_exchange_failed'), { status: response.status })
  }
  const raw = (await response.json()) as RawTokenResponse
  if (typeof raw.access_token !== 'string' || raw.access_token.length === 0) {
    throw new Error('oidc_token_response_invalid')
  }
  return {
    accessToken: raw.access_token,
    tokenType: typeof raw.token_type === 'string' ? raw.token_type : 'Bearer',
    expiresInSeconds: typeof raw.expires_in === 'number' ? raw.expires_in : 0,
    refreshToken: typeof raw.refresh_token === 'string' ? raw.refresh_token : undefined,
    idToken: typeof raw.id_token === 'string' ? raw.id_token : undefined,
  }
}

export function buildLogoutUrl(
  discovery: OidcDiscovery,
  config: OidcBrowserConfig,
  postLogoutRedirectUri: string,
  idTokenHint?: string,
): string | null {
  if (!config.endSessionEnabled || !discovery.end_session_endpoint) return null
  const url = new URL(discovery.end_session_endpoint)
  if (idTokenHint) url.searchParams.set('id_token_hint', idTokenHint)
  url.searchParams.set('post_logout_redirect_uri', postLogoutRedirectUri)
  url.searchParams.set('client_id', config.clientId)
  return url.toString()
}
