import { expect, test } from './support/visual'

/**
 * Visual regression for the engineering signal mapping studio at the documented
 * desktop and engineering-laptop resolutions.
 *
 * S62 deterministic protocol: reset → seed → scenario → ready → freeze → screenshot.
 */
const TARGET_SIZES = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'laptop', width: 1366, height: 768 },
] as const

for (const size of TARGET_SIZES) {
  test(`mapping studio renders at ${size.name}`, async ({ page, visual }) => {
    await page.setViewportSize({ width: size.width, height: size.height })
    await visual.reset()
    await visual.seed('/?view=mapping-studio', '[data-mapping-studio]')

    await expect(page.locator('[data-mapping-row]')).toHaveCount(6)
    await expect(page.locator('[data-validation-summary]')).toContainText('0 errors')
    await expect(page.locator('[data-monitor-internal="opcua-cnc-spindle-speed"]')).toHaveText('8000')

    await visual.freeze()
    await visual.screenshot(`mapping-studio-${size.name}.png`)
  })
}
