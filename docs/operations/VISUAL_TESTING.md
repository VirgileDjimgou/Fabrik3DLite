# Deterministic visual testing

Status: **implemented (S62)**. This document defines the visual-test protocol, baseline ownership and
the manual hardware benchmark. Visual tests are evidence, not runtime authority; they never change
simulation semantics.

## Deterministic protocol

Every visual regression follows the same ordered steps. There is no step that depends on a previous
test run, on a shared database or on ambient machine state:

```text
reset                              clear browser storage, fresh document
→ deterministic database/state seed  in-test API seed (HMI) or local fixture (simulator)
→ deterministic scene/scenario       explicit scene/profile selection
→ wait until UI ready                explicit marker + stable WebGL draw-call count (fail closed)
→ freeze expected state              reduced motion, loaded fonts, settled animation frames
→ screenshot                         animations disabled, committed baseline compared
```

The shared helpers are:

| Surface | Helper | Notes |
| --- | --- | --- |
| Simulator | `Fabrik3D/fabrik3d.client/e2e/support/visual.ts` | `reset`, `seed`, `ready`, `settleRender`, `freeze`, `screenshot` |
| HMI | `Fabrik3D/fabrik3d.hmi/e2e/support/deterministic.ts` | adds an in-test API seed and disables the SignalR hub so no live event can mutate the view |

`settleRender` waits until the WebGL renderer reports a non-zero draw-call count that is identical
across several consecutive samples. If the render loop never reaches that state the test times out
(fails closed) instead of capturing a half-loaded scene. This replaces arbitrary sleeps.

## Covered surfaces

The S62 representative set (eight surfaces required by the brief):

| # | Surface | Spec | Baseline |
| --- | --- | --- | --- |
| 1 | CNC cell | `fabrik3d.client/e2e/scenario-visual.spec.ts` | `scenario-cnc-cell-<platform>.png` |
| 2 | Vision sorting | same | `scenario-vision-sorting-<platform>.png` |
| 3 | Palletizing | same | `scenario-palletizing-<platform>.png` |
| 4 | Assembly | same | `scenario-assembly-<platform>.png` |
| 5 | Safety training | same | `scenario-safety-training-<platform>.png` |
| 6 | HMI overview | `fabrik3d.hmi/e2e/hmi-design-system.spec.ts` | `hmi-home-<size>-<platform>.png` |
| 7 | Job Composer | `fabrik3d.hmi/e2e/hmi-operator-visual.spec.ts` | `hmi-job-composer-<size>-<platform>.png` |
| 8 | Robot (positions) | same | `hmi-robot-positions-<size>-<platform>.png` |

`scenario-visual.spec.ts` also contains an order-independence test: the CNC baseline is captured
first and again after a different scenario; both compare against the same committed baseline, so any
state leak fails the second capture. `hmi-operator-visual.spec.ts` proves that reset plus re-seed
replaces a prior job/machine state with the deterministic seed.

Existing visual tests (cell editor, fault lab, mapping studio, signal inspector, time travel, robot
catalog) were migrated to the same protocol; none were deleted.

## Baseline ownership

- Baselines are **win32** across the suite. Tests assert on the platform that owns the baseline or
  when `E2E_VISUAL=1` is set; other platforms still validate structure.
- `toHaveScreenshot` uses `maxDiffPixelRatio: 0.02` for the simulator and an explicit
  `pathTemplate` for the HMI.
- A baseline may only be regenerated with a **root cause**. "It failed, update it" is not a valid
  reason.
- Determinism fixes are `--workers=2` bounding in the simulator suite and a longer bounded soak
  timeout, so heavy software-rendered WebGL tests do not starve each other.

### Root-caused HMI baseline fix (S62)

The former `instructor-dashboard` snapshot failures were not nondeterminism: commit `a6de716`
(Release 1.1.0) changed the machine-status tempo badges from `text-primary` (`#0d6efd`) to the
accessible `text-primary-emphasis` (`#052c65`). The committed baseline predated that intentional
contrast fix. S62 root-causes the change, removes the shared-state dependency (the instructor
dashboard now runs from an in-test API seed) and regenerates the baseline against the corrected
token. The HMI overview no longer masks the machine-status sidebar either: its data is seeded, so
the whole surface is reproducible.

## Running the visual tests

```powershell
# Simulator (build + Playwright, includes deterministic 3D captures and the soak harness)
npm --prefix Fabrik3D/fabrik3d.client run test:visual

# HMI (needs a built dist; the visual specs mock the API and do not need a live server)
npm --prefix Fabrik3D/fabrik3d.hmi run build
npm --prefix Fabrik3D/fabrik3d.hmi exec -- playwright test --project=hmi-ui
```

Regenerating a baseline (only with a documented root cause):

```powershell
npm --prefix Fabrik3D/fabrik3d.client exec -- playwright test e2e/scenario-visual.spec.ts --update-snapshots
```

## Hardware benchmark

See [PERFORMANCE.md](./PERFORMANCE.md#s62-manual-hardware-gpu-benchmark) for the command, profiles,
recorded results and explicit non-claims. The benchmark is a separate manual Playwright config
(`playwright.benchmark.config.ts`) and is intentionally excluded from the mandatory visual gate.
