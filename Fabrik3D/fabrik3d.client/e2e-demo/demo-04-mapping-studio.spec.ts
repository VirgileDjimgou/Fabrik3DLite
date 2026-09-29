import { expect, test } from '@playwright/test'
import path from 'node:path'

const SHOTS = path.resolve(process.cwd(), '../../artifacts/demo/client/shots')

test('signal mapping studio validates, applies and monitors mappings', async ({ page }) => {
  await page.goto('/?view=mapping-studio')
  await expect(page.locator('[data-mapping-studio]')).toBeVisible()
  await expect(page.locator('[data-mapping-row]')).toHaveCount(6)
  await page.screenshot({ path: path.join(SHOTS, '04-mapping-studio.png'), fullPage: true })

  await page.locator('[data-monitor-equipment]').selectOption('cnc-1')
  await expect(page.locator('[data-monitor-internal="opcua-cnc-spindle-speed"]')).toHaveText('8000')
  await page.locator('[data-action="apply"]').click()
  await expect(page.locator('[data-mapping-status]')).toContainText('Applied 6 mapping(s)')
  await page.waitForTimeout(1_000)
  await page.screenshot({ path: path.join(SHOTS, '04b-mapping-applied.png'), fullPage: true })
})
