import { describe, expect, it } from 'vitest'
import { assessTimeline } from './assessment'
import type { TimelineEntry } from '../timeline'
const entry = (sequence: number, kind: TimelineEntry['kind'], payload: Record<string, unknown>): TimelineEntry => ({ sequence, kind, payload, source: 'simulator', severity: 'info', sessionId: 's', equipmentId: 'e', timestamp: '2026-01-01T00:00:00.000Z', correlationId: 'c', simulated: true })
describe('assessment scoring', () => {
  it('awards each transparent boundary independently', () => {
    expect(assessTimeline([]).score).toBe(60)
    expect(assessTimeline([entry(1, 'state-transition', { to: 'complete' })]).score).toBe(100)
    expect(assessTimeline([entry(1, 'alarm', { faultId: 'f' })]).score).toBe(20)
    expect(assessTimeline([entry(1, 'alarm', { faultId: 'f' }), entry(2, 'fault-action', { faultId: 'f', action: 'retry' })]).score).toBe(60)
  })
})
