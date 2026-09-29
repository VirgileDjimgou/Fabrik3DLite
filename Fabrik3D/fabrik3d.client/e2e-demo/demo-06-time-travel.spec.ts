import { expect, test } from '@playwright/test'
import path from 'node:path'

const SHOTS = path.resolve(process.cwd(), '../../artifacts/demo/client/shots')

test('deterministic time travel reconstructs history read-only', async ({ page }) => {
  await page.goto('/?view=time-travel')
  await expect(page.locator('[data-tt-banner]')).toHaveAttribute('data-tt-mode', 'replay')
  await expect(page.locator('[data-tt-readonly]')).toBeVisible()
  await page.waitForTimeout(1_500)
  await page.screenshot({ path: path.join(SHOTS, '06a-time-travel-entered.png'), fullPage: true })

  await page.locator('[data-tt-scrubber]').fill('11000')
  await expect(page.locator('[data-tt-cnc-state]')).toHaveText('MACHINING')
  await expect(page.locator('[data-tt-exactness]')).toHaveText('interpolated')
  await page.screenshot({ path: path.join(SHOTS, '06b-time-travel-scrubbed.png'), fullPage: true })

  const alarmMarker = page.locator('[data-tt-marker^="alarm-"]').first()
  await alarmMarker.click()
  await expect(page.locator('[data-tt-cursor]')).toHaveText('2026-01-01T08:00:08.000Z')
  await page.screenshot({ path: path.join(SHOTS, '06c-time-travel-marker.png'), fullPage: true })
})
