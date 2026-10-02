# Real 3D scenario runtime (S58) and scenario-specific cells (S59)

Before S58 the non-CNC scene presets were logically simulated but were rendered as
a plan-view `SceneLayoutPreview`. S58 makes every `simulation-ready` scenario
execute inside a real Three.js industrial cell, composed from data rather than a
bespoke Vue application per scenario. S59 gives each of those cells the industrial
equipment and visible behaviours its scenario logic actually needs. S60 (robot/cell
visual fidelity) and S62 (deterministic visual QA) build on this foundation.

## Resolution chain

A scenario resolves deterministically:

```text
Scenario → compatible ScenePreset → CellDefinition
        → equipment instances → visual assets → runtime behaviors → expected events
```

The pure-data layer is `src/scenarios/`:

| Module | Responsibility |
| --- | --- |
| `visualProfile.ts` | `ScenarioVisualProfile`: preferred preset, environment level, expected equipment classes, optional camera framing |
| `sceneBinding.ts` | `ScenarioSceneBinding`: resolves scenario → preset → cell, validates compatibility, reports diagnostics and fallbacks |
| `runtimeBinding.ts` | `ScenarioRuntimeBinding`: derives the ordered expected events and the `run`/`recovery` program |
| `ScenarioRuntimeHost.ts` | Reusable Three.js host owned by the simulator runtime, not by a component |

`resolveScenarioSceneBinding(scenarioId, catalog)` never throws for an unknown
scenario, preset or equipment class. It composes a safe default scene and records
explicit diagnostics (`unknown_scenario`, `no_compatible_preset`,
`missing_equipment_class`, `profile_fallback`, …). This keeps scenario logic
executable even when a visual cannot be resolved.

## Visual profile and fallback

A `ScenarioVisualProfile` is versioned data (`1.0`) with:

- `scenePresetId` — the preferred compatible preset;
- `environmentLevel` — `industrial-hall` or `training-lab`;
- `equipmentClasses` — equipment definition classes the 3D cell must contain;
- optional `camera` — framing override; otherwise the scene preset camera is used.

When no profile exists, `deriveScenarioVisualProfile` builds one from the
resolved preset's `CellDefinition`. A profile that expects equipment the cell does
not provide produces a `missing_equipment_class` warning and that class resolves to
the generic procedural visual rather than failing.

## Deterministic runtime binding

`scenarioExpectedEventSequence` returns the scenario's `expectedEvent` specs in
declared activity order. `createScenarioEventProgram` splits them into the events
applied on **run** (every activity except the final acknowledgement) and on
**recovery** (the final event). For the built-in material-flow scenarios this is
`[scenario.ready, <process>]` then `[scenario.recovered]`, exactly matching the
historical host. Events are applied by the existing `ScenarioRunner` state
machine, so scenario outcomes are independent of render frame rate and unchanged
by the new host (see `runtimeBinding.test.ts` equivalence tests).

## Host lifecycle

`ScenarioRuntimeHost` exposes:

- `bind(binding)` / `initialize()` — construct the deterministic runner and idle
  scenario state synchronously;
- `loadVisuals()` — acquire one visual per `CellDefinition.equipment` instance
  from the shared `EquipmentAssetRuntime`, apply the SI transform and measure the
  scene;
- `switch(binding)` — unload the previous runtime, rebind and load the new cell;
- `placeCamera(camera)` — position the camera from the scenario/scene data;
- `dispose()` — release every instance-owned resource and detach the root;
- `run()` / `recover()` / `apply(events)` — deterministic scenario state.

`MaterialFlowScenarioHost.vue` is the generic wiring component. It renders one
`ThreeScene` containing a renderless `ScenarioRuntimeScene.vue` (which injects the
scene context and shared asset runtime) plus the operator overlay. No per-scenario
Vue application was introduced; composition is data-driven.

## Visual assets and fallback

Each equipment class resolves to a shared `EquipmentAssetRuntime` asset id
(`resolveEquipmentAssetId`). Robot classes use the existing procedural robot
visual, conveyor classes the procedural conveyor, pallet classes the procedural
pallet station, and every other class a registered procedural visual built by
`createMaterialFlowVisual` (keyed by equipment class, never by scenario id).
Unknown classes get a generic block with a diagnostic. Scenario-specific GLB
upgrades are S59/S60 work; the visual layer can be swapped without touching
scenario definitions, state or success criteria.

Procedural instance geometry and materials are disposed on unload, and GLB
instances are released through the runtime's reference counting, so repeated
scenario switching does not leak GPU resources.

## Scenario-specific industrial cells (S59)

S59 replaces the generic 4-column composition grid with hand-placed, SI-metre
`CellDefinition`s in `src/scenes/materialFlowCells.ts`, and adds a render-only
visual state layer (`src/scenarios/cellVisualState.ts` +
`src/scenarios/ScenarioCellAnimator.ts`). The required equipment per cell is
declared once in `src/scenarios/cellComposition.ts`; the same table feeds the
visual profiles and the composition tests, so a cell cannot silently lose the
equipment its scenario needs.

### Cell inventory

