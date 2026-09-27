import { defineConfig, devices } from '@playwright/test'

/**
 * S49 browser-validation matrix for the operator HMI accessibility checks.
 *
 * The default `playwright.config.ts` serves the day-to-day e2e suite with project names that
 * partition by *behaviour* (API vs rendered UI), which makes Playwright reject `--browser`.
 * This dedicated config partitions the same rendered accessibility spec by *engine* instead, so the
 * WCAG 2.2 AA checks run on every browser that is available on the host:
 * bundled Chromium, installed Google Chrome and Microsoft Edge (Chromium), Firefox and WebKit
 * (the Safari engine). Results and versions are recorded in docs/operations/BROWSER_SUPPORT.md.
 *
 * Run with `npm --prefix Fabrik3D/fabrik3d.hmi run test:a11y` while an orchestrator listens on
 * E2E_BASE_URL (default http://127.0.0.1:7249).
 */
const HMI_PORT = Number(process.env.E2E_HMI_PORT ?? 5274)
const HMI_BASE_URL = process.env.E2E_HMI_URL ?? `http://127.0.0.1:${HMI_PORT}`

export default defineConfig({
  testDir: './e2e',
  testMatch: /hmi-accessibility\.spec\.ts/,
  timeout: 30_000,
  fullyParallel: false,
  reporter: [['list'], ['junit', { outputFile: 'test-results/a11y-matrix-junit.xml' }]],
  use: { baseURL: HMI_BASE_URL },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'msedge', use: { ...devices['Desktop Chrome'], channel: 'msedge' } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${HMI_PORT} --strictPort`,
    url: HMI_BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
