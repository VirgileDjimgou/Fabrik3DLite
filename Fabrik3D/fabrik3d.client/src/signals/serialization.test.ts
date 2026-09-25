import { afterEach, describe, expect, it } from 'vitest'
import {
  clearSignalSnapshotMigrations,
  parseSignalSnapshot,
  registerSignalSnapshotMigration,
  serializeSignalSnapshot,
} from './serialization'
import { SIGNAL_SCHEMA_VERSION, type SignalSnapshot } from './types'

const GENERATED_AT = '2026-01-01T00:00:00.000Z'

function snapshot(reverse = false): SignalSnapshot {
  const signals = [
    { signalId: 'robot-1.ServoOn', value: true, quality: 'good' as const, source: 'simulated' as const, origin: 'simulation' as const, timestamp: '2026-01-01T00:00:01.000Z' },
    { signalId: 'cnc-1.Ready', value: false, quality: 'stale' as const, source: 'observed' as const, origin: 'controller' as const, timestamp: '2026-01-01T00:00:02.000Z' },
  ]
  return { schemaVersion: SIGNAL_SCHEMA_VERSION, generatedAt: GENERATED_AT, signals: reverse ? [...signals].reverse() : signals }
}

afterEach(() => clearSignalSnapshotMigrations())

describe('signal snapshot serialization', () => {
  it('serializes deterministically with sorted ids and a fixed key order', () => {
    expect(serializeSignalSnapshot(snapshot())).toBe(serializeSignalSnapshot(snapshot(true)))
    expect(serializeSignalSnapshot({ ...snapshot(), signals: [snapshot().signals[0]!] })).toBe(
      [
        '{',
        '  "schemaVersion": "1.0",',
        '  "generatedAt": "2026-01-01T00:00:00.000Z",',
        '  "signals": [',
        '    {',
        '      "signalId": "robot-1.ServoOn",',
        '      "value": true,',
        '      "quality": "good",',
        '      "source": "simulated",',
        '      "origin": "simulation",',
        '      "timestamp": "2026-01-01T00:00:01.000Z"',
        '    }',
        '  ]',
        '}',
      ].join('\n'),
    )
  })

  it('round-trips a snapshot', () => {
    const result = parseSignalSnapshot(serializeSignalSnapshot(snapshot()))
    expect(result.diagnostics).toEqual([])
    expect(result.snapshot?.signals.map((sample) => sample.signalId)).toEqual(['cnc-1.Ready', 'robot-1.ServoOn'])
    expect(result.snapshot?.generatedAt).toBe(GENERATED_AT)
  })

  it('rejects malformed JSON, missing versions and unsupported versions', () => {
    expect(parseSignalSnapshot('{nope').snapshot).toBeNull()
    expect(parseSignalSnapshot(JSON.stringify({ signals: [] })).diagnostics.map((item) => item.code)).toContain('missing-schema-version')
    const unsupported = parseSignalSnapshot(JSON.stringify({ schemaVersion: '9.9', signals: [] }))
    expect(unsupported.snapshot).toBeNull()
    expect(unsupported.diagnostics.map((item) => item.code)).toContain('unsupported-schema-version')
  })

  it('migrates an older snapshot through a registered migration', () => {
    registerSignalSnapshotMigration('0.9', '1.0', (raw) => {
      const record = raw as { signals: Array<{ id: string; v: boolean }> }
      return {
        schemaVersion: '1.0',
        generatedAt: GENERATED_AT,
        signals: record.signals.map((entry) => ({
          signalId: entry.id,
          value: entry.v,
          quality: 'good',
          source: 'simulated',
          origin: 'simulation',
          timestamp: '2026-01-01T00:00:01.000Z',
        })),
      }
    })
    const result = parseSignalSnapshot(JSON.stringify({ schemaVersion: '0.9', signals: [{ id: 'robot-1.ServoOn', v: true }] }))
    expect(result.snapshot?.signals[0]?.signalId).toBe('robot-1.ServoOn')
    expect(result.diagnostics.some((item) => item.code === 'migration-applied')).toBe(true)
  })

  it('rejects snapshot entries with invalid quality, source, origin or timestamp', () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ['quality', { quality: 'bogus' }],
      ['source', { source: 'imagined' }],
      ['origin', { origin: 'telepathy' }],
      ['timestamp', { timestamp: 'yesterday' }],
      ['value', { value: { nested: true } }],
    ]
    for (const [label, overrides] of cases) {
      const payload = {
        schemaVersion: '1.0',
        generatedAt: GENERATED_AT,
        signals: [
          { signalId: 'robot-1.ServoOn', value: true, quality: 'good', source: 'simulated', origin: 'simulation', timestamp: '2026-01-01T00:00:01.000Z', ...overrides },
        ],
      }
      const result = parseSignalSnapshot(JSON.stringify(payload))
      expect(result.snapshot, label).toBeNull()
      expect(result.diagnostics.some((item) => item.severity === 'error'), label).toBe(true)
    }
  })
})
