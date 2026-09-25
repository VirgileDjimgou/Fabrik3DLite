import { expect, test } from '@playwright/test'

/**
 * Visual regression for the time-travel replay surface at the documented
 * desktop and engineering-laptop resolutions. The replay mode banner, muted
 * palette and reconstructed scene are captured together.
 */
const TARGET_SIZES = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'laptop', width: 1366, height: 768 },
] as const

for (const size of TARGET_SIZES) {
  test(`time travel renders at ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height })
    await page.goto('/?view=time-travel')

    await expect(page.locator('[data-tt-page]')).toBeVisible()
    await expect(page.locator('[data-tt-banner]')).toHaveAttribute('data-tt-mode', 'replay')
    await expect(page.locator('[data-tt-scene]')).toBeVisible()
    await expect(page.locator('[data-tt-marker]')).toHaveCount(11)

    await expect(page).toHaveScreenshot(`time-travel-${size.name}.png`)
  })
}
