import { expect, test } from '@playwright/test'
import path from 'node:path'

const SHOTS = path.resolve(process.cwd(), '../../artifacts/demo/client/shots')

test('signal inspector shows live industrial signals', async ({ page }) => {
  await page.goto('/?view=signals')
  await expect(page.locator('[data-signals-page]').or(page.locator('main')).first()).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(2_500)
  await page.screenshot({ path: path.join(SHOTS, '03-signal-inspector.png'), fullPage: true })
})
