import { expect, test, type VisualSteps } from '../e2e/support/visual'
import type { Page } from '@playwright/test'
import path from 'node:path'

/**
 * S76 Revision 5 flagship execution captures.
 *
 * The Revision 5 validation must show the improved visuals of the S72–S75 work
 * (procedural surface maps and grounding, anchor-driven assembled modules,
 * industrial lighting/post-processing and state-driven equipment motion) while
 * the scenario is really executing. It reuses the same authoritative S67
 * `?stage=<stageId>` capture hook and the S62 deterministic visual protocol as
 * the Revision 4 captures (demo-11), but forces the `quality=high` preset so the
 * industrial environment, local lights and quality-gated composer path are part
 * of the captured frame.
 *
 * Output is deliberately written to `execution-revision5/` so the committed
 * Revision 4 execution captures under `execution/` stay intact.
 *
 * These are demo captures, not screenshot assertions: they never compare against
 * a baseline and never update one. Run with the demo Playwright config against a
 * local simulator preview:
 *
 * ```powershell
 * npm --prefix Fabrik3D/fabrik3d.client run build
 * npx playwright test --config=playwright.demo.config.ts demo-12-revision5-flagship.spec.ts --workers=1
 * ```
 */

test.use({ video: 'off' })

const SHOTS = path.resolve(process.cwd(), '../../artifacts/demo/flagship/execution-revision5')
const VIEWPORT = { width: 1440, height: 900 } as const
const QUALITY = 'high'

/**
 * The five flagship scenarios and the declared stage each capture must show.
 * The stage ids are the stable S67 machine ids from the scenario catalog; the
 * capture fails closed if a stage is not reached.
 */
const SCENARIOS = [
  {
    scene: 'robot-palletizing',
    name: 'palletizing',
    stages: ['palletizing-robot-approach', 'palletizing-pick', 'palletizing-transfer', 'palletizing-place', 'palletizing-layer-update'],
  },
  {
    scene: 'vision-sorting',
    name: 'vision-sorting',
    stages: ['vision-part-enters', 'vision-inspection-begins', 'vision-classified', 'vision-diverter-actuates', 'vision-part-routes'],
  },
  {
    scene: 'assembly-inspection',
    name: 'assembly-inspection',
    stages: ['assembly-robot-load', 'assembly-fixture-clamp', 'assembly-inspection', 'assembly-decision-accept', 'assembly-unclamp'],
  },
  {
    scene: 'robot-safety-training',
    name: 'safety-training',
    stages: ['safety-unsafe-state', 'safety-detection', 'safety-motion-inhibited', 'safety-state-restored', 'safety-operator-acknowledged'],
  },
] as const

async function openStage(page: Page, visual: VisualSteps, scene: string, stage: string): Promise<void> {
  await visual.reset()
  await visual.seed(`/?diagnostics=1&quality=${QUALITY}&stage=${encodeURIComponent(stage)}`, '[data-scene-selector]')
  await page.locator('[data-scene-selector]').evaluate((element) => {
    ;(element as HTMLDetailsElement).open = true
  })
  await page.selectOption('[data-scene-select]', scene)
  await visual.ready('[data-scenario-runtime]')
  await expect(page.locator('[data-runtime-equipment-count]')).not.toHaveAttribute(
    'data-runtime-equipment-count',
    '0',
    { timeout: 20_000 },
  )
  // The capture hook drives the declared process after the visuals bind; wait
  // for the explicit reached marker so a mid-load frame can never be captured.
  await expect(page.locator('[data-execution-stage]')).toHaveAttribute('data-execution-stage-reached', 'true', {
    timeout: 30_000,
  })
  await expect(page.locator('[data-execution-stage]')).toHaveAttribute('data-execution-stage-id', stage)
  await visual.settleRender()
  await visual.freeze()
}

for (const scenario of SCENARIOS) {
  for (const stage of scenario.stages) {
    test(`revision 5 execution capture: ${scenario.name} ${stage}`, async ({ page, visual }) => {
      test.setTimeout(180_000)
      await page.setViewportSize(VIEWPORT)
      await openStage(page, visual, scenario.scene, stage)
      await page.screenshot({ path: path.join(SHOTS, `${scenario.name}-${stage}.png`) })
    })
  }
}

/**
 * CNC reference cell execution capture.
 *
 * The CNC cell is the hero reference runtime, not a material-flow scenario, so
 * it has no `?stage=` hook. Its authoritative HMI → server → simulator →
 * historian workflow is proven by the automated `FlagshipWorkflowIntegrationTests`,
 * `FlagshipDemoHistorianTests` and the HMI `flagship-demo.spec.ts`; this capture
 * shows the same cell executing locally (the clearly-labelled offline demo when
 * no orchestrator is reachable) at the high quality preset.
 */
test('revision 5 execution capture: cnc-cell running', async ({ page, visual }) => {
  test.setTimeout(180_000)
  await page.setViewportSize(VIEWPORT)
  await visual.reset()
  await visual.seed(`/?diagnostics=1&quality=${QUALITY}`, '[data-scene-selector]')
  await page.locator('[data-scene-selector]').evaluate((element) => {
    ;(element as HTMLDetailsElement).open = true
  })
  await page.selectOption('[data-scene-select]', 'cnc-machine-tending')
  await visual.ready('canvas')
  await visual.settleRender()

  // Start the local offline demonstration and wait for the authoritative run
  // state to become `running` before capturing. The offline pallet feed delivers
  // a pallet on the simulation clock, so the first Start may be refused until a
  // pallet is stopped at the work station; retry on a bounded deterministic
  // poll and fail closed if the workflow never starts.
  const dashboard = page.locator('[data-pallet-dashboard]')
  const startButton = dashboard.locator('button', { hasText: 'Start' }).first()
  await expect
    .poll(
      async () => {
        if ((await dashboard.getAttribute('data-run-state')) === 'running') return 'running'
        if (await startButton.isEnabled()) await startButton.click()
        return dashboard.getAttribute('data-run-state')
      },
      { timeout: 90_000, intervals: [500, 1000, 2000] },
    )
    .toBe('running')
  await visual.settleRender()
  await visual.freeze()
  await page.screenshot({ path: path.join(SHOTS, 'cnc-cell-running.png') })
})
