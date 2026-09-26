/**
 * Identity types used by the HMI authentication surface.
 *
 * These mirror the server contract (`Fabrik3D.Contracts.DTOs.Auth*`) but are declared locally so the
 * HMI type-checks independently of the generated OpenAPI snapshot. The server remains the single
 * source of truth: every field here is only ever a reflection of a server response.
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

export const KNOWN_ROLES = ['Learner', 'Instructor', 'Engineer', 'Operator', 'Administrator'] as const

export type KnownRole = (typeof KNOWN_ROLES)[number]
