import { defineConfig } from '@playwright/test'
import path from 'node:path'

const OUT = path.resolve(process.cwd(), '../../artifacts/demo/client')

export default defineConfig({
  testDir: './e2e-demo',
  timeout: 120_000,
  use: {
    baseURL: process.env.DEMO_BASE_URL ?? 'http://127.0.0.1:4173',
    viewport: { width: 1440, height: 900 },
    video: { mode: 'on', size: { width: 1440, height: 900 } },
  },
  outputDir: path.join(OUT, 'raw'),
  reporter: [['list']],
})
