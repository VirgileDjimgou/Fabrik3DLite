import { expect, test } from '@playwright/test'

/**
 * Visual regression for the robot selection UI at the target screen
 * sizes used by the HMI (desktop, touch tablet, phone). The page under
 * test is a WebGL-free harness (?view=robot-catalog) so screenshots are
 * deterministic regardless of the browser's WebGL backend.
 */

const TARGET_SIZES = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'tablet-touch', width: 768, height: 1024 },
  { name: 'phone', width: 390, height: 844 },
] as const

for (const size of TARGET_SIZES) {
  test(`robot selection renders and switches profiles at ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height })
    await page.goto('/?view=robot-catalog')

    const panel = page.locator('.robot-catalog-panel')
    await expect(panel).toBeVisible()
    await expect(panel.locator('.robot-option')).toHaveCount(3)

    // Default profile metadata is visible.
    await expect(panel.locator('[data-selected-robot="medium-6axis"]')).toBeVisible()

    // Selecting a different profile updates the details block.
    await panel.locator('[data-robot-id="heavy-6axis"]').click()
    await expect(panel.locator('[data-selected-robot="heavy-6axis"]')).toBeVisible()
    await expect(panel.locator('[data-selected-robot="heavy-6axis"]')).toContainText('50 kg')

    await expect(page).toHaveScreenshot(`robot-catalog-${size.name}.png`)
  })
}
