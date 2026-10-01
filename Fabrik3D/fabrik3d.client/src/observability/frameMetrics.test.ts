import { describe, expect, it, vi } from 'vitest'
import {
  FRAME_SAMPLE_CAPACITY,
  FrameMetricsSampler,
  SimulatorMetricsReporter,
  percentile,
} from './frameMetrics'

describe('frame metrics sampler', () => {
  it('computes deterministic percentiles over an ascending-sorted window', () => {
    expect(percentile([], 0.5)).toBe(0)
    expect(percentile([10], 0.95)).toBe(10)
    expect(percentile([0, 10, 20, 30, 40], 0.5)).toBe(20)
    expect(percentile([0, 10, 20, 30, 40], 0.95)).toBe(38)
  })

  it('keeps a bounded window so a long run never grows without limit', () => {
    const sampler = new FrameMetricsSampler(FRAME_SAMPLE_CAPACITY)
    for (let index = 0; index < FRAME_SAMPLE_CAPACITY + 250; index++) {
      sampler.record({ frameMs: 16, drawCalls: 1, triangles: 1 })
    }
    expect(sampler.sampleCount).toBe(FRAME_SAMPLE_CAPACITY)
  })

  it('summarises frame time, draw calls and triangles deterministically', () => {
    const sampler = new FrameMetricsSampler(10)
    for (const frameMs of [10, 12, 14, 16, 18, 20]) sampler.record({ frameMs, drawCalls: 40, triangles: 1200 })
    sampler.recordResources({ textureBytes: 4096, textureCount: 3 })

    const summary = sampler.summary()
    expect(summary).not.toBeNull()
    expect(summary!.sampleCount).toBe(6)
    expect(summary!.meanFrameMs).toBeCloseTo(15, 6)
    expect(summary!.p50FrameMs).toBeCloseTo(15, 6)
    expect(summary!.p95FrameMs).toBeCloseTo(19.5, 6)
    expect(summary!.p99FrameMs).toBeCloseTo(19.9, 6)
    expect(summary!.maxFrameMs).toBe(20)
    expect(summary!.estimatedFps).toBeCloseTo(1000 / 15, 6)
    expect(summary!.lastDrawCalls).toBe(40)
    expect(summary!.lastTriangles).toBe(1200)
    expect(summary!.textureBytes).toBe(4096)
    expect(summary!.textureCount).toBe(3)
    expect(summary!.acceleration).toBe('unknown')
  })

  it('classifies acceleration from the renderer identity, never above the evidence', () => {
    const sampler = new FrameMetricsSampler()
    expect(sampler.setRendererIdentity(null)).toBe('unknown')
    expect(sampler.setRendererIdentity({ vendor: '', renderer: '', unmaskedVendor: '', unmaskedRenderer: '' })).toBe('unknown')
    expect(
      sampler.setRendererIdentity({
        vendor: '',
        renderer: '',
        unmaskedVendor: 'NVIDIA',
        unmaskedRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Direct3D11)',
      }),
    ).toBe('hardware')
    sampler.record({ frameMs: 16, drawCalls: 1, triangles: 1 })
    expect(sampler.summary()!.acceleration).toBe('hardware')
  })

  it('normalises malformed samples instead of corrupting the window', () => {
    const sampler = new FrameMetricsSampler(5)
    sampler.record({ frameMs: Number.NaN, drawCalls: -1, triangles: Number.POSITIVE_INFINITY })
    const summary = sampler.summary()
    expect(summary!.meanFrameMs).toBe(0)
    expect(summary!.lastDrawCalls).toBe(0)
    expect(summary!.lastTriangles).toBe(0)
  })

  it('reports nothing when there is no sample yet', () => {
    expect(new FrameMetricsSampler().summary()).toBeNull()
  })
})

describe('simulator metrics reporter', () => {
  function samplerWith(frames: number[]): FrameMetricsSampler {
    const sampler = new FrameMetricsSampler()
    for (const frameMs of frames) sampler.record({ frameMs, drawCalls: 12, triangles: 300 })
    sampler.recordResources({ textureBytes: 8192, textureCount: 2 })
    return sampler
  }

  it('is a silent no-op when disabled', async () => {
    const fetchImpl = vi.fn()
    const reporter = new SimulatorMetricsReporter({ enabled: false, baseUrl: 'http://x', sourceId: 'sim', fetchImpl })
    expect(reporter.enabled).toBe(false)
    expect(await reporter.maybeReport(samplerWith([10]))).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('posts a bounded, authenticated report at most once per interval', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return new Response(null, { status: 202 })
    }) as unknown as typeof fetch

    let now = 1_000_000
    const reporter = new SimulatorMetricsReporter({
      enabled: true,
      baseUrl: 'http://127.0.0.1:7249',
      sourceId: 'simulator',
      intervalMs: 5000,
      getAccessToken: () => 'token-123',
      fetchImpl,
      now: () => now,
    })
    const sampler = samplerWith([10, 12, 14, 16, 18, 20])

    expect(await reporter.maybeReport(sampler)).toBe(true)
    now += 1000
    expect(await reporter.maybeReport(sampler)).toBe(false)
    now += 5000
    expect(await reporter.maybeReport(sampler)).toBe(true)

    expect(calls).toHaveLength(2)
    expect(calls[0]!.url).toBe('http://127.0.0.1:7249/api/diagnostics/simulator')
    const headers = calls[0]!.init!.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer token-123')
    const body = JSON.parse(calls[0]!.init!.body as string) as Record<string, unknown>
    expect(body.sourceId).toBe('simulator')
    expect(body.frameTimeMs).toBeCloseTo(19.5, 3)
    expect(body.drawCalls).toBe(12)
    expect(body.triangles).toBe(300)
    expect(body.textureBytes).toBe(8192)
  })

  it('treats a non-2xx response as a failed report without throwing', async () => {
    const fetchImpl = (async () => new Response(null, { status: 500 })) as unknown as typeof fetch
    const reporter = new SimulatorMetricsReporter({
      enabled: true,
      baseUrl: 'http://127.0.0.1:7249',
      sourceId: 'sim',
      fetchImpl,
      now: () => 1,
    })
    expect(await reporter.maybeReport(samplerWith([10]))).toBe(false)
  })

  it('never throws when the endpoint is unreachable', async () => {
    const fetchImpl = (async () => { throw new Error('offline') }) as unknown as typeof fetch
    const reporter = new SimulatorMetricsReporter({
      enabled: true,
      baseUrl: 'http://127.0.0.1:7249',
      sourceId: 'sim',
      fetchImpl,
      now: () => 1,
    })
    expect(await reporter.maybeReport(samplerWith([10]))).toBe(false)
  })
})
