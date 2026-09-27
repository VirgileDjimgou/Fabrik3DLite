import { expect, test } from '@playwright/test'

/**
 * S49 browser frame-time measurement. It records real `requestAnimationFrame` intervals while the
 * reference scene renders and reports p50/p95/max. This is a recorded measurement, not a strict
 * budget: headless Chromium uses software rendering, so the numbers are an upper bound for CI.
 */
test('records reference-scene browser frame times', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/')
  await page.waitForSelector('[data-scene-selector]')

  const samples = await page.evaluate(async () => {
    const frames: number[] = []
    let previous = performance.now()
    const start = previous
    await new Promise<void>((resolve) => {
      const tick = (now: number) => {
        frames.push(now - previous)
        previous = now
        if (now - start >= 3000) resolve()
        else requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    return frames.slice(1)
  })

  const sorted = [...samples].sort((a, b) => a - b)
  const at = (fraction: number) => sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))]!
  const mean = sorted.reduce((total, value) => total + value, 0) / sorted.length
  const p50 = at(0.5)
  const p95 = at(0.95)
  const max = sorted[sorted.length - 1]!

  // eslint-disable-next-line no-console
  console.info(
    `[browser-perf] frames=${sorted.length} mean=${mean.toFixed(2)}ms p50=${p50.toFixed(2)}ms ` +
      `p95=${p95.toFixed(2)}ms max=${max.toFixed(2)}ms`,
  )

  expect(sorted.length).toBeGreaterThan(0)
  expect(mean).toBeGreaterThan(0)
  // Generous regression guard for headless software rendering on CI.
  expect(p95).toBeLessThan(1000)
})
