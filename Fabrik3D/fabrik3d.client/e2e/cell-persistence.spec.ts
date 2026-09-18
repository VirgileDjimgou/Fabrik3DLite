import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

/**
 * End-to-end cell persistence flow: import a sample cell, edit it, export
 * (save) it as a file, re-import it, and run validation on the result.
 * Deterministic cell files preserve transforms and identifiers.
 */
test('cell persistence: import a sample, edit, save, and validate', async ({ page }) => {
  await page.goto('/?view=cell-editor')

  // ── Import the built-in medium sample ────────────────────────────
  await page.locator('[data-sample-select]').selectOption('medium-6axis')
  await page.locator('[data-action="load-sample"]').click()
  await expect(page.locator('[data-placement="robot-1"]')).toBeVisible()
  await expect(page.locator('[data-placement="cnc-1"]')).toBeVisible()
  await expect(page.locator('[data-placement="conveyor-1"]')).toBeVisible()
  await expect(page.locator('[data-placement="pallet-station-1"]')).toBeVisible()

  // ── Validate the imported sample ─────────────────────────────────
  await page.locator('[data-action="validate"]').click()
  await expect(page.locator('[data-validation-ok]')).toBeVisible()

  // ── Edit: move the CNC via numeric entry ─────────────────────────
  await page.locator('[data-placement="cnc-1"]').click()
  const panel = page.locator('[aria-label="Selected equipment properties"]')
  await panel.locator('[data-field="x"]').fill('1.5')
  await panel.locator('[data-field="x"]').press('Enter')
  await expect(page.locator('[data-placement="cnc-1"]')).toHaveAttribute('data-x', /1\.5/)

  // ── Save: export the cell as a file ──────────────────────────────
  const downloadPromise = page.waitForEvent('download')
  await page.locator('[data-action="export"]').click()
  const download = await downloadPromise
  const savedPath = await download.path()
  expect(savedPath).not.toBeNull()
  const text = readFileSync(savedPath!, 'utf-8')
  const exported = JSON.parse(text) as {
    schemaVersion: string
    id: string
    equipment: Array<{ id: string; definitionId: string; transform: { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number } } }>
  }
  expect(exported.schemaVersion).toBe('1.0')
  expect(exported.equipment).toHaveLength(4)
  const cnc = exported.equipment.find((e) => e.id === 'cnc-1')
  expect(cnc).toBeTruthy()
  expect(cnc!.transform.position.x).toBeCloseTo(1.5, 5)
  expect(cnc!.transform.position.z).toBeCloseTo(3.4, 5)
  // Transforms and identifiers survive the round trip.
  expect(exported.equipment.find((e) => e.id === 'robot-1')!.definitionId).toBe('medium-6axis')

  // ── Re-import the exported file and validate ─────────────────────
  await page.locator('[data-action="import"]').click()
  await page.locator('[data-file-input]').setInputFiles(savedPath!)
  await expect(page.locator('[data-save-message]')).toContainText('Imported')
  await expect(page.locator('[data-placement="cnc-1"]')).toHaveAttribute('data-x', /1\.5/)

  await page.locator('[data-action="validate"]').click()
  await expect(page.locator('[data-validation-ok]')).toBeVisible()
})