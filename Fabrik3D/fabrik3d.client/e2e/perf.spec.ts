import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { createPerformanceRunResult, describePerformanceRunResult, validatePerformanceRunResult } from '../src/observability/performanceBudget'
import type { RendererIdentity } from '../src/observability/acceleration'
import type { SimulatorFrameSummary } from '../src/observability/frameMetrics'

/**
 * S49 (extended S56) browser frame-time measurement.
 *
 * It records real `requestAnimationFrame` intervals and the renderer's own draw-call/triangle
 * counters while the reference scene renders at 1920x1080, classifies acceleration from the observed
 * WebGL renderer identity and writes a machine-readable run result. Headless Chromium uses software
 * rendering, so the numbers are an honest CI upper bound, not a GPU result.
 */
test('records a machine-readable reference-scene performance run', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/?diagnostics=1')
  await page.waitForSelector('[data-scene-selector]')
  await page.waitForFunction(() => Boolean((window as { __fabrik3dDiagnostics?: unknown }).__fabrik3dDiagnostics))

  await page.evaluate(() => (window as { __fabrik3dDiagnostics?: { reset: () => void } }).__fabrik3dDiagnostics!.reset())

  const intervals = await page.evaluate(async () => {
    const frames: number[] = []
    let previous = performance.now()
    const start = previous
    await new Promise<void>((resolveRun) => {
      const tick = (now: number) => {
        frames.push(now - previous)
        previous = now
        if (now - start >= 3000) resolveRun()
        else requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    return frames.slice(1)
  })

  const summary = await page.evaluate(
    () =>
      (window as { __fabrik3dDiagnostics?: { getSummary: () => unknown } }).__fabrik3dDiagnostics!.getSummary() as SimulatorFrameSummary | null,
  )
  const rendererIdentity = await page.evaluate(
    () =>
      (window as { __fabrik3dDiagnostics?: { getRendererIdentity: () => unknown } }).__fabrik3dDiagnostics!.getRendererIdentity() as
        | RendererIdentity
        | null,
  )
  const quality = await page.evaluate(
    () => (window as { __fabrik3dDiagnostics?: { getQuality: () => string | null } }).__fabrik3dDiagnostics!.getQuality() ?? 'medium',
  )
  const viewport = page.viewportSize()

  expect(intervals.length).toBeGreaterThan(0)
  expect(summary).not.toBeNull()

  const result = createPerformanceRunResult({
    runtime: `playwright ${process.env.npm_package_version ?? 'chromium'}`,
    browser: `${test.info().project.name} (headless)`,
    rendererIdentity: rendererIdentity ?? { vendor: '', renderer: '', unmaskedVendor: '', unmaskedRenderer: '' },
    resolution: `${viewport?.width ?? 1920}x${viewport?.height ?? 1080}`,
    qualityProfile: (quality === 'low' || quality === 'high' ? quality : 'medium') as 'low' | 'medium' | 'high',
    sceneId: 'reference-cell',
    seed: 20260956,
    summary: summary!,
    // Coarse software-rasterizer liveness ceiling: CI runs headless SwiftShader under parallel load,
    // where recorded means vary from ~0.23 s to ~1.2 s per frame. This guards against a catastrophic
    // regression (a near-hang), not against GPU variance; hardware budgets are only adopted after
    // repeat runs on the documented hardware classes (see docs/operations/PERFORMANCE.md).
    budgets: [
      { id: 'p95-frame-ms', metric: 'p95FrameMs', max: 5000, unit: 'ms' },
      { id: 'p99-frame-ms', metric: 'p99FrameMs', max: 6000, unit: 'ms' },
      { id: 'mean-frame-ms', metric: 'meanFrameMs', max: 5000, unit: 'ms' },
    ],
  })

  expect(validatePerformanceRunResult(result)).toEqual([])
  // eslint-disable-next-line no-console
  console.info(describePerformanceRunResult(result))

  const directory = resolve('test-results', 'perf')
  mkdirSync(directory, { recursive: true })
  writeFileSync(resolve(directory, 'browser-perf.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')

  // Generous regression guards for headless software rendering on CI.
  expect(result.budgets.passed, `budgets failed: ${result.budgets.failed.join(', ')}`).toBe(true)
})
