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
}

export interface AuthIdentity {
  subject: string
  name?: string | null
  roles: string[]
  mode: string
}

export interface AuthToken {
  accessToken: string
  tokenType: string
  expiresAtUtc: string
  mode: string
  subject: string
  roles: string[]
}
