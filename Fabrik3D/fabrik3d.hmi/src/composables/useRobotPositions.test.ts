import { describe, expect, it } from 'vitest'
import { jogAvailability } from './useRobotPositions'
import type { ControlAuthorityDto, RobotPositionsDto } from '@/services/api'

function positions(overrides: Partial<RobotPositionsDto> = {}): RobotPositionsDto {
  return {
    cellId: 'reference-cell', robotId: 'robot-1', robotModel: 'medium-6axis',
    joints: [], tcp: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
    frames: { baseFrame: 'world', toolFrame: 'flange', workObjectFrame: 'wo', currentToolId: 'tool-1' },
    motionStatus: 'IDLE', operatingMode: 'manual-training',
    controlAuthorityMode: 'external-controller', controlAuthorityState: 'held', controlAuthorityOwnerId: 'op',
    isStale: false, publishedAtUtc: '2026-10-01T08:00:00Z', units: 'radians, meters', schemaVersion: 1,
    ...overrides,
  }
}

function authority(overrides: Partial<ControlAuthorityDto> = {}): ControlAuthorityDto {
  return {
    scope: 'reference-cell', mode: 'external-controller', state: 'held', ownerId: 'op', ownerKind: 'simulator',
    acquiredAtUtc: null, leaseExpiresAtUtc: null, lastHeartbeatUtc: null, version: 1,
    degradedReason: null, correlationId: null, isPersisted: true, diagnostic: null,
    ...overrides,
  }
}

describe('jogAvailability', () => {
  it('allows jog only with fresh manual-training telemetry and held authority', () => {
    expect(jogAvailability({ positions: positions(), telemetry: 'ready', authority: authority(), mode: 'manual-training' }))
      .toEqual({ allowed: true, reason: null })
  })

  it('reports each blocking reason', () => {
    expect(jogAvailability({ positions: null, telemetry: 'unavailable', authority: authority(), mode: 'manual-training' }).reason).toBe('no-telemetry')
    expect(jogAvailability({ positions: null, telemetry: 'offline', authority: authority(), mode: 'manual-training' }).reason).toBe('offline')
    expect(jogAvailability({ positions: positions({ isStale: true }), telemetry: 'ready', authority: authority(), mode: 'manual-training' }).reason).toBe('stale')
    expect(jogAvailability({ positions: positions({ operatingMode: 'automatic' }), telemetry: 'ready', authority: authority(), mode: 'manual-training' }).reason).toBe('mode')
    expect(jogAvailability({ positions: positions(), telemetry: 'ready', authority: authority(), mode: 'automatic' }).reason).toBe('mode')
    expect(jogAvailability({ positions: positions(), telemetry: 'ready', authority: null, mode: 'manual-training' }).reason).toBe('authority')
    expect(jogAvailability({ positions: positions(), telemetry: 'ready', authority: authority({ state: 'degraded' }), mode: 'manual-training' }).reason).toBe('authority')
    expect(jogAvailability({ positions: positions(), telemetry: 'ready', authority: authority({ mode: 'replay' }), mode: 'manual-training' }).reason).toBe('authority')
  })
})
