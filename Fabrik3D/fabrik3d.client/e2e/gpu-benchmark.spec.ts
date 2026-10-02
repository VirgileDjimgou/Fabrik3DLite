import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import {
  BENCHMARK_PROFILE_NAMES,
  createBenchmarkMetrics,
  createGpuBenchmarkReport,
  describeGpuBenchmarkReport,
  resolveBenchmarkProfile,
  validateGpuBenchmarkReport,
  type BenchmarkQuality,
  type GpuBenchmarkRun,
} from '../src/observability/gpuBenchmark'
import type { RendererIdentity } from '../src/observability/acceleration'
import type { SimulatorFrameSummary } from '../src/observability/frameMetrics'

/**
 * S62 manual hardware GPU benchmark.
 *
 * This is NOT part of the mandatory visual gate. Run it on a real GPU with a headed browser:
 *
 * ```powershell
 * npm --prefix Fabrik3D/fabrik3d.client run benchmark:gpu
 * ```
 *
 * It records the full S62 metric set (renderer, resolution, quality profile, FPS, p50/p95/p99 frame
 * time, draw calls, triangles, textures, renderer memory where available and load duration) for the
 * hero CNC cell and the most complex secondary scenario (robot palletizing, 40 draw calls / 15
 * equipment per the S59 measurements) across the Performance, Balanced and Quality profiles.
 *
 * A headless/software run is honestly classified as `software` and never presented as GPU evidence.
 */

const SCENES = [
  { id: 'cnc-machine-tending', label: 'CNC machine tending (hero reference cell)' },
  { id: 'robot-palletizing', label: 'Robot palletizing (most complex secondary cell)' },
] as const

const MEASUREMENT_MS = 3000

async function selectScene(page: Page, id: string): Promise<void> {
  await page.waitForSelector('[data-scene-selector]')
  await page.locator('[data-scene-selector]').evaluate((element) => {
    ;(element as HTMLDetailsElement).open = true
  })
  await page.selectOption('[data-scene-select]', id)
  if (id === 'cnc-machine-tending') {
    await page.locator('canvas').first().waitFor({ state: 'visible' })
  } else {
    await page.locator('[data-scenario-runtime]').waitFor({ state: 'visible' })
    await expect(page.locator('[data-runtime-equipment-count]')).not.toHaveAttribute('data-runtime-equipment-count', '0', { timeout: 20_000 })
  }
}

async function waitForStableRender(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const diagnostics = (window as { __fabrik3dDiagnostics?: { getSummary: () => { lastDrawCalls: number } | null } }).__fabrik3dDiagnostics
      if (!diagnostics) return false
      const summary = diagnostics.getSummary()
      return Boolean(summary && summary.lastDrawCalls > 0)
    },
    undefined,
    { timeout: 20_000, polling: 100 },
  )
  // Settle a short, bounded window so the first frames after load do not skew the measurement.
  await page.waitForTimeout(500)
}

test('records a manual hardware GPU benchmark across profiles and scenes', async ({ page }) => {
  test.setTimeout(300_000)
  await page.setViewportSize({ width: 1920, height: 1080 })

  const runs: GpuBenchmarkRun[] = []

  for (const scene of SCENES) {
    for (const profileName of BENCHMARK_PROFILE_NAMES) {
      const profile = resolveBenchmarkProfile(profileName)
      const startedAt = Date.now()
      await page.goto(`/?diagnostics=1&quality=${profile.quality}`)
      await selectScene(page, scene.id)
      await waitForStableRender(page)
      const loadDurationMs = Date.now() - startedAt

      await page.evaluate(() => (window as { __fabrik3dDiagnostics?: { reset: () => void } }).__fabrik3dDiagnostics?.reset())

      const intervals = await page.evaluate(async (measurementMs) => {
        const frames: number[] = []
        let previous = performance.now()
        const start = previous
        await new Promise<void>((resolveRun) => {
          const tick = (now: number) => {
            frames.push(now - previous)
            previous = now
            if (now - start >= measurementMs) resolveRun()
            else requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        })
        return frames.slice(1)
      }, MEASUREMENT_MS)

      const summary = await page.evaluate(
        () => (window as { __fabrik3dDiagnostics?: { getSummary: () => unknown } }).__fabrik3dDiagnostics?.getSummary() as SimulatorFrameSummary | null,
      )
      const rendererIdentity = await page.evaluate(
        () =>
          (window as { __fabrik3dDiagnostics?: { getRendererIdentity: () => unknown } }).__fabrik3dDiagnostics?.getRendererIdentity() as
            | RendererIdentity
            | null,
      )
      const viewport = page.viewportSize()

      expect(intervals.length, `no frames measured for ${scene.id}/${profileName}`).toBeGreaterThan(0)
      expect(summary, `no summary for ${scene.id}/${profileName}`).not.toBeNull()

      const metrics = createBenchmarkMetrics({
        rendererIdentity,
        resolution: `${viewport?.width ?? 1920}x${viewport?.height ?? 1080}`,
        requestedProfile: profileName,
        resolvedProfile: profile.quality as BenchmarkQuality,
        summary: {
          ...summary!,
          // The measured window is authoritative for the frame count.
          sampleCount: intervals.length,
        },
        loadDurationMs,
      })

      runs.push({ sceneId: scene.id, sceneLabel: scene.label, metrics })
      // eslint-disable-next-line no-console
      console.info(
        `${scene.id} ${profileName}: renderer="${metrics.renderer}" acceleration=${metrics.acceleration} ` +
          `fps=${metrics.fps.toFixed(1)} p50=${metrics.frameP50Ms.toFixed(2)}ms p95=${metrics.frameP95Ms.toFixed(2)}ms ` +
          `p99=${metrics.frameP99Ms.toFixed(2)}ms draws=${metrics.drawCalls} tris=${metrics.triangles} ` +
          `textures=${metrics.textureCount} texBytes=${metrics.textureBytes} heap=${metrics.heapUsedBytes} load=${metrics.loadDurationMs}ms`,
      )
    }
  }

  const headless = test.info().project.use.headless !== false
  const report = createGpuBenchmarkReport({
    runtime: `playwright ${process.env.npm_package_version ?? 'chromium'}`,
    browser: `${test.info().project.name || 'chromium'} (${headless ? 'headless' : 'headed'})`,
    runs,
  })

  expect(validateGpuBenchmarkReport(report)).toEqual([])
  // eslint-disable-next-line no-console
  console.info(describeGpuBenchmarkReport(report))

  const directory = resolve('test-results', 'perf')
  mkdirSync(directory, { recursive: true })
  writeFileSync(resolve(directory, 'gpu-benchmark.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
})
