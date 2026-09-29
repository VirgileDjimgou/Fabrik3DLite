import { expect, test } from '@playwright/test'
import path from 'node:path'

const SHOTS = path.resolve(process.cwd(), '../../artifacts/demo/hmi/shots')

test('operator signs in through the development login surface', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('hmi-login')).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: path.join(SHOTS, '01a-hmi-login.png') })

  await page.locator('#hmi-login-subject').fill('demo-operator')
  await page.locator('#hmi-login-role').selectOption('Operator')
  await page.getByTestId('hmi-login-submit').click()

  await expect(page.getByRole('link', { name: /Select job|Selectionner|Auftrag zum Starten/ })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('hmi-connection-badge')).toHaveClass(/hmi-status--success/, { timeout: 30_000 })
  await page.waitForTimeout(1_500)
  await page.screenshot({ path: path.join(SHOTS, '01b-hmi-workspace.png'), fullPage: true })
})
