import { expect, test, type VisualSteps } from './support/visual'
import type { Page } from '@playwright/test'

/**
 * S74 deterministic visual regression for the industrial lighting/atmosphere and
 * quality-gated post-processing.
 *
 * The reference CNC cell and one flagship material-flow cell (robot palletizing)
 * are captured in the `low` and `high` quality presets. `low` exercises the
 * direct-render fallback (no composer, no fog, no local lights); `high` exercises
 * the full composer path (SSAO + selective bloom + SMAA) and the densest
 * atmosphere. Both follow the S62 deterministic protocol
 * (reset → seed → scenario → ready → freeze → screenshot).
 */

const VIEWPORT = { width: 1280, height: 800 } as const

const SCENES = [
  { id: 'cnc-machine-tending', name: 'cnc-cell' },
  { id: 'robot-palletizing', name: 'palletizing' },
] as const

const QUALITIES = ['low', 'high'] as const

async function selectScene(page: Page, visual: VisualSteps, id: string, quality: string): Promise<void> {
  await visual.reset()
  await visual.seed(`/?diagnostics=1&quality=${quality}`, '[data-scene-selector]')
  await page.locator('[data-scene-selector]').evaluate((element) => {
    ;(element as HTMLDetailsElement).open = true
  })
  await page.selectOption('[data-scene-select]', id)

  if (id === 'cnc-machine-tending') {
    await visual.ready('canvas')
  } else {
    await visual.ready('[data-scenario-runtime]')
    await expect(page.locator('[data-runtime-equipment-count]')).not.toHaveAttribute(
      'data-runtime-equipment-count',
      '0',
      { timeout: 20_000 },
    )
  }

  await visual.settleRender()
  await visual.freeze()
}

for (const scene of SCENES) {
  for (const quality of QUALITIES) {
    test(`deterministic visual: ${scene.name} ${quality} quality`, async ({ page, visual }) => {
      test.setTimeout(120_000)
      await page.setViewportSize(VIEWPORT)
      await selectScene(page, visual, scene.id, quality)
      await visual.screenshot(`scenario-${scene.name}-${quality}.png`)
    })
  }
}
