import { defineConfig } from '@playwright/test'

/**
 * S62 manual hardware benchmark configuration.
 *
 * It deliberately does not include the visual regression specs; run it on real hardware with a
 * headed browser so the acceleration classification reflects the actual GPU:
 *
 * ```powershell
 * npm --prefix Fabrik3D/fabrik3d.client run benchmark:gpu
 * ```
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /gpu-benchmark\.spec\.ts/,
  timeout: 300_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    launchOptions: { args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] },
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  reporter: [['list']],
})
