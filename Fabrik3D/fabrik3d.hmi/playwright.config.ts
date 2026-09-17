import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:7249',
  },
  reporter: [['list'], ['junit', { outputFile: 'test-results/e2e-junit.xml' }]],
})
