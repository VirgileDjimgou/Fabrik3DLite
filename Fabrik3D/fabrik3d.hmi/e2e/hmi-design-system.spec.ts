import { expect, test } from '@playwright/test'

test.describe('industrial HMI visual hierarchy', () => {
  for (const viewport of [{ name: 'panel', width: 1280, height: 800 }, { name: 'laptop', width: 1024, height: 768 }]) {
    test(`${viewport.name} preserves neutral navigation hierarchy`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.goto('/')
      await expect(page.getByRole('link', { name: /Select job|Selectionner|Auftrag zum Starten/ })).toBeVisible()

      // Screenshot baselines are platform-specific (the committed ones are
      // win32). Compare them on the platform that owns the baseline, or when
      // a developer explicitly opts in; other platforms still validate that
      // the HMI renders the expected navigation.
      test.skip(process.platform !== 'win32' && process.env.E2E_VISUAL !== '1', 'visual baselines are win32-only')
      await expect(page).toHaveScreenshot(`hmi-home-${viewport.name}.png`, { fullPage: true, animations: 'disabled' })
    })
  }
})
