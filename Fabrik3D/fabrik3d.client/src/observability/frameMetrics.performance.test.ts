import { describe, expect, it } from 'vitest'
import { FrameMetricsSampler } from './frameMetrics'

/**
 * Recorded performance bound for the per-frame sampling hot path (S49). It runs every frame on the
 * render loop, so it must be cheap and allocation-light. The threshold is a generous regression
 * guard; the measured duration is reported for evidence.
 */
describe('frame metrics performance budget', () => {
  it('records 100k frames within the recorded bound', () => {
    const sampler = new FrameMetricsSampler(600)

    const start = performance.now()
    for (let index = 0; index < 100_000; index++) {
      sampler.record({ frameMs: 16 + (index % 5), drawCalls: 40, triangles: 12_000 })
    }
    const elapsedMs = performance.now() - start

    expect(sampler.sampleCount).toBe(600)
    expect(elapsedMs).toBeLessThan(2000)
    // eslint-disable-next-line no-console
    console.info(`[frame-metrics] recorded 100000 frames in ${elapsedMs.toFixed(1)} ms`)
  })
})