| Cell | Required equipment (definition classes) |
| --- | --- |
| Vision sorting | infeed `straight-conveyor`, `vision-inspection-station`, `photoelectric-sensor` (camera/sensor), `diverter-pusher`, accepted + reject `storage-bin` (2), `plc-cabinet`, `operator-hmi-pedestal`, `configurable-part` workpieces |
| Robot palletizing | `fanuc-like-6axis`, `vacuum-gripper`, `straight-conveyor`, `carton` boxes, empty + completed `euro-pallet` (2), `infeed-buffer`, `outfeed-buffer`, `fence-panel` (2), `light-curtain`, `robot-controller-cabinet` |
| Assembly / inspection | `fanuc-like-6axis`, `machining-fixture`, `toggle-clamp` clamps (2), `configurable-part`, `part-presence-sensor`, `barcode-rfid-reader`, `workholding-adapter` assembly station, `outfeed-buffer` accepted/rework, `operator-hmi-pedestal` |
| Robot safety training | `fanuc-like-6axis`, `fence-panel` (2), `interlocked-gate`, `area-scanner`, `emergency-stop`, `stack-light`, `safety-zone` access/protected zones (2) |
| CNC machine tending | Unchanged S39/S55 reference cell (`SINGLE_CONVEYOR_CELL`); still rendered by `SingleConveyorCellLayout.vue` |

`vision-inspection-station` and `safety-zone` are infrastructure/safety props with
procedural visuals in `materialFlowVisuals.ts`; they are not new scenario
categories, protocols, databases or frameworks.

### Visible-state binding

`CellVisualState` is pure data derived from the scenario's expected-event
sequence and declared fault injections. `ScenarioRuntimeHost` reduces every
authoritative event it observes into a new state and pushes it to the animator;
the animator never feeds state back to the runner. State-bearing nodes are named
(`userData.semanticId`), so a visual is replaceable without changing scenario
truth.

| Scenario | Animated visible behaviour |
| --- | --- |
| Vision sorting normal | workpiece travels infeed → inspection → accepted lane; inspection lens/light green; accepted bin signal |
| Vision sorting jam | workpiece stalled at the diverter with a red inspection/sensor; on recovery the diverter extends and the part routes to the reject lane |
| Palletizing normal | box travels conveyor → pick → placed layer; gripper/vacuum indicator; completed pallet signal |
| Palletizing vacuum loss | gripper indicator and light curtain red, box stays on the infeed until recovery |
| Assembly / inspection | clamp handle rotates, part-presence sensor green, rework buffer signal |
| Safety training | gate slides open/closed, interlock and scanner colour, E-stop button depressed/released, stack light red/amber/green, floor zone colour |

The stack light, scanner, E-stop and floor-zone colours are all driven from the
same state that drives the scenario outcome; no decorative animation contradicts
the simulation. `MaterialFlowScenarioHost` exposes the resulting values as
`data-cell-*` attributes for automated smoke tests.

### Fallbacks

A missing asset, unknown equipment class or missing profile still resolves
through the S58 procedural fallback and never blocks scenario execution or alters
events. An unknown class renders the generic block with a diagnostic; a missing
state-bearing node is skipped by the animator (it reports the applied values it
actually found via `snapshot()`), so an optional decorative asset can be absent
without changing scenario state.

## Boundaries

- `Definition ≠ Runtime ≠ Visual ≠ Collision ≠ Telemetry` is preserved: visual
  meshes never become authority for state, events, collision or telemetry.
- The server stays the orchestration source of truth; the simulator stays
  execution/visualization; the HMI stays the operator interface.
- Existing scenario ids, expected events and success criteria are unchanged.
- Unknown visual profiles fall back to a valid composed scene; a missing asset
  never blocks scenario logic.

## Evidence

GPU-free evidence is recorded by:

- `sceneBinding.test.ts` — resolution chain, compatibility, fallback and missing
  equipment class;
- `runtimeBinding.test.ts` — event ordering, run/recovery split and equivalence
  with observing each expected event for every catalog scenario;
- `ScenarioRuntimeHost.test.ts` — load/switch/dispose idempotence, resource
  release bounds, camera placement, unknown-class degradation and deterministic
  state;
- `cellComposition.test.ts` (S59) — every simulation-ready scenario resolves to a
  cell containing the required equipment classes and instance counts, including
  accepted/reject bins, both pallet roles, and the safety-cell devices;
- `cellVisualState.test.ts` (S59) — event-to-visible-state binding, jam/vacuum
  fault visibility, recovery clearing and the safety gate/scanner/E-stop changes;
- `ScenarioCellAnimator.test.ts` (S59) — node-level binding of part travel,
  inspection, classification, diverter, box placement, clamps, gate, E-stop and
  stack light, plus host-level run/recover equivalence for every material-flow
  scenario;
- `materialFlowVisuals.test.ts` — deterministic per-class visuals, declared
  dimensions and procedural asset registration;
- `e2e/scenario-3d-runtime.spec.ts` — browser smoke that each material-flow preset
  renders a canvas, reports 3D equipment, shows its bound cell state after
  run/recover, and that the CNC reference cell still renders.

`scenarioRuntimeMetrics.test.ts` writes a bounded GPU-free report to
`test-results/perf/scenario-runtime-metrics.json`. Recorded on the CI host
(2026-10-02, procedural visuals, no WebGL) after the S59 cell expansion:

| Scenario | Equipment | Meshes | Triangles | Draw calls | Load ms |
| --- | --- | --- | --- | --- | --- |
| `sorting-normal-cycle` | 11 | 27 | 480 | 27 | 8.7 |
| `palletizing-normal-cycle` | 15 | 40 | 532 | 40 | 4.4 |
| `assembly-inspection-cycle` | 12 | 31 | 476 | 31 | 3.4 |
| `safety-door-recovery` | 11 | 29 | 660 | 29 | 10.5 |

Before S58 these presets rendered an SVG plan view: 0 meshes, 0 triangles and 0
WebGL draw calls. Load time is wall-clock host time, not GPU frame time; the
reference-scene frame-time probe remains `e2e/perf.spec.ts` and is not a
per-scenario GPU claim. Repeated switching is covered by the S58 host tests and
the S56 soak, which keeps `drawCalls` flat across cycles.
