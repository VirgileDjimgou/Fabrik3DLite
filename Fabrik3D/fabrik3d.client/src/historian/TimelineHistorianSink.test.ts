import { describe, expect, it, vi } from 'vitest'
import { TimelineRecorder, type TimelineEntry } from '../timeline'
import { HistorianBridge } from './HistorianBridge'

const context = { source: 'simulator', sessionId: 's-1', equipmentId: 'robot-1', correlationId: 'c-1' }

describe('timeline historian sink', () => {
  it('forwards every recorded entry to the optional sink', () => {
    const sink = vi.fn<(entry: TimelineEntry) => void>()
    const recorder = new TimelineRecorder(() => '2026-01-01T00:00:00.000Z', sink)

    recorder.record('command', 'info', context, { command: 'start' })
    recorder.record('alarm', 'error', context, { code: 'A001' })

    expect(sink).toHaveBeenCalledTimes(2)
    expect(sink.mock.calls[0]?.[0]).toMatchObject({ kind: 'command', sequence: 1, simulated: true })
  })

  it('never lets a failing sink break the local timeline', () => {
    const sink = vi.fn(() => { throw new Error('historian offline') })
    const recorder = new TimelineRecorder(() => '2026-01-01T00:00:00.000Z', sink)

    const entry = recorder.record('state-transition', 'info', context, { to: 'running' })

    expect(entry.sequence).toBe(1)
    expect(recorder.all).toHaveLength(1)
  })

  it('passes timeline entries through the bridge mapping unchanged in meaning', async () => {
    const post = vi.fn().mockResolvedValue({ accepted: 1 })
    const bridge = new HistorianBridge(post, { enabled: true, batchSize: 100 })
    const recorder = new TimelineRecorder(
      () => '2026-01-01T00:00:00.000Z',
      (entry) => { void bridge.enqueueTimelineEntry(entry) },
    )

    recorder.record('fault-action', 'warning', context, { faultId: 'f-1' })
    await bridge.flush()

    expect(post).toHaveBeenCalledWith('/historian/events', {
      events: [expect.objectContaining({ kind: 'fault', severity: 'warning', sessionId: 's-1' })],
    })
  })

  it('does not forward to a disabled bridge', async () => {
    const post = vi.fn().mockResolvedValue({})
    const bridge = new HistorianBridge(post, { enabled: false })
    const recorder = new TimelineRecorder(() => '2026-01-01T00:00:00.000Z', (entry) => {
      expect(bridge.enqueueTimelineEntry(entry)).toBe(false)
    })

    recorder.record('command', 'info', context, { command: 'start' })
    await bridge.flush()

    expect(post).not.toHaveBeenCalled()
  })
})
