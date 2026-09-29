import { expect, test } from '@playwright/test'
import path from 'node:path'

const SHOTS = path.resolve(process.cwd(), '../../artifacts/demo/client/shots')

test('robot catalog, cell editor and scene presets render', async ({ page }) => {
  await page.goto('/?view=robot-catalog')
  await page.waitForTimeout(2_500)
  await page.screenshot({ path: path.join(SHOTS, '07-robot-catalog.png'), fullPage: true })

  await page.goto('/?view=cell-editor')
  await page.waitForTimeout(2_500)
  await page.screenshot({ path: path.join(SHOTS, '08-cell-editor.png'), fullPage: true })

  await page.goto('/?view=scene-presets')
  await page.waitForTimeout(2_500)
  await page.screenshot({ path: path.join(SHOTS, '09-scene-presets.png'), fullPage: true })
  expect(await page.locator('body').isVisible()).toBeTruthy()
})
