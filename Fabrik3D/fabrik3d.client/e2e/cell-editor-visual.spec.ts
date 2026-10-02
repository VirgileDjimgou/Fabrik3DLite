import { expect, test } from './support/visual'

/**
 * Visual regression for the cell editor at the S09 target sizes:
 * desktop, laptop, and a wide touch panel.
 *
 * S62 deterministic protocol: reset → seed → scenario → ready → freeze → screenshot.
 */
const TARGET_SIZES = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'wide-touch', width: 1920, height: 1080 },
] as const

for (const size of TARGET_SIZES) {
  test(`cell editor renders at ${size.name}`, async ({ page, visual }) => {
    await page.setViewportSize({ width: size.width, height: size.height })
    await visual.reset()
    await visual.seed('/?view=cell-editor', '[data-canvas]')

    const canvas = page.locator('[data-canvas]')
    await expect(canvas).toBeVisible()
    await expect(page.locator('[data-placement="robot-1"]')).toBeVisible()

    // Deterministic scenario: select the CNC to show the property panel with reach metadata.
    await page.locator('[data-placement="cnc-1"]').click()
    await expect(page.locator('[data-placement="cnc-1"].selected')).toBeVisible()

    await visual.freeze()
    await visual.screenshot(`cell-editor-${size.name}.png`)
  })
}
