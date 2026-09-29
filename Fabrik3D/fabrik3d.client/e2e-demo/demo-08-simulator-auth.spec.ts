import { expect, test } from '@playwright/test'
import path from 'node:path'

const SHOTS = path.resolve(process.cwd(), '../../artifacts/demo/client/shots')

test('simulator development login authenticates an administrator', async ({ page }) => {
  await page.goto('/')
  const authBar = page.locator('[data-simulator-auth]')
  await expect(authBar).toBeVisible({ timeout: 30_000 })

  await page.locator('[data-auth-open]').click()
  await page.locator('[data-auth-subject]').fill('demo-admin')
  await page.locator('[data-auth-role]').selectOption('Administrator')
  await page.screenshot({ path: path.join(SHOTS, '10a-simulator-login-form.png') })

  await page.locator('[data-auth-submit]').click()
  await expect(page.locator('[data-auth-identity]')).toContainText('demo-admin', { timeout: 20_000 })
  await expect(page.locator('[data-auth-identity]')).toContainText('Administrator')
  await page.waitForTimeout(1_500)
  await page.screenshot({ path: path.join(SHOTS, '10b-simulator-authenticated.png') })
})
