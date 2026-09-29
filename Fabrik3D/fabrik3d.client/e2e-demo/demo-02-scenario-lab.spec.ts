import { expect, test } from '@playwright/test'
import path from 'node:path'

const SHOTS = path.resolve(process.cwd(), '../../artifacts/demo/client/shots')

test('educational scenario catalog runs pallet processing to completion', async ({ page }) => {
  await page.goto('/?view=scenario')
  await expect(page.locator('[data-scenario]')).toHaveCount(11)
  await page.screenshot({ path: path.join(SHOTS, '02-scenario-catalog.png') })

  await page.locator('[data-scenario="pallet-processing"]').click()
  await expect(page.locator('[data-selected-scenario]')).toContainText('pallet processing')
  await page.screenshot({ path: path.join(SHOTS, '02b-scenario-selected.png') })

  await page.locator('[data-action="run-scenario"]').click()
  await page.waitForTimeout(2_500)
  await page.screenshot({ path: path.join(SHOTS, '02c-scenario-running.png') })

  await expect(page.locator('[data-scenario-status]')).toHaveText('completed', { timeout: 60_000 })
  await expect(page.locator('[data-scenario-progress]')).toHaveText('100%')
  await page.screenshot({ path: path.join(SHOTS, '02d-scenario-completed.png') })
})
