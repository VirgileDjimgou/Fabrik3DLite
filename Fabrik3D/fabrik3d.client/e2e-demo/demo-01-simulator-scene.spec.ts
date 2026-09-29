import { expect, test } from '@playwright/test'
import path from 'node:path'

const SHOTS = path.resolve(process.cwd(), '../../artifacts/demo/client/shots')

test('simulator 3D scene renders with live orchestrator state', async ({ page }) => {
  await page.goto('/')
  await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 60_000 })
  // Allow the WebGL scene, SignalR connection and telemetry badges to settle.
  await page.waitForTimeout(6_000)
  await page.screenshot({ path: path.join(SHOTS, '01-simulator-3d-scene.png'), fullPage: false })
  await page.waitForTimeout(4_000)
  await page.screenshot({ path: path.join(SHOTS, '01b-simulator-3d-scene-later.png'), fullPage: false })
  expect(await page.locator('canvas').count()).toBeGreaterThan(0)
})
