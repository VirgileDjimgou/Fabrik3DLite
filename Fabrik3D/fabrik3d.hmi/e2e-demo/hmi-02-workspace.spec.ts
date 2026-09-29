import { expect, test } from '@playwright/test'
import path from 'node:path'

const SHOTS = path.resolve(process.cwd(), '../../artifacts/demo/hmi/shots')
const API_BASE_URL = process.env.DEMO_API_URL ?? 'http://127.0.0.1:7249'

test('operator workspace shows live orchestration state', async ({ page, request }) => {
  const tokenResponse = await request.post(`${API_BASE_URL}/api/auth/dev-token`, {
    data: { role: 'Operator', subject: 'demo-operator' },
  })
  expect(tokenResponse.ok()).toBeTruthy()
  const token = (await tokenResponse.json()) as { accessToken: string; mode: string }
  const seededIdentity = JSON.stringify({
    subject: 'demo-operator',
    name: 'demo-operator',
    roles: ['Operator'],
    mode: token.mode,
    organizationId: 'default',
    organizationName: 'Default organization',
  })
  await page.addInitScript(([accessToken, identity]) => {
    sessionStorage.setItem('fabrik3d.auth.token', accessToken)
    sessionStorage.setItem('fabrik3d.auth.identity', identity)
  }, [token.accessToken, seededIdentity] as const)

  await page.goto('/')
  await expect(page.getByTestId('hmi-connection-badge')).toHaveClass(/hmi-status--success/, { timeout: 30_000 })
  await page.waitForTimeout(2_000)
  await page.screenshot({ path: path.join(SHOTS, '02-hmi-home-connected.png'), fullPage: true })
})
