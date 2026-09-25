import type { ControlAuthorityChangedEvent } from '@/services/hub'
import type { ControlAuthorityDto } from '@/services/api'
import type { HmiVisualState } from '@/components/controls/HmiStatusIndicator.vue'

export type HandoverFeedback = 'idle' | 'pending' | 'success' | 'failure'

export type AuthorityModeKey =
  | 'authority.localSimulation'
  | 'authority.externalController'
  | 'authority.observedTwin'
  | 'authority.replay'

export type AuthorityStateKey = 'authority.available' | 'authority.held' | 'authority.degraded'

/** Stable i18n key for a wire mode; unknown values fall back to local simulation. */
export function authorityModeKey(mode: string | null | undefined): AuthorityModeKey {
  switch (mode) {
    case 'external-controller': return 'authority.externalController'
    case 'observed-twin': return 'authority.observedTwin'
    case 'replay': return 'authority.replay'
    default: return 'authority.localSimulation'
  }
}

/** Stable i18n key for a wire state; unknown values fall back to available. */
export function authorityStateKey(state: string | null | undefined): AuthorityStateKey {
  switch (state) {
    case 'held': return 'authority.held'
    case 'degraded': return 'authority.degraded'
    default: return 'authority.available'
  }
}

/** Non-decorative visual state for the authority indicator. */
export function authorityVisualState(authority: ControlAuthorityDto | null): HmiVisualState {
  if (!authority) return 'offline'
  if (authority.state === 'degraded') return 'fault'
  if (authority.state === 'held') {
    return authority.mode === 'external-controller' ? 'warning' : 'success'
  }
  return 'normal'
}

/** Maps a hub event onto the DTO shape so the indicator can update without a REST round-trip. */
export function authorityFromEvent(
  event: ControlAuthorityChangedEvent,
  previous: ControlAuthorityDto | null,
): ControlAuthorityDto {
  return {
    scope: event.scope,
    mode: event.mode,
    state: event.state,
    ownerId: event.ownerId ?? null,
    ownerKind: event.ownerKind ?? null,
    acquiredAtUtc: previous?.acquiredAtUtc ?? null,
    leaseExpiresAtUtc: event.leaseExpiresAtUtc ?? null,
    lastHeartbeatUtc: event.timestampUtc,
    version: (previous?.version ?? 0) + 1,
    degradedReason: event.degradedReason ?? null,
    correlationId: event.correlationId ?? null,
    isPersisted: true,
    diagnostic: null,
  }
}
