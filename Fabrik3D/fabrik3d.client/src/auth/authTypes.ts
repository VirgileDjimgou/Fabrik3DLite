/**
 * Identity types used by the simulator authentication surface. They mirror the server
 * (`Fabrik3D.Contracts.DTOs.Auth*`) and are declared locally so the simulator type-checks without
 * depending on the generated OpenAPI snapshot. The server remains the source of truth.
 */

export interface AuthConfig {
  mode: string
  developmentAuth: boolean
  publicDemoEnabled: boolean
  roles: string[]
  warning?: string | null
  /** Present only when the server is in Oidc mode with a configured public browser client (S63). */
  oidc?: OidcBrowserConfig | null
  /** True when this deployment is an explicit public-demo profile offering the bounded reset. */
  demoResetEnabled?: boolean
}

/** Public browser OIDC settings discovered from the server (S63); never contains a secret. */
export interface OidcBrowserConfig {
  authority: string
  clientId: string
  scopes: string[]
  redirectPath: string
  postLogoutRedirectPath?: string | null
  endSessionEnabled: boolean
}

export interface AuthIdentity {
  subject: string
  name?: string | null
  roles: string[]
  mode: string
  /** Active organization resolved server-side (S43); display context only, never an access control. */
  organizationId?: string | null
  organizationName?: string | null
}

export interface AuthToken {
  accessToken: string
  tokenType: string
  expiresAtUtc: string
  mode: string
  subject: string
  roles: string[]
}
