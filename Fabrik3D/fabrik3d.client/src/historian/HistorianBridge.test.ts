import { afterEach, describe, expect, it, vi } from 'vitest'
import { HistorianBridge, type HistorianTelemetrySample } from './HistorianBridge'
import type { TimelineEntry } from '../timeline/TimelineRecorder'

const sample = (signalId: string, value: number): HistorianTelemetrySample => ({
  timestampUtc: '2026-01-01T00:00:00.000Z',
  sessionId: 'session-1',
  equipmentId: 'cnc-1',
  signalId,
  numericValue: value,
  valueType: 'float',
  quality: 'good',
  source: 'simulated',
  origin: 'simulation',
  correlationId: 'corr-1',
})

const timelineEntry = (overrides: Partial<TimelineEntry> = {}): TimelineEntry => ({
  sequence: 1,
  kind: 'state-transition',
  source: 'simulator',
  severity: 'info',
  sessionId: 'session-1',
  equipmentId: 'robot-1',
  timestamp: '2026-01-01T00:00:00.000Z',
  correlationId: 'corr-1',
  simulated: true,
  payload: { from: 'MOVING', to: 'WAITING' },
  ...overrides,
})

afterEach(() => {
  vi.useRealTimers()
})

describe('historian bridge', () => {
  it('is a no-op while disabled so the simulator stays local-only', async () => {
    const post = vi.fn().mockResolvedValue({})
    const bridge = new HistorianBridge(post, { enabled: false })

    expect(bridge.enabled).toBe(false)
    expect(bridge.enqueueTelemetry(sample('cnc.spindle.speed', 1000))).toBe(false)
    expect(bridge.enqueueTimelineEntry(timelineEntry())).toBe(false)
    await bridge.flush()

    expect(post).not.toHaveBeenCalled()
    expect(bridge.getStats().queuedSamples).toBe(0)
  })

  it('batches telemetry to the documented path', async () => {
    const post = vi.fn().mockResolvedValue({ accepted: 2 })
    const bridge = new HistorianBridge(post, { enabled: true, batchSize: 2 })

    expect(bridge.enqueueTelemetry(sample('a', 1))).toBe(true)
    expect(bridge.enqueueTelemetry(sample('b', 2))).toBe(true)
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1))

    expect(post).toHaveBeenCalledWith('/historian/telemetry', {
      samples: [expect.objectContaining({ signalId: 'a' }), expect.objectContaining({ signalId: 'b' })],
    })
    expect(bridge.getStats().sentDocuments).toBe(2)
  })

  it('flushes buffered events explicitly with deterministic mapping', async () => {
    const post = vi.fn().mockResolvedValue({ accepted: 1 })
    const bridge = new HistorianBridge(post, { enabled: true, batchSize: 100 })

    bridge.enqueueTimelineEntry(timelineEntry({ kind: 'alarm', severity: 'error', payload: { code: 'A001' } }))
    await bridge.flush()

    expect(post).toHaveBeenCalledWith('/historian/events', {
      events: [
        expect.objectContaining({
          kind: 'alarm',
          severity: 'error',
          equipmentId: 'robot-1',
          code: 'alarm:simulator',
          payload: JSON.stringify({ code: 'A001' }),
        }),
      ],
    })
  })

  it('bounds the buffer and counts dropped documents', () => {
    const post = vi.fn().mockResolvedValue({})
    const bridge = new HistorianBridge(post, { enabled: true, batchSize: 100, maxBuffered: 2 })

    expect(bridge.enqueueTelemetry(sample('a', 1))).toBe(true)
    expect(bridge.enqueueTelemetry(sample('b', 2))).toBe(true)
    expect(bridge.enqueueTelemetry(sample('c', 3))).toBe(false)
    expect(bridge.getStats().droppedDocuments).toBe(1)
    bridge.stop()
  })

  it('counts a failed flush and never throws', async () => {
    const post = vi.fn().mockRejectedValue(new Error('offline'))
    const bridge = new HistorianBridge(post, { enabled: true, batchSize: 100 })

    bridge.enqueueTelemetry(sample('a', 1))
    await expect(bridge.flush()).resolves.toBeUndefined()

    const stats = bridge.getStats()
    expect(stats.failedFlushes).toBe(1)
    expect(stats.droppedDocuments).toBe(1)
    expect(stats.sentDocuments).toBe(0)
  })

  it('flushes on the configured interval and stops cleanly', async () => {
    vi.useFakeTimers()
    const post = vi.fn().mockResolvedValue({})
    const bridge = new HistorianBridge(post, { enabled: true, batchSize: 100, flushIntervalMs: 1000 })

    bridge.enqueueTelemetry(sample('a', 1))
    await vi.advanceTimersByTimeAsync(1000)
    expect(post).toHaveBeenCalledTimes(1)

    bridge.stop()
    bridge.enqueueTelemetry(sample('b', 2))
    await vi.advanceTimersByTimeAsync(5000)
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('maps timeline kinds, severities and oversized payloads deterministically', () => {
    expect(HistorianBridge.mapTimelineEntry(timelineEntry({ kind: 'command' })).kind).toBe('command')
    expect(HistorianBridge.mapTimelineEntry(timelineEntry({ kind: 'fault-action' })).kind).toBe('fault')
    expect(HistorianBridge.mapTimelineEntry(timelineEntry({ kind: 'acknowledgement' })).kind).toBe('acknowledgement')
    expect(HistorianBridge.mapTimelineEntry(timelineEntry({ kind: 'telemetry' })).kind).toBe('event')
    expect(HistorianBridge.mapTimelineEntry(timelineEntry({ severity: 'critical' })).severity).toBe('critical')

    const huge = HistorianBridge.mapTimelineEntry(
      timelineEntry({ payload: { blob: 'x'.repeat(10_000) } }),
      256,
    )
    const parsed = JSON.parse(huge.payload) as { truncated?: boolean }
    expect(parsed.truncated).toBe(true)
    expect(huge.payload.length).toBeLessThanOrEqual(256)
  })
})
