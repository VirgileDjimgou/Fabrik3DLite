import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // The manual GPU benchmark is intentionally excluded from the mandatory visual gate; it is run
  // with playwright.benchmark.config.ts (see package.json "benchmark:gpu").
  testIgnore: /gpu-benchmark\.spec\.ts/,
  timeout: 30_000,
  // The deterministic WebGL captures and the soak harness both render software-only in CI. Bounding
  // the worker count keeps them from starving each other while remaining reproducible.
  workers: 2,
  // Assertion timeout covers slow software-rendered WebGL captures; screenshot diff tolerance stays 2%.
  expect: { timeout: 30_000, toHaveScreenshot: { maxDiffPixelRatio: 0.02 } },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    // S56 soak/performance harnesses benefit from precise heap numbers and a forced-GC hook so
    // garbage is not mistaken for a retained leak.
    launchOptions: { args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] },
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  reporter: [['list'], ['junit', { outputFile: 'test-results/e2e-junit.xml' }]],
})
