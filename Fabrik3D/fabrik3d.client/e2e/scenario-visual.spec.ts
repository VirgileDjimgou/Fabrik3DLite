import { expect, test, type VisualSteps } from './support/visual'
import type { Page } from '@playwright/test'

/**
 * S62 representative visual regression for the five operator-relevant simulator surfaces:
 * CNC cell, vision sorting, palletizing, assembly and safety training.
 *
 * Each capture follows the deterministic protocol (reset → seed → scenario → ready → freeze →
 * screenshot). The 3D cells are captured only after the WebGL renderer reports a stable draw-call
 * count, so a mid-load frame can never become the baseline.
 */

const VIEWPORT = { width: 1280, height: 800 } as const

const SCENES = [
  { id: 'cnc-machine-tending', name: 'cnc-cell' },
  { id: 'vision-sorting', name: 'vision-sorting' },
  { id: 'robot-palletizing', name: 'palletizing' },
  { id: 'assembly-inspection', name: 'assembly' },
  { id: 'robot-safety-training', name: 'safety-training' },
] as const

async function selectScene(page: Page, visual: VisualSteps, id: string): Promise<void> {
  await visual.reset()
  await visual.seed('/?diagnostics=1', '[data-scene-selector]')
  await page.locator('[data-scene-selector]').evaluate((element) => {
    ;(element as HTMLDetailsElement).open = true
  })
  await page.selectOption('[data-scene-select]', id)

  if (id === 'cnc-machine-tending') {
    // The CNC reference cell renders from GLB assets through the shared asset runtime and has no
    // dedicated metrics attribute; the stable-render gate is the readiness signal.
    await visual.ready('canvas')
  } else {
    // Material-flow cells expose the bound equipment count once the runtime has assembled the cell.
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
  test(`deterministic visual: ${scene.name}`, async ({ page, visual }) => {
    // Software rendering in CI is slow; the deterministic gates (not sleeps) still fail closed.
    test.setTimeout(120_000)
    await page.setViewportSize(VIEWPORT)
    await selectScene(page, visual, scene.id)
    await visual.screenshot(`scenario-${scene.name}.png`)
  })
}

/**
 * S69: the derived secondary camera views must be selectable and deterministic.
 * The overview default is already covered above; this captures the operator and
 * workcell framings for the CNC reference cell and one material-flow cell.
 */
const SECONDARY_VIEWS = [
  { id: 'cnc-machine-tending', name: 'cnc-cell' },
  { id: 'robot-palletizing', name: 'palletizing' },
] as const

for (const scene of SECONDARY_VIEWS) {
  for (const view of ['operator', 'workcell'] as const) {
    test(`deterministic visual: ${scene.name} ${view} view`, async ({ page, visual }) => {
      test.setTimeout(120_000)
      await page.setViewportSize(VIEWPORT)
      await selectScene(page, visual, scene.id)
      await page.locator(`[data-camera-view="${view}"]`).click()
      await visual.settleRender()
      await visual.freeze()
      await visual.screenshot(`scenario-${scene.name}-${view}.png`)
    })
  }
}

test('the CNC cell baseline is identical when captured first and after another scenario', async ({ page, visual }) => {
  // Three full WebGL captures: allow more than the default timeout on software rendering.
  test.setTimeout(180_000)
  await page.setViewportSize(VIEWPORT)

  // First capture in a clean context.
  await selectScene(page, visual, 'cnc-machine-tending')
  await visual.screenshot('scenario-cnc-cell.png')

  // Load a different scenario, then return: state from the previous scenario must not leak into the
  // CNC capture. Both compare against the same committed baseline, so a leak would fail the second.
  await selectScene(page, visual, 'vision-sorting')
  await selectScene(page, visual, 'cnc-machine-tending')
  await visual.screenshot('scenario-cnc-cell.png')
})
