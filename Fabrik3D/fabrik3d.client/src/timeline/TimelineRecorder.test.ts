import { describe, expect, it } from 'vitest'
import { TimelineRecorder } from './TimelineRecorder'
import { replayTimeline } from './replay'

describe('timeline and replay', () => {
  const context = { source: 'simulator', sessionId: 's-1', equipmentId: 'robot-1', correlationId: 'c-1' }
  it('orders entries and preserves required provenance', () => {
    const recorder = new TimelineRecorder(() => '2026-01-01T00:00:00.000Z')
    const a = recorder.record('command', 'info', context, { command: 'start' })
    const b = recorder.record('state-transition', 'info', context, { to: 'running' })
    expect([a.sequence, b.sequence]).toEqual([1, 2])
    expect(b).toMatchObject({ source: 'simulator', sessionId: 's-1', equipmentId: 'robot-1', timestamp: '2026-01-01T00:00:00.000Z', correlationId: 'c-1', simulated: true })
  })
  it('replays a fixed fixture deterministically regardless of input order', () => {
    const recorder = new TimelineRecorder(() => '2026-01-01T00:00:00.000Z')
    recorder.record('alarm', 'error', context, { faultId: 'f-1' })
    recorder.record('acknowledgement', 'info', context, { faultId: 'f-1' })
    recorder.record('fault-action', 'info', context, { faultId: 'f-1', action: 'retry' })
    expect(replayTimeline(recorder.all)).toEqual(replayTimeline([...recorder.all].reverse()))
    expect(replayTimeline(recorder.all).activeFaultIds).toEqual([])
  })
})
