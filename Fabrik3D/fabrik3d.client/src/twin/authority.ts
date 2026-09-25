/**
 * Control-authority model for the simulator (S36).
 *
 * A simulator may only drive actuators while it holds `local-simulation` authority (or, for
 * read-only visualization, `replay`). The rules mirror the server-side
 * `Fabrik3D.Domain.Control.ControlAuthorityRules` so the same denial codes are surfaced in both
 * layers. This module is pure and deterministic.
 */

export type AuthorityMode = 'local-simulation' | 'external-controller' | 'observed-twin' | 'replay'
export type AuthorityState = 'available' | 'held' | 'degraded'
export type AuthorityOwnerKind = 'simulator' | 'connector'

export interface AuthoritySnapshot {
  scope: string
  mode: AuthorityMode
  state: AuthorityState
  ownerId: string | null
  ownerKind: AuthorityOwnerKind | null
  degradedReason: string | null
  leaseExpiresAtUtc: string | null
  version: number
  isPersisted: boolean
  diagnostic: string | null
}

export const AUTHORITY_CODES = {
  conflict: 'authority_conflict',
  notAcquired: 'authority_not_acquired',
  handoverRejected: 'authority_handover_rejected',
  lost: 'authority_lost',
  replayReadOnly: 'authority_replay_read_only',
} as const

export interface AuthorityDecision {
  allowed: boolean
  code: string | null
  reason: string | null
}

const MODES: AuthorityMode[] = ['local-simulation', 'external-controller', 'observed-twin', 'replay']
const STATES: AuthorityState[] = ['available', 'held', 'degraded']

export function isAuthorityMode(value: unknown): value is AuthorityMode {
  return typeof value === 'string' && (MODES as string[]).includes(value)
}

export function canModeCommand(mode: AuthorityMode): boolean {
  return mode === 'local-simulation' || mode === 'external-controller'
}

/** Implicit local simulation used when the server has no authority document for the scope. */
export function implicitLocalSimulation(scope: string): AuthoritySnapshot {
  return {
    scope,
    mode: 'local-simulation',
    state: 'available',
    ownerId: null,
    ownerKind: null,
    degradedReason: null,
    leaseExpiresAtUtc: null,
    version: 0,
    isPersisted: false,
    diagnostic: 'no-authority-document; treated as implicit local-simulation',
  }
}

/** Defensive normalizer for server payloads; unknown or missing fields fall back to local simulation. */
export function normalizeAuthority(value: unknown, scope = 'cell-1'): AuthoritySnapshot {
  if (!value || typeof value !== 'object') return implicitLocalSimulation(scope)
  const raw = value as Record<string, unknown>
  const mode = isAuthorityMode(raw.mode) ? raw.mode : 'local-simulation'
  const state = typeof raw.state === 'string' && (STATES as string[]).includes(raw.state)
    ? (raw.state as AuthorityState)
    : 'available'
  return {
    scope: typeof raw.scope === 'string' && raw.scope ? raw.scope : scope,
    mode,
    state,
    ownerId: typeof raw.ownerId === 'string' ? raw.ownerId : null,
    ownerKind: raw.ownerKind === 'simulator' || raw.ownerKind === 'connector' ? raw.ownerKind : null,
    degradedReason: typeof raw.degradedReason === 'string' ? raw.degradedReason : null,
    leaseExpiresAtUtc: typeof raw.leaseExpiresAtUtc === 'string' ? raw.leaseExpiresAtUtc : null,
    version: typeof raw.version === 'number' ? raw.version : 0,
    isPersisted: raw.isPersisted === true,
    diagnostic: typeof raw.diagnostic === 'string' ? raw.diagnostic : null,
  }
}

/**
 * Mirrors the server decision: an absent/available authority allows implicit local simulation,
 * replay can never command, degraded always fails closed, and a held authority only allows its
 * owner.
 */
export function evaluateCommand(
  authority: AuthoritySnapshot | null,
  requestedMode: AuthorityMode,
  ownerId: string | null,
): AuthorityDecision {
  if (!canModeCommand(requestedMode)) {
    return {
      allowed: false,
      code: requestedMode === 'replay' ? AUTHORITY_CODES.replayReadOnly : AUTHORITY_CODES.notAcquired,
      reason: `Mode '${requestedMode}' is read-only and cannot command actuators.`,
    }
  }

  if (!authority || authority.state === 'available') {
    return requestedMode === 'local-simulation'
      ? { allowed: true, code: null, reason: null }
      : {
          allowed: false,
          code: AUTHORITY_CODES.notAcquired,
          reason: 'External control authority has not been acquired for this scope.',
        }
  }

  if (authority.state === 'degraded') {
    return {
      allowed: false,
      code: AUTHORITY_CODES.lost,
      reason: `Control authority is degraded (${authority.degradedReason ?? 'controller lost'}); explicit operator resume or release is required.`,
    }
  }

  if (authority.mode === requestedMode && ownerId && authority.ownerId === ownerId) {
    return { allowed: true, code: null, reason: null }
  }

  if (authority.mode === 'local-simulation' && requestedMode === 'local-simulation') {
    return { allowed: true, code: null, reason: null }
  }

  return {
    allowed: false,
    code: AUTHORITY_CODES.conflict,
    reason: `Scope '${authority.scope}' is controlled by ${authority.mode}/${authority.ownerId ?? 'unowned'}.`,
  }
}

/**
 * Observable authority holder used by the simulator. Incoming snapshots are applied with the same
 * monotonic version guard as other twin sources, so an out-of-order event never overwrites a newer
 * authority state.
 */
export class AuthorityStore {
  private current: AuthoritySnapshot | null

  constructor(scope = 'cell-1', initial: AuthoritySnapshot | null = null) {
    this.current = initial ?? implicitLocalSimulation(scope)
  }

  apply(next: AuthoritySnapshot): boolean {
    if (this.current && next.version < this.current.version) return false
    this.current = next
    return true
  }

  snapshot(): AuthoritySnapshot {
    return this.current ?? implicitLocalSimulation('cell-1')
  }

  /** True when this simulator may drive actuators for the scope. */
  canCommand(simulatorId: string): boolean {
    return evaluateCommand(this.current, 'local-simulation', simulatorId).allowed
  }

  /** A zero-argument gate suitable for workflow actuator gating. */
  gate(simulatorId: string): () => boolean {
    return () => this.canCommand(simulatorId)
  }
}
