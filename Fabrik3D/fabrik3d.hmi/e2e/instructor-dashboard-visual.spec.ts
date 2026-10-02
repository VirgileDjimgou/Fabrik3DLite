import { expect, test } from './support/deterministic'

/**
 * Visual regression for the instructor dashboard (S45) at desktop and laptop widths.
 *
 * S62 deterministic protocol: reset → seed → scenario → ready → freeze → screenshot. The dashboard
 * API and identity are seeded in-test, so the layout is independent of shared backend data and of
 * any previous test run.
 */

test.describe('instructor dashboard visual hierarchy', () => {
  for (const viewport of [{ name: 'panel', width: 1280, height: 800 }, { name: 'laptop', width: 1024, height: 768 }]) {
    test(`${viewport.name} renders the role-gated instructor surface`, async ({ page, hmi }) => {
      await page.setViewportSize(viewport)
      await hmi.reset()
      await hmi.seed('Instructor')
      await hmi.goto('/instructor', '[data-testid="instructor-dashboard"]')

      await expect(page.getByTestId('metric-completionRate')).toContainText('%')
      await expect(page.getByTestId('comparison-table')).toBeVisible()

      await hmi.freeze()
      await hmi.screenshot(`instructor-dashboard-${viewport.name}.png`)
    })
  }
})
