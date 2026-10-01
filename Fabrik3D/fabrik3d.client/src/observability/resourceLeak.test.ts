import { describe, expect, it } from 'vitest'
import { ResourceLeakDetector, analyseCounter, linearSlope, type ResourceSample } from './resourceLeak'

function series(counter: string, values: number[], stepMs = 60_000): ResourceSample[] {
  return values.map((value, index) => ({ atMs: index * stepMs, values: { [counter]: value } }))
}

describe('linear slope', () => {
  it('returns 0 for degenerate input', () => {
    expect(linearSlope([], [])).toBe(0)
    expect(linearSlope([0], [5])).toBe(0)
    expect(linearSlope([1, 1, 1], [2, 5, 9])).toBe(0)
  })

  it('computes a positive slope for a linear series', () => {
    expect(linearSlope([0, 1, 2, 3], [0, 2, 4, 6])).toBeCloseTo(2, 9)
  })
})

describe('counter analysis', () => {
  it('reports insufficient data below the minimum sample count', () => {
    const result = analyseCounter('connections', series('connections', [1, 2]))
    expect(result.verdict).toBe('insufficient-data')
  })

  it('detects a slow sustained leak', () => {
    const result = analyseCounter('connections', series('connections', [10, 11, 12, 13, 14, 15, 16, 17]))
    expect(result.verdict).toBe('growing')
    expect(result.slopePerMinute).toBeGreaterThan(0)
    expect(result.relativeGrowth).toBeGreaterThan(0)
  })

  it('treats a constant series as stable', () => {
    const result = analyseCounter('connections', series('connections', [5, 5, 5, 5, 5, 5, 5, 5]))
    expect(result.verdict).toBe('stable')
  })

  it('treats noise around a constant baseline as stable, not a leak', () => {
    const result = analyseCounter('heapBytes', series('heapBytes', [100, 104, 99, 103, 101, 98, 102, 100]))
    expect(result.verdict).toBe('stable')
  })

  it('detects a shrinking series', () => {
    const result = analyseCounter('tokens', series('tokens', [20, 17, 15, 12, 10, 8, 5, 3]))
    expect(result.verdict).toBe('shrinking')
  })

  it('ignores non-finite samples', () => {
    const samples = series('timers', [1, 1, 1, 1, 1, 1])
    samples.push({ atMs: 999_999, values: { timers: Number.NaN } })
    const result = analyseCounter('timers', samples)
    expect(result.samples).toBe(6)
    expect(result.verdict).toBe('stable')
  })
})

describe('resource leak detector', () => {
  it('reports a leak verdict when any configured counter grows', () => {
    const detector = new ResourceLeakDetector(['connections', 'heapBytes'])
    const values = [1, 2, 3, 4, 5, 6, 7, 8]
    values.forEach((value, index) => {
      detector.record({ atMs: index * 60_000, values: { connections: value, heapBytes: 100 } })
    })
    const report = detector.analyse()
    expect(report.verdict).toBe('leak')
    expect(report.leaks).toEqual(['connections'])
    expect(report.counters).toHaveLength(2)
  })

  it('reports stable when every counter is flat across enough samples', () => {
    const detector = new ResourceLeakDetector(['connections', 'timers'], { minSamples: 4 })
    for (let index = 0; index < 8; index++) {
      detector.record({ atMs: index * 60_000, values: { connections: 3, timers: 0 } })
    }
    const report = detector.analyse()
    expect(report.verdict).toBe('stable')
    expect(report.leaks).toEqual([])
  })

  it('never converts insufficient data into stable', () => {
    const detector = new ResourceLeakDetector(['connections'], { minSamples: 8 })
    detector.record({ atMs: 0, values: { connections: 1 } })
    detector.record({ atMs: 1000, values: { connections: 1 } })
    expect(detector.analyse().verdict).toBe('insufficient-data')
  })

  it('keeps a bounded window so a long soak never grows without limit', () => {
    const detector = new ResourceLeakDetector(['connections'], { capacity: 10 })
    for (let index = 0; index < 500; index++) detector.record({ atMs: index, values: { connections: index } })
    expect(detector.sampleCount).toBe(10)
  })

  it('is deterministic and resettable', () => {
    const detector = new ResourceLeakDetector(['connections'])
    for (let index = 0; index < 6; index++) detector.record({ atMs: index * 1000, values: { connections: index } })
    const first = detector.analyse()
    const second = detector.analyse()
    expect(second).toEqual(first)
    detector.reset()
    expect(detector.sampleCount).toBe(0)
    expect(detector.analyse().verdict).toBe('insufficient-data')
  })
})
