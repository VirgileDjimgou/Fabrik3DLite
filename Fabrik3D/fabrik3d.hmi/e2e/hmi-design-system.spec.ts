import { expect, test } from '@playwright/test'

test.describe('industrial HMI visual hierarchy', () => {
  for (const viewport of [{ name: 'panel', width: 1280, height: 800 }, { name: 'laptop', width: 1024, height: 768 }]) {
    test(`${viewport.name} preserves neutral navigation hierarchy`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.goto('/')
      await expect(page.getByRole('link', { name: /Select job|Selectionner|Auftrag zum Starten/ })).toBeVisible()
      await expect(page).toHaveScreenshot(`hmi-home-${viewport.name}.png`, { fullPage: true, animations: 'disabled' })
    })
  }
})
