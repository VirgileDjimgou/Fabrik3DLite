import { expect, test } from '@playwright/test'

/**
 * S58/S59 visual smoke: every `simulation-ready` material-flow scenario must
 * render an actual Three.js cell with the equipment required by its scene
 * preset, the plan-view `SceneLayoutPreview` must no longer be the runtime view,
 * and the S59 cell visual state must follow the authoritative run/recover
 * events. The fifth existing cell (CNC machine tending) keeps its dedicated
 * reference runtime and is smoke-checked separately.
 */
test('simulation-ready material-flow scenarios render a real 3D cell with bound visual state', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('/')
  await page.waitForSelector('[data-scene-selector]')
  await page.locator('[data-scene-selector]').evaluate((element) => {
    ;(element as HTMLDetailsElement).open = true
  })

  const cells = [
    { id: 'vision-sorting', kind: 'vision-sorting', classification: 'accepted' },
    { id: 'robot-palletizing', kind: 'robot-palletizing', layers: '1' },
    { id: 'assembly-inspection', kind: 'assembly-inspection' },
    { id: 'robot-safety-training', kind: 'robot-safety-training', gateOpen: 'false' },
  ] as const

  for (const cell of cells) {
    await page.selectOption('[data-scene-select]', cell.id)
    await expect(page.locator('[data-material-flow-host]')).toBeVisible()
    await expect(page.locator('[data-scenario-runtime]')).toBeVisible()
    await expect(page.locator('[data-layout-preview]')).toHaveCount(0)
    await expect(page.locator('canvas').first()).toBeVisible()
    await expect(page.locator('[data-runtime-equipment-count]')).not.toHaveAttribute('data-runtime-equipment-count', '0', { timeout: 20_000 })

    const cellState = page.locator('[data-cell-state]')
    await expect(cellState).toHaveAttribute('data-cell-kind', cell.kind)

    await page.locator('[data-action="run-material-flow"]').click()
    await expect(page.locator('[data-runtime-state]')).toHaveAttribute('data-runtime-state', 'running')
    if ('classification' in cell) {
      await expect(cellState).toHaveAttribute('data-cell-classification', cell.classification)
    }
    if ('layers' in cell) {
      await expect(cellState).toHaveAttribute('data-cell-layers', cell.layers)
    }
    if ('gateOpen' in cell) {
      await expect(cellState).toHaveAttribute('data-cell-gate-open', cell.gateOpen)
    }
    await page.locator('[data-action="recover-material-flow"]').click()
    await expect(page.locator('[data-runtime-state]')).toHaveAttribute('data-runtime-state', 'completed')
  }
})

test('the CNC machine-tending reference cell remains a supported 3D preset', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await page.waitForSelector('[data-scene-selector]')
  await page.locator('[data-scene-selector]').evaluate((element) => {
    ;(element as HTMLDetailsElement).open = true
  })
  await page.selectOption('[data-scene-select]', 'cnc-machine-tending')
  await expect(page.locator('canvas').first()).toBeVisible()
  await expect(page.locator('[data-layout-preview]')).toHaveCount(0)
})
