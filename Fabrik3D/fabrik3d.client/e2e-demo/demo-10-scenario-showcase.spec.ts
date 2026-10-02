import { expect, test, type VisualSteps } from '../e2e/support/visual'
import type { Page } from '@playwright/test'
import path from 'node:path'

/**
 * S64 flagship scenario showcase captures.
 *
 * Deterministic, reproducible captures of the five scenario-specific 3D cells for the curated
 * media set under `artifacts/demo/flagship/`. Each capture follows the same protocol as the S62
 * visual regressions (reset → scene → stable render → freeze) and is written as a still image;
 * no video is recorded here because the brief prefers a small curated set over large generated
 * video files.
 *
 * These are demo captures, not screenshot assertions: they never compare against a baseline and
 * never update one. Run with the demo Playwright config against a local simulator preview.
 */

test.use({ video: 'off' })

const SHOTS = path.resolve(process.cwd(), '../../artifacts/demo/flagship/shots')
const VIEWPORT = { width: 1440, height: 900 } as const

const SCENES = [
  { id: 'cnc-machine-tending', name: 'hero-cnc-cell' },
  { id: 'vision-sorting', name: 'scenario-vision-sorting' },
  { id: 'robot-palletizing', name: 'scenario-palletizing' },
  { id: 'assembly-inspection', name: 'scenario-assembly-inspection' },
  { id: 'robot-safety-training', name: 'scenario-safety-training' },
] as const

async function selectScene(page: Page, visual: VisualSteps, id: string): Promise<void> {
  await visual.reset()
  await visual.seed('/?diagnostics=1', '[data-scene-selector]')
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
  test(`showcase capture: ${scene.name}`, async ({ page, visual }) => {
    test.setTimeout(120_000)
    await page.setViewportSize(VIEWPORT)
    await selectScene(page, visual, scene.id)
    await page.screenshot({ path: path.join(SHOTS, `${scene.name}.png`) })
  })
}
