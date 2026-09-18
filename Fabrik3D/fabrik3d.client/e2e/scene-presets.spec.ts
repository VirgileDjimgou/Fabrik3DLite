import { expect, test } from '@playwright/test'

test('selects predefined industrial scenes and resets the catalog', async ({ page }) => {
  await page.goto('/?view=scene-presets')
  const selector = page.locator('[data-scene-select]')
  await expect(selector).toHaveValue('cnc-machine-tending')

  for (const id of ['vision-sorting', 'robot-palletizing', 'assembly-inspection', 'robot-safety-training']) {
    await selector.selectOption(id)
    await expect(page.locator('[data-scene-capability]')).toContainText('Simulation ready')
    await expect(page.locator('[data-scenario-brief]')).toContainText('SIMULATED DATA')
    await expect(page.locator('[data-layout-preview]')).toBeVisible()
  }

  await page.locator('[data-action="reset-scene"]').click()
  await expect(selector).toHaveValue('cnc-machine-tending')
})
