import { defineConfig } from '@playwright/test'

const API_BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:7249'
const HMI_PORT = Number(process.env.E2E_HMI_PORT ?? 5274)
const HMI_BASE_URL = process.env.E2E_HMI_URL ?? `http://127.0.0.1:${HMI_PORT}`

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    // Keep screenshot baselines project-independent so the committed
    // hmi-home-*-win32.png files keep working across projects.
    toHaveScreenshot: {
      pathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}{-platform}{ext}',
    },
  },
  reporter: [['list'], ['junit', { outputFile: 'test-results/e2e-junit.xml' }]],
  projects: [
    {
      // API-level orchestration flows — run against the live orchestrator.
      name: 'orchestrator-api',
      testMatch: /(orchestration-smoke|orchestration-claim|cell-templates)\.spec\.ts/,
      use: { baseURL: API_BASE_URL },
    },
    {
      // Rendered HMI flows — run against a locally served HMI build.
      name: 'hmi-ui',
      testMatch: /hmi-design-system\.spec\.ts/,
      use: { baseURL: HMI_BASE_URL },
    },
  ],
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${HMI_PORT} --strictPort`,
    url: HMI_BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
