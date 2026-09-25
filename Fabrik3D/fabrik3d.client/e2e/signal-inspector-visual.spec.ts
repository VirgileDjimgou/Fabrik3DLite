import { expect, test } from '@playwright/test'

/**
 * Visual regression for the engineering signal inspector at the documented
 * desktop and engineering-laptop resolutions.
 */
const TARGET_SIZES = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'laptop', width: 1366, height: 768 },
] as const

for (const size of TARGET_SIZES) {
  test(`signal inspector renders at ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height })
    await page.goto('/?view=signals')

    await expect(page.locator('[data-signal-inspector]')).toBeVisible()
    await expect(page.locator('[data-signal-row]')).toHaveCount(54)
    await expect(page.locator('[data-signal-value="cnc-1.SpindleSpeed"]')).toHaveText('8000')

    await expect(page).toHaveScreenshot(`signal-inspector-${size.name}.png`)
  })
}
