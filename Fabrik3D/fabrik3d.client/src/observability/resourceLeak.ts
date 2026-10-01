/**
 * Resource-growth / leak detection for soak runs (S56).
 *
 * A soak is only useful if it can decide, deterministically, whether a resource is growing without
 * bound. This module keeps a bounded series of samples per counter, fits a least-squares slope and
 * compares the first and last half-window means. It reports `leak`, `stable` or `insufficient-data`
 * and never converts "not enough data" into "stable".
 */

export interface ResourceSample {
  /** Monotonic sample time in milliseconds. */
  atMs: number
  /** Counter values at this sample time. Only configured counters are analysed. */
  values: Record<string, number>
}

export type CounterVerdict = 'stable' | 'growing' | 'shrinking' | 'insufficient-data'

export interface CounterLeakResult {
  counter: string
  samples: number
  firstMean: number
  lastMean: number
  /** Least-squares slope in counter units per minute. */
  slopePerMinute: number
  /** Relative change between the first and last half-window means. */
  relativeGrowth: number
  verdict: CounterVerdict
}

export interface LeakReport {
  verdict: 'leak' | 'stable' | 'insufficient-data'
  /** Counters judged to be growing without bound. */
  leaks: string[]
  counters: CounterLeakResult[]
}

export interface LeakDetectorOptions {
  /** Minimum samples before a verdict other than `insufficient-data` is allowed. */
  minSamples: number
  /** Relative first→last half-window growth that counts as growth. */
  growthRatioThreshold: number
  /** Absolute slope (units/minute) that must also be exceeded to call a leak. */
  slopePerMinuteThreshold: number
  /** Maximum retained samples per counter (bounded memory). */
  capacity: number
}

export const DEFAULT_LEAK_OPTIONS: LeakDetectorOptions = {
  minSamples: 4,
  growthRatioThreshold: 0.25,
  slopePerMinuteThreshold: 0.5,
  capacity: 600,
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!
}

/** Least-squares slope of y over x (units of y per unit of x). Returns 0 for degenerate input. */
export function linearSlope(xs: readonly number[], ys: readonly number[]): number {
  const count = Math.min(xs.length, ys.length)
  if (count < 2) return 0
  let sumX = 0
  let sumY = 0
  for (let index = 0; index < count; index++) {
    sumX += xs[index]!
    sumY += ys[index]!
  }
  const meanX = sumX / count
  const meanY = sumY / count
  let covariance = 0
  let variance = 0
  for (let index = 0; index < count; index++) {
    const dx = xs[index]! - meanX
    covariance += dx * (ys[index]! - meanY)
    variance += dx * dx
  }
  return variance === 0 ? 0 : covariance / variance
}

/**
 * Analyses one counter series. Growth requires both a meaningful relative increase and a positive
 * absolute slope; noise around a constant series is `stable`, never a leak.
 */
export function analyseCounter(
  counter: string,
  samples: readonly ResourceSample[],
  options: LeakDetectorOptions = DEFAULT_LEAK_OPTIONS,
): CounterLeakResult {
  const points = samples
    .filter((sample) => Number.isFinite(sample.values[counter]))
    .map((sample) => ({ atMs: sample.atMs, value: sample.values[counter]! }))

  if (points.length < options.minSamples) {
    return {
      counter,
      samples: points.length,
      firstMean: points.length > 0 ? median(points.map((point) => point.value)) : 0,
      lastMean: points.length > 0 ? points[points.length - 1]!.value : 0,
      slopePerMinute: 0,
      relativeGrowth: 0,
      verdict: 'insufficient-data',
    }
  }

  const half = Math.floor(points.length / 2)
  const firstWindow = points.slice(0, half).map((point) => point.value)
  const lastWindow = points.slice(points.length - half).map((point) => point.value)
  const firstMean = firstWindow.reduce((total, value) => total + value, 0) / firstWindow.length
  const lastMean = lastWindow.reduce((total, value) => total + value, 0) / lastWindow.length
  const relativeGrowth = (lastMean - firstMean) / Math.max(1, Math.abs(firstMean))
  const slopePerMinute = linearSlope(points.map((point) => point.atMs / 60000), points.map((point) => point.value))

  let verdict: CounterVerdict = 'stable'
  if (relativeGrowth >= options.growthRatioThreshold && slopePerMinute > options.slopePerMinuteThreshold) {
    verdict = 'growing'
  } else if (relativeGrowth <= -options.growthRatioThreshold && slopePerMinute < -options.slopePerMinuteThreshold) {
    verdict = 'shrinking'
  }

  return {
    counter,
    samples: points.length,
    firstMean,
    lastMean,
    slopePerMinute,
    relativeGrowth,
    verdict,
  }
}

/**
 * Bounded multi-counter leak detector. Feed it samples after each soak cycle; `analyse()` is pure and
 * repeatable for identical input.
 */
export class ResourceLeakDetector {
  private readonly counters: string[]
  private readonly options: LeakDetectorOptions
  private readonly samples: ResourceSample[] = []

  constructor(counters: readonly string[], options: Partial<LeakDetectorOptions> = {}) {
    this.counters = [...new Set(counters.filter((counter) => counter.trim().length > 0))]
    this.options = { ...DEFAULT_LEAK_OPTIONS, ...options }
  }

  get sampleCount(): number {
    return this.samples.length
  }

  /** Records one sample; only configured counters are retained, so memory stays bounded. */
  record(sample: ResourceSample): void {
    const atMs = Number.isFinite(sample.atMs) ? sample.atMs : 0
    const values: Record<string, number> = {}
    for (const counter of this.counters) {
      const value = sample.values[counter]
      values[counter] = typeof value === 'number' && Number.isFinite(value) ? value : 0
    }
    this.samples.push({ atMs, values })
    if (this.samples.length > this.options.capacity) {
      this.samples.splice(0, this.samples.length - this.options.capacity)
    }
  }

  reset(): void {
    this.samples.length = 0
  }

  analyse(): LeakReport {
    const counters = this.counters.map((counter) => analyseCounter(counter, this.samples, this.options))
    const leaks = counters.filter((result) => result.verdict === 'growing').map((result) => result.counter)
    const hasEnoughData = counters.some((result) => result.verdict !== 'insufficient-data')
    return {
      verdict: leaks.length > 0 ? 'leak' : hasEnoughData ? 'stable' : 'insufficient-data',
      leaks,
      counters,
    }
  }
}
