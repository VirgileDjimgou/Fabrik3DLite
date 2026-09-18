import { describe, expect, it } from 'vitest'
import { TelemetryReplay, TwinStateStore, type NormalizedEquipmentState } from '.'
const state = (timestamp: string, source: NormalizedEquipmentState['source'] = 'simulated'): NormalizedEquipmentState => ({ schemaVersion: '1.0', equipment: { id: 'robot-1', category: 'robot', displayName: 'Robot' }, source, availability: 'available', operatingMode: 'Automatic', executionState: 'Idle', measurements: {}, alarmCodes: [], quality: 'good', timestamp })
describe('normalized twin state', () => {
  it('orders source priority and rejects stale duplicates', () => { const store = new TwinStateStore(() => Date.parse('2026-01-01T00:00:01Z')); expect(store.apply(state('2026-01-01T00:00:00Z', 'observed'))).toBe(true); expect(store.apply(state('2026-01-01T00:00:00Z', 'replay'))).toBe(false); expect(store.get('robot-1')?.source).toBe('observed') })
  it('replays fixed records deterministically at every speed', () => { const records = [state('2026-01-01T00:00:01Z'), state('2026-01-01T00:00:02Z')]; const replay = new TelemetryReplay(records); expect(replay.advance('2026-01-01T00:00:01Z')).toHaveLength(1); expect(replay.advance('2026-01-01T00:00:03Z')).toHaveLength(1); replay.reset(); expect(replay.advance('2026-01-01T00:00:03Z')).toEqual(records) })
})
