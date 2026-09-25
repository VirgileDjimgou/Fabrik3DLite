import { expect, test } from '@playwright/test'

/**
 * Visual regression for the engineering instructor fault lab at the documented
 * desktop and engineering-laptop resolutions.
 */
const TARGET_SIZES = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'laptop', width: 1366, height: 768 },
] as const

for (const size of TARGET_SIZES) {
  test(`fault lab renders at ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height })
    await page.goto('/?view=fault-lab')

    await expect(page.locator('[data-fault-lab]')).toBeVisible()
    await expect(page.locator('[data-fault-lab-type] option')).toHaveCount(16)
    await expect(page.locator('[data-fault-lab-signal-row]')).toHaveCount(54)
    await expect(page.locator('[data-fault-lab-value="conveyor-1.PhotoeyeStation"]')).toHaveText('true')

    await expect(page).toHaveScreenshot(`fault-lab-${size.name}.png`)
  })
}
