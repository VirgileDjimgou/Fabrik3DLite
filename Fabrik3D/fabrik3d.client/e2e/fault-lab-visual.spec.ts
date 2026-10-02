import { expect, test } from './support/visual'

/**
 * Visual regression for the engineering instructor fault lab at the documented
 * desktop and engineering-laptop resolutions.
 *
 * S62 deterministic protocol: reset → seed → scenario → ready → freeze → screenshot.
 */
const TARGET_SIZES = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'laptop', width: 1366, height: 768 },
] as const

for (const size of TARGET_SIZES) {
  test(`fault lab renders at ${size.name}`, async ({ page, visual }) => {
    await page.setViewportSize({ width: size.width, height: size.height })
    await visual.reset()
    await visual.seed('/?view=fault-lab', '[data-fault-lab]')

    await expect(page.locator('[data-fault-lab-type] option')).toHaveCount(16)
    await expect(page.locator('[data-fault-lab-signal-row]')).toHaveCount(54)
    await expect(page.locator('[data-fault-lab-value="conveyor-1.PhotoeyeStation"]')).toHaveText('true')

    await visual.freeze()
    await visual.screenshot(`fault-lab-${size.name}.png`)
  })
}
