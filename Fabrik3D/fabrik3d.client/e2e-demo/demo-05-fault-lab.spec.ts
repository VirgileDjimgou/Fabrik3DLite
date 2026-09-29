import { expect, test } from '@playwright/test'
import path from 'node:path'

const SHOTS = path.resolve(process.cwd(), '../../artifacts/demo/client/shots')

test('instructor fault lab injects, propagates and clears a signal overlay', async ({ page }) => {
  await page.goto('/?view=fault-lab')
  await expect(page.locator('[data-fault-lab]')).toBeVisible()
  await expect(page.locator('[data-fault-lab-value="conveyor-1.PhotoeyeStation"]')).toHaveText('true')
  await page.screenshot({ path: path.join(SHOTS, '05a-fault-lab-idle.png'), fullPage: true })

  await page.locator('[data-fault-lab-type]').selectOption('inverted')
  await page.locator('[data-fault-lab-equipment]').selectOption('conveyor-1')
  await page.locator('[data-fault-lab-signal]').selectOption('conveyor-1.PhotoeyeStation')
  await page.locator('[data-fault-lab-activate]').click()
  await expect(page.locator('[data-fault-lab-feedback]')).toHaveText('Overlay activated.')
  await expect(page.locator('[data-fault-lab-value="conveyor-1.PhotoeyeStation"]')).toHaveText('false')
  await page.screenshot({ path: path.join(SHOTS, '05b-fault-lab-active.png'), fullPage: true })

  await page.locator('[data-fault-lab-clear]').click()
  await expect(page.locator('[data-fault-lab-empty]')).toBeVisible()
  await page.screenshot({ path: path.join(SHOTS, '05c-fault-lab-cleared.png'), fullPage: true })
})
