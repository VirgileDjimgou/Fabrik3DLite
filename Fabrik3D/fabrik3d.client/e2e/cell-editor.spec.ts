import { expect, test } from '@playwright/test'

/**
 * Playwright flow for the visual cell editor: load the built-in template,
 * modify the cell with drag + numeric entry, verify invalid overlap
 * feedback, undo/redo, and recreate the reference cell from the catalog.
 */
test('cell editor flow: create, modify, undo, and recreate the reference cell', async ({ page }) => {
  await page.goto('/?view=cell-editor')
  const canvas = page.locator('[data-canvas]')
  await expect(canvas).toBeVisible()

  // ── The reference template is loaded ─────────────────────────────
  for (const id of ['robot-1', 'cnc-1', 'conveyor-1', 'pallet-station-1']) {
    await expect(page.locator(`[data-placement="${id}"]`)).toBeVisible()
  }
  await expect(page.locator('[data-invalid-count]')).toHaveCount(0)

  // ── Drag the CNC onto the robot → invalid overlap is shown ───────
  const cnc = page.locator('[data-placement="cnc-1"]')
  const robot = page.locator('[data-placement="robot-1"]')
  const cncBox = await cnc.boundingBox()
  const robotBox = await robot.boundingBox()
  expect(cncBox).not.toBeNull()
  expect(robotBox).not.toBeNull()

  await page.mouse.move(cncBox!.x + cncBox!.width / 2, cncBox!.y + cncBox!.height / 2)
  await page.mouse.down()
  await page.mouse.move(robotBox!.x + robotBox!.width / 2, robotBox!.y + robotBox!.height / 2, { steps: 8 })
  await page.mouse.up()

  await expect(page.locator('[data-invalid-count]')).toContainText('invalid')
  await expect(cnc).toHaveClass(/invalid/)
  await expect(page.locator('[data-invalid-indicator]')).toBeVisible()

  // ── Undo restores a valid placement ──────────────────────────────
  await page.locator('[data-action="undo"]').click()
  await expect(page.locator('[data-invalid-count]')).toHaveCount(0)
  await expect(cnc).toHaveAttribute('data-z', /3\.4/)

  // ── Numeric transform entry updates the placement ────────────────
  await cnc.click()
  const panel = page.locator('[aria-label="Selected equipment properties"]')
  const xInput = panel.locator('[data-field="x"]')
  await xInput.fill('1.0')
  await xInput.press('Enter')
  await expect(cnc).toHaveAttribute('data-x', /^1$/)

  // ── Undo / redo across numeric edits ─────────────────────────────
  await page.locator('[data-action="undo"]').click()
  await expect(cnc).toHaveAttribute('data-x', /^0$/)
  await page.locator('[data-action="redo"]').click()
  await expect(cnc).toHaveAttribute('data-x', /^1$/)

// ── Remove and re-add equipment ──────────────────────────────────
  await page.locator('[data-action="reset"]').click()
  await expect(page.locator('[data-invalid-count]')).toHaveCount(0)

  // Delete every placement via the property panel. The pallet is removed
  // before the conveyor so its centre is not covered during the click.
  for (const id of ['robot-1', 'cnc-1', 'pallet-station-1', 'conveyor-1']) {
    await page.locator(`[data-placement="${id}"]`).click()
    await page.locator('[data-action="delete"]').click()
  }
  await expect(page.locator('[data-placement]')).toHaveCount(0)

  // Rebuild the cell from the catalog. Each insert auto-selects the new
  // placement, so numeric entry positions it at the reference coordinates.
  const positionSelected = async (x: string, z: string) => {
    await panel.locator('[data-field="x"]').fill(x)
    await panel.locator('[data-field="x"]').press('Enter')
    await panel.locator('[data-field="z"]').fill(z)
    await panel.locator('[data-field="z"]').press('Enter')
  }

  await page.locator('button[data-kind="robot"]').click()
  await positionSelected('0', '0')

  await page.locator('button[data-kind="cnc"]').click()
  await positionSelected('0', '3.4')

  await page.locator('button[data-kind="conveyor"]').click()
  await positionSelected('0', '-2.4')

  await page.locator('button[data-kind="pallet-station"]').click()
  await positionSelected('0', '-2.4')

  // The rebuilt cell matches the reference geometry (no invalid overlaps).
  await expect(page.locator('[data-invalid-count]')).toHaveCount(0)
  await expect(page.locator('[data-kind="cnc"][data-placement]')).toHaveAttribute('data-z', /3\.4/)
  await expect(page.locator('[data-kind="conveyor"][data-placement]')).toHaveAttribute('data-z', /-2\.4/)
  await expect(page.locator('[data-kind="pallet-station"][data-placement]')).toHaveAttribute('data-z', /-2\.4/)
  await expect(page.locator('[data-kind="robot"][data-placement]').first()).toHaveAttribute('data-z', /0/)
})
