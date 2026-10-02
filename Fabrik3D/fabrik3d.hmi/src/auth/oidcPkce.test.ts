import { describe, expect, it, vi } from 'vitest'
import {
  base64UrlEncode,
  buildAuthorizationUrl,
  buildLogoutUrl,
  createPkcePair,
  exchangeCodeForToken,
  fetchDiscovery,
  parseAuthorizationResponse,
  resolveRedirectUri,
  verifyState,
  type CryptoProvider,
  type OidcBrowserConfig,
  type OidcDiscovery,
} from './oidcPkce'

// RFC 7636 Appendix B canonical PKCE verifier/challenge pair.
const RFC_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
const RFC_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'

const VERIFIER_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'

/** Real SHA-256 through the Web Crypto API available in the test runtime. */
function sha256(data: Uint8Array): Promise<Uint8Array> {
  return globalThis.crypto.subtle.digest('SHA-256', data).then((digest) => new Uint8Array(digest))
}

function realSha(): CryptoProvider {
  return {
    randomBytes: (length) => new Uint8Array(length),
    sha256,
  }
}

/** Returns bytes whose alphabet index spells the requested verifier. */
function cryptoProducing(verifier: string, tailBytes: number[] = []): CryptoProvider {
  let tailIndex = 0
  return {
    randomBytes(length) {
      const out = new Uint8Array(length)
      for (let index = 0; index < length; index += 1) {
        if (index < verifier.length) out[index] = VERIFIER_ALPHABET.indexOf(verifier[index]!)
        else out[index] = tailBytes[tailIndex++ % Math.max(tailBytes.length, 1)] ?? 0
      }
      return out
    },
    sha256,
  }
}

const config: OidcBrowserConfig = {
  authority: 'https://idp.example.test/realms/demo',
  clientId: 'fabrik3d-hmi',
  scopes: ['openid', 'profile'],
  redirectPath: '/auth/callback',
  postLogoutRedirectPath: '/',
  endSessionEnabled: true,
}

describe('oidc pkce helpers', () => {
  it('produces the RFC 7636 S256 vector', async () => {
    const pair = await createPkcePair(cryptoProducing(RFC_VERIFIER), RFC_VERIFIER.length)
    expect(pair.verifier).toBe(RFC_VERIFIER)
    expect(pair.challenge).toBe(RFC_CHALLENGE)
  })

  it('encodes base64url without padding', () => {
    expect(base64UrlEncode(new Uint8Array([251, 255, 191]))).toBe('-_-_')
    expect(base64UrlEncode(new Uint8Array([1, 2, 3]))).not.toContain('=')
  })

  it('builds a standards-compliant authorization request', () => {
    const discovery: OidcDiscovery = {
      authorization_endpoint: 'https://idp.example.test/authorize',
      token_endpoint: 'https://idp.example.test/token',
    }
    const url = new URL(buildAuthorizationUrl(discovery, config, {
      redirectUri: 'https://hmi.example.test/auth/callback',
      state: 'state-123',
      codeChallenge: RFC_CHALLENGE,
    }))
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe('fabrik3d-hmi')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toBe(RFC_CHALLENGE)
    expect(url.searchParams.get('scope')).toBe('openid profile')
    expect(url.searchParams.get('state')).toBe('state-123')
    expect(url.searchParams.get('redirect_uri')).toBe('https://hmi.example.test/auth/callback')
  })

  it('parses success and error callbacks and validates state', () => {
    const success = parseAuthorizationResponse('https://hmi.example.test/auth/callback?code=abc&state=s1')
    expect(success.code).toBe('abc')
    expect(verifyState('s1', success.state)).toBe(true)
    expect(verifyState('other', success.state)).toBe(false)
    expect(verifyState(null, success.state)).toBe(false)

    const failure = parseAuthorizationResponse('https://hmi.example.test/auth/callback?error=access_denied&error_description=no')
    expect(failure.error).toBe('access_denied')
    expect(failure.errorDescription).toBe('no')
  })

  it('resolves same-origin redirect paths without double slashes', () => {
    expect(resolveRedirectUri('https://hmi.example.test/', 'auth/callback')).toBe('https://hmi.example.test/auth/callback')
    expect(resolveRedirectUri('https://hmi.example.test', '/auth/callback')).toBe('https://hmi.example.test/auth/callback')
  })

  it('fetches and validates discovery metadata', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        authorization_endpoint: 'https://idp.example.test/authorize',
        token_endpoint: 'https://idp.example.test/token',
        end_session_endpoint: 'https://idp.example.test/logout',
      }),
    }) as unknown as typeof fetch

    const discovery = await fetchDiscovery(config, fetchImpl)
    expect(discovery.token_endpoint).toBe('https://idp.example.test/token')
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://idp.example.test/realms/demo/.well-known/openid-configuration',
      expect.anything(),
    )

    const invalid = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch
    await expect(fetchDiscovery(config, invalid)).rejects.toThrow('oidc_discovery_invalid')
  })

  it('exchanges an authorization code with the PKCE verifier', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'opaque-token', token_type: 'Bearer', expires_in: 300, id_token: 'id-1' }),
    })
    const fetchImpl = fetchMock as unknown as typeof fetch

    const token = await exchangeCodeForToken({
      discovery: { authorization_endpoint: 'https://idp/a', token_endpoint: 'https://idp/t' },
      config,
      code: 'code-1',
      codeVerifier: RFC_VERIFIER,
      redirectUri: 'https://hmi/auth/callback',
      fetchImpl,
    })

    expect(token.accessToken).toBe('opaque-token')
    expect(token.expiresInSeconds).toBe(300)
    const body = (fetchMock.mock.calls[0]![1] as RequestInit).body as string
    expect(body).toContain('grant_type=authorization_code')
    expect(body).toContain(`code_verifier=${RFC_VERIFIER}`)
    expect(body).toContain('client_id=fabrik3d-hmi')
  })

  it('builds an end-session URL only when enabled and supported', () => {
    const withEndpoint: OidcDiscovery = {
      authorization_endpoint: 'https://idp/a',
      token_endpoint: 'https://idp/t',
      end_session_endpoint: 'https://idp/logout',
    }
    const url = new URL(buildLogoutUrl(withEndpoint, config, 'https://hmi/', 'id-1')!)
    expect(url.searchParams.get('post_logout_redirect_uri')).toBe('https://hmi/')
    expect(url.searchParams.get('client_id')).toBe('fabrik3d-hmi')

    expect(buildLogoutUrl({ authorization_endpoint: 'https://idp/a', token_endpoint: 'https://idp/t' }, config, 'https://hmi/')).toBeNull()
    expect(buildLogoutUrl(withEndpoint, { ...config, endSessionEnabled: false }, 'https://hmi/')).toBeNull()
  })
})
