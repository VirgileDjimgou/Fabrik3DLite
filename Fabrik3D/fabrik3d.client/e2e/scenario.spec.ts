import { expect, test } from '@playwright/test'

/**
 * End-to-end educational scenario flow: select a scenario from the
 * catalog, run it, and verify it completes with observable progress.
 */
test('select and complete a basic scenario', async ({ page }) => {
  await page.goto('/?view=scenario')

  // The scenario catalog lists the five reference scenarios.
  const scenarios = page.locator('[data-scenario]')
  await expect(scenarios).toHaveCount(5)
  for (const id of ['robot-axes', 'coordinate-frames', 'pick-and-place', 'cnc-loading', 'pallet-processing']) {
    await expect(page.locator(`[data-scenario="${id}"]`)).toBeVisible()
  }

  // Select the beginner robot-axes scenario.
  await page.locator('[data-scenario="robot-axes"]').click()
  await expect(page.locator('[data-selected-scenario]')).toContainText('Robot axes')

  // Run it to completion.
  await page.locator('[data-action="run-scenario"]').click()
  await expect(page.locator('[data-scenario-status]')).toHaveText('completed')
  await expect(page.locator('[data-scenario-progress]')).toHaveText('100%')

  // Every activity completed.
  const completed = await page.locator('[data-scenario-status-panel] .completed li').count()
  expect(completed).toBe(5)
})

test('the reference pallet-processing scenario also completes', async ({ page }) => {
  await page.goto('/?view=scenario')
  await page.locator('[data-scenario="pallet-processing"]').click()
  await page.locator('[data-action="run-scenario"]').click()
  await expect(page.locator('[data-scenario-status]')).toHaveText('completed')
  await expect(page.locator('[data-scenario-progress]')).toHaveText('100%')
})