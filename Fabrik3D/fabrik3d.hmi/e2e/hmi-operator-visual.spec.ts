import { test, expect, defaultHmiDataset, type HmiDataset } from './support/deterministic'

/**
 * S62 representative visual regression for the HMI operator surfaces that are not covered by the
 * overview baseline: the Job Composer and the Robot Positions pendant. Both are rendered from the
 * deterministic in-test seed (reset → seed → scenario → ready → freeze → screenshot).
 */

const VIEWPORTS = [
  { name: 'panel', width: 1280, height: 800 },
  { name: 'laptop', width: 1024, height: 768 },
] as const

test.describe('deterministic HMI reference surfaces', () => {
  for (const viewport of VIEWPORTS) {
    test(`job composer renders at ${viewport.name}`, async ({ page, hmi }) => {
      await page.setViewportSize(viewport)
      await hmi.reset()
      await hmi.seed('Operator')
      await hmi.goto('/new-job', '[data-testid="job-composer"]')
      await hmi.ready('[data-testid="composer-steps"]')
      await expect(page.getByTestId('composer-target-cell')).toContainText('Reference CNC cell')

      await hmi.freeze()
      await hmi.screenshot(`hmi-job-composer-${viewport.name}.png`)
    })

    test(`robot positions pendant renders at ${viewport.name}`, async ({ page, hmi }) => {
      await page.setViewportSize(viewport)
      await hmi.reset()
      await hmi.seed('Operator')
      await hmi.goto('/robot-positions', '[data-testid="robot-positions"]')
      await hmi.ready('[data-testid="robot-joints"]')
      await expect(page.getByTestId('robot-state')).toHaveText('IDLE')

      await hmi.freeze()
      await hmi.screenshot(`hmi-robot-positions-${viewport.name}.png`)
    })
  }
})

test('reset and re-seed replaces prior job/machine state in the captured overview', async ({ page, hmi }) => {
  await page.setViewportSize({ width: 1280, height: 800 })

  // A prior, different seed: no active job and an idle machine.
  const stale: HmiDataset = defaultHmiDataset()
  stale.machineState = { ...stale.machineState, isRunning: false, isPaused: false, machineMode: 'Setup', robotState: 'IDLE', cncState: 'IDLE' }
  stale.jobs = []

  await hmi.reset()
  await hmi.seed('Operator', stale)
  await hmi.goto('/', '[data-testid="hmi-overview"]')
  await expect(page.getByTestId('overview-current-job')).toHaveText(/No active job|Aucun|Kein/)

  // Reset followed by the deterministic seed must clear the stale state from the same surface.
  await hmi.reset()
  await hmi.seed('Operator')
  await hmi.goto('/', '[data-testid="hmi-overview"]')
  await expect(page.getByTestId('overview-current-job')).toHaveText('Reference pallet run')
  await expect(page.getByTestId('overview-cell-state')).not.toHaveText(/No active job|Aucun|Kein/)
})
