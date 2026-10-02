import { expect, test } from './support/deterministic'

/**
 * Industrial HMI visual hierarchy (S62 deterministic protocol).
 *
 * The workspace is rendered from an explicit in-test seed instead of a live orchestrator, so the
 * machine-status sidebar no longer has to be masked: the whole surface is reproducible and no
 * snapshot depends on a previous run or on shared database state.
 */
test.describe('industrial HMI visual hierarchy', () => {
  for (const viewport of [{ name: 'panel', width: 1280, height: 800 }, { name: 'laptop', width: 1024, height: 768 }]) {
    test(`${viewport.name} preserves neutral navigation hierarchy`, async ({ page, hmi }) => {
      await page.setViewportSize(viewport)
      await hmi.reset()
      await hmi.seed('Operator')
      await hmi.goto('/', '[data-testid="hmi-overview"]')

      await expect(page.getByRole('link', { name: /Select job|Selectionner|Auftrag zum Starten/ })).toBeVisible()
      // The hub is deliberately offline in the deterministic fixture; the badge reflects that
      // stable state instead of racing transport reconnect.
      await expect(page.getByTestId('hmi-connection-badge')).toBeVisible()

      await hmi.freeze()
      await hmi.screenshot(`hmi-home-${viewport.name}.png`)
    })
  }
})
