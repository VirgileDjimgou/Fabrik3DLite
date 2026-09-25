import { expect, test } from '@playwright/test'

/**
 * End-to-end deterministic time-travel workflow against the WebGL-free harness:
 * enter replay, scrub to a point in time, jump to an event marker, confirm the
 * read-only banner, exit back to simulation and re-enter replay.
 */
test.describe('deterministic industrial time travel', () => {
  test('reconstructs, scrubs and jumps deterministically in replay mode', async ({ page }) => {
    await page.goto('/?view=time-travel')
    await expect(page.locator('[data-tt-banner]')).toHaveAttribute('data-tt-mode', 'replay')
    await expect(page.locator('[data-tt-readonly]')).toBeVisible()
    await expect(page.locator('[data-tt-cnc-state]')).toHaveText('IDLE')

    await page.locator('[data-tt-scrubber]').fill('11000')
    await expect(page.locator('[data-tt-cnc-state]')).toHaveText('MACHINING')
    await expect(page.locator('[data-tt-exactness]')).toHaveText('interpolated')
    await expect(page.locator('[data-tt-alarm="alarm-1"]')).toBeVisible()

    const alarmMarker = page.locator('[data-tt-marker^="alarm-"]').first()
    await alarmMarker.click()
    await expect(page.locator('[data-tt-cursor]')).toHaveText('2026-01-01T08:00:08.000Z')
  })

  test('exits replay back to simulation and re-enters', async ({ page }) => {
    await page.goto('/?view=time-travel')
    await page.locator('[data-tt-exit]').click()
    await expect(page.locator('[data-tt-banner]')).toHaveAttribute('data-tt-mode', 'simulation')
    await expect(page.locator('[data-tt-readonly]')).toHaveCount(0)

    await page.locator('[data-tt-enter]').click()
    await expect(page.locator('[data-tt-banner]')).toHaveAttribute('data-tt-mode', 'replay')
  })
})
