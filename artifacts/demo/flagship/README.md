# Flagship media set (Revision 3–4)

A small, curated set of **real, deterministic** captures of the Fabrik3D Revision 3 and Revision 4
surfaces. This supersedes the stale 2026-09-27 scenario captures for product presentation; the older
`artifacts/demo/client/shots/` gallery remains as historical evidence and is not deleted.

Every image was produced by the running application — never mocked, never fabricated. Captures that
come from the S62 deterministic visual-regression protocol are labelled as such and can be
reproduced exactly.

## Captures

| File | What it shows | Source | Reproduce |
| --- | --- | --- | --- |
| `shots/hero-cnc-cell.png` | Hero CNC reference cell with the S55 generated GLB assets | Demo capture (S64) | `npx playwright test --config=playwright.demo.config.ts demo-10-scenario-showcase.spec.ts` (simulator) |
| `shots/scenario-vision-sorting.png` | Vision-sorting 3D cell with its scenario-specific equipment | Demo capture (S64) | same |
| `shots/scenario-palletizing.png` | Palletizing 3D cell | Demo capture (S64) | same |
| `shots/scenario-assembly-inspection.png` | Assembly / inspection 3D cell | Demo capture (S64) | same |
| `shots/scenario-safety-training.png` | Safety-training 3D cell with guarding | Demo capture (S64) | same |
| `shots/hmi-overview.png` | Operator HMI overview | S62 deterministic baseline | `hmi/e2e/hmi-design-system.spec.ts` |
| `shots/hmi-job-composer.png` | HMI Job Composer | S62 deterministic baseline | `hmi/e2e/hmi-operator-visual.spec.ts` |
| `shots/hmi-robot-positions.png` | HMI robot-positions pendant | S62 deterministic baseline | `hmi/e2e/hmi-operator-visual.spec.ts` |
| `shots/hmi-instructor-dashboard.png` | Instructor dashboard | S62 deterministic baseline | `hmi/e2e/instructor-dashboard-visual.spec.ts` |
| `shots/fault-lab.png` | Simulated fault injection | S62 deterministic baseline | `client/e2e/fault-lab-visual.spec.ts` |
| `shots/time-travel.png` | Deterministic read-only time travel | S62 deterministic baseline | `client/e2e/time-travel-visual.spec.ts` |

## Execution captures (Revision 4, S71)

`execution/` holds 21 stills that show **real declared process stages**, not idle cells, for the five
flagship scenarios. Each is produced by the committed
`Fabrik3D/fabrik3d.client/e2e-demo/demo-11-execution-stages.spec.ts`, which drives the existing S67
guided process to a declared stage through the `?stage=<stageId>` hook, waits for the explicit
`data-execution-stage-reached="true"` marker and then follows the deterministic visual protocol
(reset → seed → ready → settle → freeze). A stage that is not reached fails the test closed.

| Scenario | Stages captured |
| --- | --- |
| Palletizing | `palletizing-robot-approach`, `palletizing-pick`, `palletizing-transfer`, `palletizing-place`, `palletizing-layer-update` |
| Vision sorting | `vision-part-enters`, `vision-inspection-begins`, `vision-classified`, `vision-diverter-actuates`, `vision-part-routes` |
| Assembly / inspection | `assembly-robot-load`, `assembly-fixture-clamp`, `assembly-inspection`, `assembly-decision-accept`, `assembly-unclamp` |
| Safety training | `safety-unsafe-state`, `safety-detection`, `safety-motion-inhibited`, `safety-state-restored`, `safety-operator-acknowledged` |
| CNC | `cnc-cell-running` |

Reproduce:

```powershell
npm --prefix Fabrik3D/fabrik3d.client run build
npm --prefix Fabrik3D/fabrik3d.client run preview -- --host 127.0.0.1 --port 4173 --strictPort
npx playwright test --config=playwright.demo.config.ts demo-11-execution-stages.spec.ts --workers=1
```

These are demo media, not byte-compared visual-regression baselines: re-running reproduces every
stage and assertion, while individual PNG bytes may vary by a few hundred bytes because the freeze
happens after real render frames. The CNC capture shows the deterministic local execution; its
authoritative HMI → server → simulator → historian workflow is proven separately by the automated
flagship tests (see [`../../../docs/operations/VALIDATION_REVISION_4.md`](../../../docs/operations/VALIDATION_REVISION_4.md)).

## Provenance and boundary statements

- The five 3D captures were produced on 2026-10-02 against the built simulator with software
  rendering (headless Chromium, no GPU path claimed). They show the scenario-specific cells
  assembled by the S58 scene runtime; they are not GPU benchmarks.
- The HMI, fault-lab and time-travel images are the committed S62 deterministic visual-regression
  baselines (captured with the hub offline and an explicit in-test seed), copied here for
  presentation. They are byte-identical to the baselines that the automated visual gate compares.
- No secret, token, credential or personal datum appears in any capture.
- All equipment, signals and faults are simulated. Nothing here is a safety, OEM-emulation or
  real-PLC claim.

## Why no large videos are committed

The brief explicitly prefers a small curated set of stills over dozens of redundant or oversized
generated videos. Product walkthrough video remains hosted (see the README) and the reproducible
demo Playwright suites can regenerate short WebM captures on demand without committing them.
