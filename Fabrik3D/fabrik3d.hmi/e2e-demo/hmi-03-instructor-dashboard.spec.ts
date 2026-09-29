import { expect, test } from '@playwright/test'
import path from 'node:path'

const SHOTS = path.resolve(process.cwd(), '../../artifacts/demo/hmi/shots')
const API_BASE_URL = process.env.DEMO_API_URL ?? 'http://127.0.0.1:7249'

test('instructor dashboard renders for an instructor identity', async ({ page, request }) => {
  const tokenResponse = await request.post(`${API_BASE_URL}/api/auth/dev-token`, {
    data: { role: 'Instructor', subject: 'demo-instructor' },
  })
  expect(tokenResponse.ok()).toBeTruthy()
  const token = (await tokenResponse.json()) as { accessToken: string; mode: string }
  const seededIdentity = JSON.stringify({
    subject: 'demo-instructor',
    name: 'demo-instructor',
    roles: ['Instructor'],
    mode: token.mode,
    organizationId: 'default',
    organizationName: 'Default organization',
  })
  await page.addInitScript(([accessToken, identity]) => {
    sessionStorage.setItem('fabrik3d.auth.token', accessToken)
    sessionStorage.setItem('fabrik3d.auth.identity', identity)
  }, [token.accessToken, seededIdentity] as const)

  await page.goto('/instructor')
  await expect(page.getByTestId('instructor-dashboard')).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(3_000)
  await page.screenshot({ path: path.join(SHOTS, '03-instructor-dashboard.png'), fullPage: true })
})
