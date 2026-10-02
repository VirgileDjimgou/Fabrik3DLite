import { expect, test } from './support/visual'

/**
 * Visual regression for the time-travel replay surface at the documented
 * desktop and engineering-laptop resolutions. The replay mode banner, muted
 * palette and reconstructed scene are captured together.
 *
 * S62 deterministic protocol: reset → seed → scenario → ready → freeze → screenshot.
 */
const TARGET_SIZES = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'laptop', width: 1366, height: 768 },
] as const

for (const size of TARGET_SIZES) {
  test(`time travel renders at ${size.name}`, async ({ page, visual }) => {
    await page.setViewportSize({ width: size.width, height: size.height })
    await visual.reset()
    await visual.seed('/?view=time-travel', '[data-tt-page]')

    await expect(page.locator('[data-tt-banner]')).toHaveAttribute('data-tt-mode', 'replay')
    await expect(page.locator('[data-tt-scene]')).toBeVisible()
    await expect(page.locator('[data-tt-marker]')).toHaveCount(11)

    await visual.freeze()
    await visual.screenshot(`time-travel-${size.name}.png`)
  })
}
