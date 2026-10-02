import { expect, test } from './support/visual'

/**
 * Visual regression for the engineering signal inspector at the documented
 * desktop and engineering-laptop resolutions.
 *
 * S62 deterministic protocol: reset → seed → scenario → ready → freeze → screenshot.
 */
const TARGET_SIZES = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'laptop', width: 1366, height: 768 },
] as const

for (const size of TARGET_SIZES) {
  test(`signal inspector renders at ${size.name}`, async ({ page, visual }) => {
    await page.setViewportSize({ width: size.width, height: size.height })
    await visual.reset()
    await visual.seed('/?view=signals', '[data-signal-inspector]')

    await expect(page.locator('[data-signal-row]')).toHaveCount(54)
    await expect(page.locator('[data-signal-value="cnc-1.SpindleSpeed"]')).toHaveText('8000')

    await visual.freeze()
    await visual.screenshot(`signal-inspector-${size.name}.png`)
  })
}
