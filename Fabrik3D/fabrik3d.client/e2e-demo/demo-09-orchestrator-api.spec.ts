import { test } from '@playwright/test'
import path from 'node:path'

const SHOTS = path.resolve(process.cwd(), '../../artifacts/demo/client/shots')
const API = process.env.DEMO_API_URL ?? 'http://127.0.0.1:7249'

test('orchestrator exposes swagger, health, version and diagnostics endpoints', async ({ browser, playwright }) => {
  const api = await playwright.request.newContext({ baseURL: API })
  const tokenResponse = await api.post('/api/auth/dev-token', { data: { role: 'Administrator', subject: 'demo-admin' } })
  const token = ((await tokenResponse.json()) as { accessToken: string }).accessToken
  await api.dispose()

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  })
  const page = await context.newPage()

  await page.goto(`${API}/swagger/index.html`)
  await page.waitForTimeout(3_000)
  await page.screenshot({ path: path.join(SHOTS, '11a-swagger-overview.png'), fullPage: true })

  await page.goto(`${API}/api/health/ready`)
  await page.waitForTimeout(1_000)
  await page.screenshot({ path: path.join(SHOTS, '11b-health-ready.png') })

  await page.goto(`${API}/api/version`)
  await page.waitForTimeout(1_000)
  await page.screenshot({ path: path.join(SHOTS, '11c-version.png') })

  await page.goto(`${API}/api/diagnostics/status`)
  await page.waitForTimeout(1_000)
  await page.screenshot({ path: path.join(SHOTS, '11d-diagnostics-status.png') })

  await page.goto(`${API}/api/diagnostics/metrics`)
  await page.waitForTimeout(1_000)
  await page.screenshot({ path: path.join(SHOTS, '11e-diagnostics-metrics.png') })

  await context.close()
})
