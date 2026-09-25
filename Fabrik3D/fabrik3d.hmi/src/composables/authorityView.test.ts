import { describe, expect, it } from 'vitest'
import { authorityFromEvent, authorityModeKey, authorityStateKey, authorityVisualState } from './authorityView'
import type { ControlAuthorityDto } from '@/services/api'
import type { ControlAuthorityChangedEvent } from '@/services/hub'

const dto = (overrides: Partial<ControlAuthorityDto> = {}): ControlAuthorityDto => ({
  scope: 'cell-1',
  mode: 'external-controller',
  state: 'held',
  ownerId: 'modbus',
  ownerKind: 'connector',
  acquiredAtUtc: '2026-09-25T10:00:00Z',
  leaseExpiresAtUtc: '2026-09-25T10:01:00Z',
  lastHeartbeatUtc: '2026-09-25T10:00:00Z',
  version: 2,
  degradedReason: null,
  correlationId: null,
  isPersisted: true,
  diagnostic: null,
  ...overrides,
})

describe('authority HMI view model', () => {
  it('maps wire modes and states to stable translation keys', () => {
    expect(authorityModeKey('local-simulation')).toBe('authority.localSimulation')
    expect(authorityModeKey('external-controller')).toBe('authority.externalController')
    expect(authorityModeKey('observed-twin')).toBe('authority.observedTwin')
    expect(authorityModeKey('replay')).toBe('authority.replay')
    expect(authorityModeKey('unexpected')).toBe('authority.localSimulation')

    expect(authorityStateKey('available')).toBe('authority.available')
    expect(authorityStateKey('held')).toBe('authority.held')
    expect(authorityStateKey('degraded')).toBe('authority.degraded')
    expect(authorityStateKey(null)).toBe('authority.available')
  })

  it('derives a non-decorative visual state', () => {
    expect(authorityVisualState(null)).toBe('offline')
    expect(authorityVisualState(dto())).toBe('warning')
    expect(authorityVisualState(dto({ mode: 'local-simulation' }))).toBe('success')
    expect(authorityVisualState(dto({ state: 'degraded' }))).toBe('fault')
    expect(authorityVisualState(dto({ state: 'available' }))).toBe('normal')
  })

  it('applies a hub event without losing the acquisition timestamp', () => {
    const next = authorityFromEvent({
      scope: 'cell-1',
      mode: 'external-controller',
      state: 'degraded',
      ownerId: 'modbus',
      ownerKind: 'connector',
      previousMode: 'local-simulation',
      previousOwnerId: null,
      degradedReason: 'controller-heartbeat-lost',
      leaseExpiresAtUtc: '2026-09-25T10:01:00Z',
      eventType: 'authority_degraded',
      timestampUtc: '2026-09-25T10:02:00Z',
    } as ControlAuthorityChangedEvent, dto())

    expect(next.state).toBe('degraded')
    expect(next.degradedReason).toBe('controller-heartbeat-lost')
    expect(next.acquiredAtUtc).toBe('2026-09-25T10:00:00Z')
    expect(next.version).toBe(3)
  })
})
