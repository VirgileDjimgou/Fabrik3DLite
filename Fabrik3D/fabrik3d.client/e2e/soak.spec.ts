import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { ResourceLeakDetector, type ResourceSample } from '../src/observability/resourceLeak'

/**
 * S56 CI short soak.
 *
 * Only the default single-conveyor preset renders a WebGL scene; the other presets render a static
 * layout preview. This soak therefore leaves the WebGL scene (unmounting and disposing its GPU
 * resources) and reloads it each cycle, then asserts that counters which must return to a steady state
 * (estimated texture bytes and draw calls) do not grow. JS heap is sampled too, with an explicit forced
 * GC before each sample; the series is written to a machine-readable report for a longer manual soak.
 * This is a bounded CI soak (seconds), not the 4-8h reference soak documented in
 * docs/operations/PERFORMANCE.md.
 */
test('short soak: repeated scene loads do not grow client resources', async ({ page }) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/?diagnostics=1')
  await page.waitForSelector('[data-scene-selector]')
  await page.waitForFunction(() => Boolean((window as { __fabrik3dDiagnostics?: unknown }).__fabrik3dDiagnostics))

  const options = await page
    .locator('[data-scene-select] option')
    .evaluateAll((elements) => elements.map((element) => (element as HTMLOptionElement).value))
  expect(options.length).toBeGreaterThan(0)

  // The scene selector is a collapsed <details>; open it deterministically before interacting.
  await page.locator('[data-scene-selector]').evaluate((element) => {
    ;(element as HTMLDetailsElement).open = true
  })

  // The first preset is the WebGL/three.js cell (the catalog default); the rest are static previews.
  const webglScene = options[0]!
  const alternateScenes = options.slice(1)

  interface DiagnosticSummary {
    lastDrawCalls: number
    textureBytes: number
    sampleCount: number
  }
  const readSummary = () =>
    page.evaluate(
      () =>
        (window as { __fabrik3dDiagnostics?: { getSummary: () => unknown } }).__fabrik3dDiagnostics!.getSummary() as
          | DiagnosticSummary
          | null,
    )
  const forceGc = () => page.evaluate(() => (window as { gc?: () => void }).gc?.())

  const cycles = 12
  const detector = new ResourceLeakDetector(['textureBytes', 'drawCalls'], {
    minSamples: 4,
    growthRatioThreshold: 0.25,
    slopePerMinuteThreshold: 0.5,
  })
  const heapSeries: number[] = []
  const samples: ResourceSample[] = []

  for (let cycle = 0; cycle < cycles; cycle++) {
    // Leave the WebGL scene so its component unmounts and disposes its GPU resources...
    if (alternateScenes.length > 0) {
      await page.selectOption('[data-scene-select]', alternateScenes[cycle % alternateScenes.length]!)
    }
    // ...then reload it via the reset control, which forces a fresh scene mount every cycle.
    await page.locator('[data-action="reset-scene"]').click()
    await page.waitForFunction(() => Boolean((window as { __fabrik3dDiagnostics?: unknown }).__fabrik3dDiagnostics))
    await page.waitForTimeout(350)
    await forceGc()
    const summary = await readSummary()
    expect(summary, 'diagnostics summary must be available during the soak').not.toBeNull()
    const heapBytes = await page.evaluate(
      () => (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize ?? 0,
    )
    heapSeries.push(heapBytes)
    samples.push({ atMs: cycle * 350, values: { textureBytes: summary!.textureBytes, drawCalls: summary!.lastDrawCalls } })
    detector.record(samples[samples.length - 1]!)
  }

  const report = detector.analyse()
  const heapStart = heapSeries[0] ?? 0
  const heapEnd = heapSeries[heapSeries.length - 1] ?? 0
  const payload = {
    schemaVersion: '1.0',
    recordedAt: new Date().toISOString(),
    harness: 'ci-short-soak',
    viewport: '1920x1080',
    cycles,
    webglScene,
    alternateScenes,
    samples,
    heapSeries,
    heapGrowthBytes: heapEnd - heapStart,
    report,
  }

  const directory = resolve('test-results', 'perf')
  mkdirSync(directory, { recursive: true })
  writeFileSync(resolve(directory, 'soak.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

  // eslint-disable-next-line no-console
  console.info(`[soak] ${JSON.stringify(report)} heapGrowthBytes=${heapEnd - heapStart}`)

  expect(report.verdict).not.toBe('insufficient-data')
  expect(report.leaks).toEqual([])
  expect(heapEnd).toBeLessThan(300 * 1024 * 1024)
})
