# Flagship media set (Revision 3)

A small, curated set of **real, deterministic** captures of the Fabrik3D Revision 3 surfaces. This
supersedes the stale 2026-09-27 scenario captures for product presentation; the older
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
