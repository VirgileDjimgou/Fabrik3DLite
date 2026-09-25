import { expect, test } from '@playwright/test'

/**
 * End-to-end instructor fault-lab workflow against the deterministic,
 * WebGL-free harness: activate a signal overlay, observe the downstream effect,
 * confirm the target, clear it, and verify the authority blocker.
 */
test.describe('instructor fault lab', () => {
  test('activates, propagates and clears a signal overlay', async ({ page }) => {
    await page.goto('/?view=fault-lab')
    await expect(page.locator('[data-fault-lab]')).toBeVisible()
    await expect(page.locator('[data-fault-lab-value="conveyor-1.PhotoeyeStation"]')).toHaveText('true')

    // Target a conveyor signal with an inverted overlay.
    await page.locator('[data-fault-lab-type]').selectOption('inverted')
    await page.locator('[data-fault-lab-equipment]').selectOption('conveyor-1')
    await page.locator('[data-fault-lab-signal]').selectOption('conveyor-1.PhotoeyeStation')
    await expect(page.locator('[data-fault-lab-target]')).toContainText('conveyor-1.PhotoeyeStation')

    await page.locator('[data-fault-lab-activate]').click()
    await expect(page.locator('[data-fault-lab-feedback]')).toHaveText('Overlay activated.')
    await expect(page.locator('[data-fault-lab-row]')).toHaveCount(1)
    // The inverted overlay changes the published downstream value.
    await expect(page.locator('[data-fault-lab-value="conveyor-1.PhotoeyeStation"]')).toHaveText('false')

    // Clearing restores the pre-fault value without a page reload.
    await page.locator('[data-fault-lab-clear]').click()
    await expect(page.locator('[data-fault-lab-empty]')).toBeVisible()
    await expect(page.locator('[data-fault-lab-value="conveyor-1.PhotoeyeStation"]')).toHaveText('true')
  })

  test('reports the blocker when an external authority owns the scope', async ({ page }) => {
    await page.goto('/?view=fault-lab&authority=external')
    await expect(page.locator('[data-fault-lab-blocked]')).toBeVisible()
    await expect(page.locator('[data-fault-lab-activate]')).toBeDisabled()
  })
})
