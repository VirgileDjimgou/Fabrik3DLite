/**
 * Client-side simulator performance instrumentation (S49, extended in S56 with p99 and an honest
 * acceleration classification of the renderer that produced the samples).
 *
 * This module is deliberately framework- and renderer-free: it samples frame durations, draw calls
 * and triangle counts, keeps a bounded window and computes deterministic percentiles. Reporting to
 * the optional local metrics endpoint is disabled by default, throttled, best-effort and never
 * changes simulation semantics. Measurements are recorded for diagnosis, not asserted as budgets.
 */

import {
  classifyAcceleration,
  type AccelerationClass,
  type RendererIdentity,
} from './acceleration'

export interface FrameSample {
  /** Frame duration in milliseconds. */
  frameMs: number
  /** Draw calls issued for the frame (from the renderer when available). */
  drawCalls: number
  /** Triangles submitted for the frame (from the renderer when available). */
  triangles: number
}

export interface ResourceSnapshot {
  /** Estimated GPU texture bytes for the current scene (documented estimate, never a fabrication). */
  textureBytes: number
  /** Number of distinct textures referenced by the scene. */
  textureCount: number
}

export interface SimulatorFrameSummary {
  sampleCount: number
  meanFrameMs: number
  p50FrameMs: number
  p95FrameMs: number
  p99FrameMs: number
  maxFrameMs: number
  estimatedFps: number
  lastDrawCalls: number
  lastTriangles: number
  textureBytes: number
  textureCount: number
  heapUsedBytes: number
  /** Honest acceleration classification of the renderer that produced the samples. */
  acceleration: AccelerationClass
}

/** Bounded window (about 10 seconds at 60 fps) so a long-running scene never grows without limit. */
export const FRAME_SAMPLE_CAPACITY = 600

/** Linear-interpolated percentile over an ascending-sorted array. */
export function percentile(sortedAscending: readonly number[], fraction: number): number {
  if (sortedAscending.length === 0) return 0
  const clamped = Math.min(1, Math.max(0, fraction))
  const position = clamped * (sortedAscending.length - 1)
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  const lowerValue = sortedAscending[lower]!
  if (lower === upper) return lowerValue
  const upperValue = sortedAscending[upper]!
  return lowerValue + (upperValue - lowerValue) * (position - lower)
}

/** Reads the JS heap size when the browser exposes it; returns 0 when unavailable. */
export function readHeapUsedBytes(): number {
  const performanceWithMemory = performance as Performance & { memory?: { usedJSHeapSize?: number } }
  const value = performanceWithMemory.memory?.usedJSHeapSize
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export class FrameMetricsSampler {
  private readonly samples: FrameSample[] = []
  private readonly capacity: number
  private lastResources: ResourceSnapshot = { textureBytes: 0, textureCount: 0 }
  private acceleration: AccelerationClass = 'unknown'

  constructor(capacity: number = FRAME_SAMPLE_CAPACITY) {
    this.capacity = capacity > 0 ? capacity : FRAME_SAMPLE_CAPACITY
  }

  /** Records the renderer identity so the summary can classify acceleration honestly. */
  setRendererIdentity(identity: RendererIdentity | null | undefined): AccelerationClass {
    this.acceleration = classifyAcceleration(identity)
    return this.acceleration
  }

  /** Records one frame sample; values are normalised so a malformed frame never corrupts the window. */
  record(sample: FrameSample): void {
    const frameMs = Number.isFinite(sample.frameMs) && sample.frameMs > 0 ? sample.frameMs : 0
    const drawCalls = Number.isFinite(sample.drawCalls) && sample.drawCalls > 0 ? sample.drawCalls : 0
    const triangles = Number.isFinite(sample.triangles) && sample.triangles > 0 ? sample.triangles : 0
    this.samples.push({ frameMs, drawCalls, triangles })
    if (this.samples.length > this.capacity) this.samples.splice(0, this.samples.length - this.capacity)
  }

  /** Records the most recent scene resource snapshot (texture memory/count), measured at report time. */
  recordResources(resources: ResourceSnapshot): void {
    this.lastResources = {
      textureBytes: Math.max(0, resources.textureBytes),
      textureCount: Math.max(0, resources.textureCount),
    }
  }

  get sampleCount(): number {
    return this.samples.length
  }

  reset(): void {
    this.samples.length = 0
    this.lastResources = { textureBytes: 0, textureCount: 0 }
    this.acceleration = 'unknown'
  }

  summary(): SimulatorFrameSummary | null {
    if (this.samples.length === 0) return null

    const durations = this.samples.map((sample) => sample.frameMs).sort((a, b) => a - b)
    const sum = durations.reduce((total, value) => total + value, 0)
    const meanFrameMs = sum / durations.length
    const last = this.samples[this.samples.length - 1]!

    return {
      sampleCount: durations.length,
      meanFrameMs,
      p50FrameMs: percentile(durations, 0.5),
      p95FrameMs: percentile(durations, 0.95),
      p99FrameMs: percentile(durations, 0.99),
      maxFrameMs: durations[durations.length - 1]!,
      estimatedFps: meanFrameMs > 0 ? 1000 / meanFrameMs : 0,
      lastDrawCalls: last.drawCalls,
      lastTriangles: last.triangles,
      textureBytes: this.lastResources.textureBytes,
      textureCount: this.lastResources.textureCount,
      heapUsedBytes: readHeapUsedBytes(),
      acceleration: this.acceleration,
    }
  }
}

export interface SimulatorMetricsReporterConfig {
  enabled: boolean
  baseUrl: string
  sourceId: string
  intervalMs?: number
  getAccessToken?: () => string | null
  fetchImpl?: typeof fetch
  now?: () => number
}

/**
 * Throttled, best-effort reporter for the optional local metrics endpoint. It never throws and never
 * blocks the render loop: a missing token, a disabled endpoint or a network error is a silent no-op.
 */
export class SimulatorMetricsReporter {
  private readonly config: SimulatorMetricsReporterConfig
  private lastReportAt = Number.NEGATIVE_INFINITY

  constructor(config: SimulatorMetricsReporterConfig) {
    this.config = config
  }

  get enabled(): boolean {
    return this.config.enabled
  }

  /** Reports at most once per interval. Returns whether a report was actually attempted and accepted. */
  async maybeReport(sampler: FrameMetricsSampler): Promise<boolean> {
    if (!this.config.enabled) return false

    const now = this.config.now?.() ?? Date.now()
    const interval = this.config.intervalMs && this.config.intervalMs > 0 ? this.config.intervalMs : 5000
    if (now - this.lastReportAt < interval) return false

    const summary = sampler.summary()
    if (!summary) return false

    this.lastReportAt = now

    const token = this.config.getAccessToken?.() ?? null
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`

    const fetchImpl = this.config.fetchImpl ?? fetch
    try {
      const response = await fetchImpl(`${this.config.baseUrl}/api/diagnostics/simulator`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sourceId: this.config.sourceId,
          frameTimeMs: Number(summary.p95FrameMs.toFixed(3)),
          drawCalls: summary.lastDrawCalls,
          triangles: summary.lastTriangles,
          textureBytes: summary.textureBytes,
          heapUsedBytes: summary.heapUsedBytes,
          timestamp: new Date(now).toISOString(),
        }),
      })
      return response.ok || response.status === 202
    } catch {
      return false
    }
  }
}
