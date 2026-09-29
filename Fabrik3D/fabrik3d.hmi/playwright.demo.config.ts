import { defineConfig } from '@playwright/test'
import path from 'node:path'

const OUT = path.resolve(process.cwd(), '../../artifacts/demo/hmi')

export default defineConfig({
  testDir: './e2e-demo',
  timeout: 120_000,
  use: {
    baseURL: process.env.DEMO_HMI_URL ?? 'http://127.0.0.1:5274',
    viewport: { width: 1440, height: 900 },
    video: { mode: 'on', size: { width: 1440, height: 900 } },
  },
  outputDir: path.join(OUT, 'raw'),
  reporter: [['list']],
})
