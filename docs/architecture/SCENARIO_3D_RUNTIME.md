# Real 3D scenario runtime (S58), scenario-specific cells (S59), industrial assets (S65), robot motion (S66) and deeper process flows (S67)

Before S58 the non-CNC scene presets were logically simulated but were rendered as
a plan-view `SceneLayoutPreview`. S58 makes every `simulation-ready` scenario
execute inside a real Three.js industrial cell, composed from data rather than a
bespoke Vue application per scenario. S59 gives each of those cells the industrial
equipment and visible behaviours its scenario logic actually needs. S60 (robot/cell
visual fidelity) and S62 (deterministic visual QA) build on this foundation. S65
replaces the simplistic procedural preference for those scenario equipment classes
with generated, license-safe GLB packages while keeping the procedural visuals as
the deterministic fallback. S66 makes the palletizing, assembly and safety cells
execute deterministic six-axis robot motion through the existing robot stack. S67
deepens the four material-flow cells into inspectable, temporally credible process
stages with a deterministic simulation-clock scheduler and Step Mode, without a
second timeline engine or a new HMI module.

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
- `placeCamera(camera, view)` — position the camera from the scenario/scene data
  using the S69 derived `overview` (default), `operator` or `workcell` framing,
  falling back to the primary default for an unknown view;
- `dispose()` — release every instance-owned resource and detach the root;
- `run()` / `recover()` / `apply(events)` — deterministic scenario state.

`MaterialFlowScenarioHost.vue` is the generic wiring component. It renders one
`ThreeScene` containing a renderless `ScenarioRuntimeScene.vue` (which injects the
scene context and shared asset runtime) plus the operator overlay. No per-scenario
Vue application was introduced; composition is data-driven.

## Visual assets and fallback

Each equipment class resolves to a shared `EquipmentAssetRuntime` asset id
(`resolveEquipmentAssetId`). Since S65 every class with a generated scenario
package prefers that GLB asset (see below); the `fanuc-like-6axis` training
manipulator uses the existing generic professional six-axis robot. Classes without
a scenario package keep the S58 procedural asset — conveyor classes the procedural
conveyor, pallet classes the procedural pallet station, and every other class a
registered procedural visual built by `createMaterialFlowVisual` (keyed by
equipment class, never by scenario id). Unknown classes get a generic block with a
diagnostic. Resolution is always `GLB → procedural fallback`, so the visual layer
can be swapped without touching scenario definitions, state or success criteria.

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
| All cells (S75) | gripper fingers/vacuum cup follow the holding state; belt marker and rollers follow the declared run/speed and stop when stopped; optional robot-base beacon follows robot state; dress-pack flex follows the joint pose |

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

## Scenario-specific industrial assets (S65)

S65 replaces the visibly simplistic *preferred* visuals of the five flagship cells
with one generated GLB package per equipment class, without creating a parallel
asset runtime. `scenarioAssets.ts` registers each package with the shared
`EquipmentAssetRegistry`/`EquipmentAssetRuntime` (`createIndustrialAssetRegistry`
calls `registerScenarioEquipmentAssets`); `resolveEquipmentAssetId` returns the
scenario package for every class that has one and falls back to the S58
procedural asset otherwise.

### Provenance, conventions and license

- **Provenance:** every package is generated by
  `node scripts/generate-industrial-glb-assets.mjs` (`npm run assets:generate`)
  from the `scenarioEquipment(definitionId, low)` builders in that script. No
  external, OEM or scanned mesh is imported; the geometry is original generic
  industrial shapes. Regenerating the tree is byte-deterministic (all package
  files have identical SHA-256 before and after a rerun).
- **License:** `Fabrik3D generated generic asset; educational use` — no OEM name
  or copied geometry is present in any manifest or license string.
- **Conventions:** SI metres, Y-up, right-handed, `equipment-base` origin,
  package-relative manifest paths, `box` collision proxy, `1.0.0` version,
  schema `1.0`.
- **Dimensions:** the declared `boundsMeters` envelope per package is in its
  committed `equipment.asset.json`; the primary geometry must fit inside it.
- **LODs:** each package ships `model.glb` plus a real `lod/lod1.glb` that keeps
  the silhouette and every semantic node while dropping fine detail.
- **Hashes:** the SHA-256 of `model.glb`, `lod/lod1.glb` and `thumbnail.svg` is
  declared in every `equipment.asset.json`; `s65ScenarioAssets.test.ts`
  recomputes all of them from disk and from the in-code manifest.
- **Budgets:** primary ≤ 6 000 triangles and 0 textures; each package declares its
  own LOD1 triangle budget, enforced by the generator (`enforceBudgets`,
  `enforceBounds`, `checkLodSemanticNodes`) and re-checked by the test.

### Inventory and measured geometry

Generated with the S65 pipeline; measured statically with the same
`measureSceneResources` semantics used by the other asset tests (draw calls are
nodes carrying a mesh; triangles are indexed counts, no GPU). Across all 26
packages the primary totals are 4 364 triangles / 187 meshes / 200 draw calls and
the LOD1 totals 1 904 triangles / 99 meshes / 104 draw calls.

| Asset id (`scenario-…-v1`) | Category | Bounds X×Y×Z (m) | LOD1 budget (tri) | Primary tri | LOD1 tri |
| --- | --- | --- | --- | --- | --- |
| `area-scanner` | safety-device | 0.26×0.23×0.26 | 400 | 252 | 52 |
| `barcode-rfid-reader` | sensor | 0.20×0.18×0.15 | 400 | 48 | 24 |
| `carton` | pallet-station | 0.40×0.31×0.30 | 300 | 36 | 12 |
| `configurable-part` | pallet-station | 0.12×0.09×0.12 | 200 | 24 | 12 |
| `diverter-pusher` | conveyor | 0.75×0.50×0.75 | 1 000 | 128 | 64 |
| `emergency-stop` | safety-device | 0.35×1.16×0.35 | 500 | 184 | 52 |
| `euro-pallet` | pallet-station | 1.20×0.15×0.80 | 800 | 108 | 72 |
| `fence-panel` | safety-device | 2.40×2.10×0.08 | 900 | 96 | 36 |
| `infeed-buffer` | pallet-station | 1.20×0.45×0.80 | 700 | 96 | 60 |
| `interlocked-gate` | safety-device | 1.20×2.10×0.08 | 800 | 84 | 24 |
| `light-curtain` | safety-device | 1.40×1.84×0.08 | 600 | 60 | 36 |
| `machining-fixture` | machine | 0.55×0.20×0.55 | 700 | 248 | 24 |
| `operator-hmi-pedestal` | machine | 0.60×1.35×0.45 | 900 | 60 | 24 |
| `outfeed-buffer` | pallet-station | 1.20×0.45×0.80 | 700 | 96 | 60 |
| `part-presence-sensor` | sensor | 0.12×0.10×0.12 | 350 | 148 | 52 |
| `photoelectric-sensor` | sensor | 0.12×0.12×0.12 | 400 | 104 | 52 |
| `plc-cabinet` | machine | 1.00×2.00×0.50 | 1 200 | 96 | 36 |
| `robot-controller-cabinet` | machine | 0.80×1.80×0.65 | 1 100 | 96 | 36 |
| `safety-zone` | safety-device | 2.50×0.05×2.50 | 600 | 108 | 60 |
| `stack-light` | safety-device | 0.15×0.66×0.15 | 450 | 376 | 120 |
| `storage-bin` | pallet-station | 0.62×0.48×0.52 | 700 | 48 | 24 |
| `straight-conveyor` | conveyor | 2.00×0.62×0.66 | 2 200 | 1 092 | 788 |
| `toggle-clamp` | machine | 0.20×0.20×0.12 | 400 | 92 | 24 |
| `vacuum-gripper` | tool | 0.20×0.14×0.20 | 500 | 248 | 24 |
| `vision-inspection-station` | machine | 0.90×2.00×0.70 | 1 600 | 188 | 124 |
| `workholding-adapter` | machine | 0.35×0.15×0.35 | 500 | 248 | 12 |

Every package is triangle-budgeted and texture-free (0 textures primary and LOD),
so this stays a moderate-budget visual layer rather than an unnecessary
photorealistic one.

### Animator node contract

`ScenarioCellAnimator` binds by `userData.semanticId`/node name. Each package
preserves its state-bearing nodes in **both** the primary and the LOD:
`belt`, `motor:main`, `sensor:infeed`/`sensor:outfeed` and material anchors for
the conveyor; `piston`/`pusher`; `opening`/`bin`; `door`/`panel`; `screen`;
runners for the pallet; legs/deck for the buffers; `gate`/`interlock`;
`post-a`/`field`/`emitter`; `fixture`/`workface`; `base`/`handle`;
`red`/`amber`/`green`; and the safety-zone edges. `SCENARIO_EQUIPMENT_CONTRACT_NODES`
declares the full animator contract (including nodes not expressible in the
portable manifest namespaces), and `s65ScenarioAssets.test.ts` asserts the nodes
in the primary, the LOD and the shared `validateAssetPackage` pipeline.

### Fallback

A missing, corrupt or incomplete package degrades to the registered
`procedural-scenario:<asset-id>` fallback through the shared runtime; the runtime
tests force a 404 and a corrupt header and assert the procedural visual plus a
diagnostic. Scenario events, success criteria and the animator are unchanged by a
visual failure.

## Scenario robot motion (S66)

S66 makes the existing palletizing, assembly/inspection and safety cells visibly
execute deterministic six-axis motion without adding a second robot engine, a
scenario timeline or a new scenario family. It reuses `RobotCatalog`,
`RobotController`, `RobotVisualBinding`, the shared FK/IK models,
`joint:j1`…`joint:j6`, `tool:flange`/`tool:tcp` and `MotionSafetyEngine`.

### Thin adapter, single authority

`ScenarioRobotMotionAdapter` is the only new runtime piece. It maps the
authoritative, already-derived `CellVisualState` to an ordered list of joint-space
waypoints (`scenarioRobotMotion.ts`) and pushes motion through the existing
controller:

```text
authoritative scenario event/state
  → CellVisualState (S59)
  → ScenarioMotionPlan waypoints (pure data)
  → MotionSafetyEngine gate
  → RobotController (sole owner of J1…J6)
  → RobotVisualBinding (mirrors joints onto semantic pivots)
```

The controller stays authoritative over the joints; the visual binding and the
carried-workpiece sync only mirror the controller. Scenario state requests motion
and is never read back out of meshes. Motion progression uses an injectable
deterministic simulation clock (`RobotController` `now` option + adapter `tick`),
never the render frame rate.

### Waypoint sequences

| Cell | Profile | Sequence |
| --- | --- | --- |
| Robot palletizing | `heavy-6axis` | home, approach box, pick, lift, transfer, approach pallet, place, release, retreat, home |
| Assembly / inspection | `compact-6axis` | home, approach source, pick, lift, transfer, approach fixture, place, release, retreat, inspection pose, home |
| Robot safety training | `medium-6axis` | home, limited demonstrative sweep, home |

Each waypoint declares a stable phase id (reused as the `MotionSafetyEngine`
phase), a duration in seconds and whether the tool carries the cell workpiece.
Waypoints are validated against the selected profile's joint limits and executed
inside the declared reach envelope.

### Simulated safety inhibition

The safety cell starts from an unsafe simulated state (E-stop pressed, interlock
open, scanner muted). While any of those simulated conditions is active the adapter
cancels the active trajectory and holds the current pose, so the robot never runs
through the condition. Motion only resumes once the existing controlled scenario
safety restart has been observed and every condition is clear. Safety behavior is
**simulated training behavior and is not certified**; the safety engine's scenario
world currently models the floor only (cell obstacle proxies are a follow-up), but
joint-limit and self-collision checks still run.

### Workpiece synchronization

While the adapter reports the workpiece held, `ScenarioRuntimeHost` moves the
active carton (palletizing) or part (assembly) to the tool frame derived from the
controller joints, transformed into the cell frame. In the assembly cell the part
settles back onto its fixture on release; palletizing keeps the S59 animator as the
authority for the carton when it is not held.

### Fallback

When no semantic robot pivots are available the adapter still drives the
controller and records a render-only diagnostic; the missing GLB degrades to the
articulated `fanuc-like-6axis` procedural fallback, which declares the same
`joint:j1`…`joint:j6` pivots. A visual failure never blocks scenario events or
success criteria.

## Deeper deterministic process flows (S67)

S67 keeps the S58/S59/S66 separation (scenario event → `CellVisualState` →
animator/robot adapter) and only adds *when* the already-authoritative scenario
events fire. The four material-flow cells are now expressed as ordered process
stages with deterministic simulation-time durations, declared fault points and
defined recovery points.

### Data and scheduler

- `ScenarioActivity` gains optional, additive S67 fields: `durationSeconds`,
  `stageId`, `faultPoint`, `recoveryPoint`. Older scenarios without them remain
  valid and fall back to a documented default duration.
- `scenarioProcess.ts` (`buildScenarioProcess` + `ScenarioProcessDriver`) turns
  the declared activities into a `ScenarioProcessDefinition`: one timed stage per
  expected-event activity, the run-phase stage count, the fault/recovery indices
  and the total declared run duration.
- The driver is pure and deterministic. It owns no scenario truth, no Three.js
  objects, no controller and no telemetry; it only schedules the events that the
  existing `ScenarioRunner` and `CellVisualState` already consume.
- Stage timing advances only through `tick(deltaSeconds)` on the simulation
  clock. It is never derived from render frames.

### Declared stages

| Cell | Declared stages |
| --- | --- |
| Vision sorting (normal) | part enters, sensor detects, conveyor advances, inspection begins, classification, diverter actuates, part routes, cycle completes |
| Vision sorting (jam) | conveyor advances, jam detected *(fault)*, operator acknowledgement *(recovery point)*, jam cleared, diverter actuates, part routed to reject |
| Palletizing (normal) | part available, robot approach, gripper on, pick, transfer, place, gripper off, layer update, cycle completes |
| Palletizing (vacuum loss) | part available, vacuum loss *(fault)*, operator acknowledgement *(recovery point)*, vacuum restored, layer update, cycle recovers |
| Assembly / inspection | part available, robot load, fixture clamp, assembly, inspection, accept/rework decision, unclamp, cycle completes |
| Safety training | unsafe state, interlock/scanner detection, motion inhibited *(fault)*, operator acknowledgement *(recovery point)*, safe state restored, controlled restart |

Each scenario keeps the explicit final acknowledgement activity, so the existing
`run`/`recovery` program split (and therefore replay/assessment behaviour) is
unchanged in continuous mode.

### Modes

- **Continuous** (the operator Run button, `ScenarioRuntimeHost.run()`):
  fast-forwards the bounded run phase on the simulation clock and emits every
  stage event in declared order. The Run command is the acknowledgement, so a
  declared fault is handled through the same deterministic recovery transitions.
- **Paced** (`startProcess()` + `tick()`): the same stages over simulation time.
- **Guided / Step Mode** (`stepProcess()`, `pauseProcess()`, `resumeProcess()`,
  `acknowledgeProcessFault()`): one meaningful stage per step. A declared fault
  pauses the process at its fault stage; the operator acknowledgement clears it
  and resumes exactly at the defined recovery point, without skipping required
  process or safety transitions.

Step Mode is exposed at the runtime host API (`ScenarioRuntimeHost` and
`ScenarioRuntimeScene`) and proven by tests; the operator overlay continues to
use the continuous Run/Recover flow, so no new HMI module was introduced.

### Visual binding

`scenario.stage` events carry the stable machine `stageId`; `scenario.fault`
events carry the declared fault type. `CellVisualState` records the current
`processStageId` and maps the known stage ids to the existing visible fields
(part stage, inspection/classification, diverter, gripper, layer, clamp,
safety flags, stack light). Unknown stages only record the stage id, so the
visual layer stays decoupled from future stages and never authors state. The
robot adapter continues to consume only the derived safety/lifecycle state, so
robot and equipment visuals reflect, but never author, scenario state.

### S67 boundaries

- Visual meshes never become authority for state, events, collision or telemetry.
- No new scenario family, no second timeline engine, no new HMI module.
- The server remains the orchestration source of truth.
- Safety behaviour is **simulated training behaviour and is not certified**.

## PBR materials and factory environment (S68)

S68 does not change scenario events, composition or success criteria. It only
raises the visual quality of the same cells:

- every procedural equipment visual, the CNC visual and the hero-cell dressing
  are built from the shared `equipment/visuals/materialLibrary.ts` vocabulary
  (painted/bare steel, aluminium, rubber, industrial plastic, glass, safety
  yellow, painted floor, wood/cardboard, screen/emissive and supporting paints);
  the library records provenance per material and, since S72, attaches bounded
  deterministic procedural surface maps to the floor, markings, signage, painted
  steel, brushed metal, wood grain and HMI-screen materials;
- `ScenarioRuntimeHost` loads the coherent `factoryEnvironment` ground layer for
  every bound cell (industrial floor, expansion joints, safety perimeter,
  operator access lane, cable tray, cell-identifier plate), sized from the
  scene preset's `environment.floorSizeMeters` and adapting to the
  `industrial-hall` / `training-lab` level; the CNC flagship cell uses the same
  builder from `SingleConveyorFloor.vue`;
- S72 additionally grounds each equipment visual: shadow flags are enforced on
  the GLB and procedural sources, a deterministic radial contact decal is
  attached under each equipment root, and generated `label:*`/`screen` GLB nodes
  receive procedural surfaces. Measured on the four material-flow cells
  (procedural fallback, GPU-free): 5–8 textures / 0.81–1.50 MiB estimated RGBA8
  per cell, inside the documented 4 MiB surface budget;
- the environment, surfaces and materials are render-only, are disposed with the
  cell, and never become an animator target, a collision proxy or scenario truth.

The wall-clock GPU benchmark is re-recorded on the documented reference machine
(Intel UHD Graphics, headed Chromium, 1920×1080, `gpuEvidence=true`): every
measured profile stayed above the 60 FPS reference target (minimum measured
78.3 FPS at the Quality profile). Exact numbers and the S62 comparison are in
[PERFORMANCE.md](../operations/PERFORMANCE.md).

## Industrial environment and post-processing (S74)

S74 does not change scenario events, composition, visual binding or success
criteria; it changes how the same cells are lit and composited. Every scenario
cell rendered through `ThreeScene`/`ScenarioRuntimeScene` now shares:

- a deterministic industrial-hall environment (procedural softbox PMREM, gradient
  background, subtle `FogExp2`) and a bounded decorative local-light rig, from
  `equipment/visuals/industrialEnvironment.ts`;
- an optional, quality-gated `EffectComposer` path (cheap depth AO + selective
  bloom + FXAA) from `equipment/visuals/postProcessing.ts`, enabled only on
  `medium`/`high` quality and a `hardware`-classified WebGL2 renderer; `low`
  quality and every unsupported/software environment keep the direct
  `renderer.render` path, which is what the CI visual baselines exercise.

The configuration and budgets (environment intensity, fog density, local-light
budget, one shadow-casting key light, bloom threshold/strength, `renderScale`)
are documented in [3D assets](3D_ASSETS.md). The S74 benchmark re-measured the
hero CNC cell and the robot-palletizing cell on the reference host: the geometry
delta is +1 draw call / +2 triangles (the gradient background quad) and every
measured profile stayed above the 60 FPS target (minimum 63.8 FPS). Exact
numbers, the S72 before/after and the non-claims are in
[PERFORMANCE.md](../operations/PERFORMANCE.md). New deterministic low/high
visual baselines for the CNC reference cell and the palletizing scenario are in
`e2e/scenario-quality-visual.spec.ts`.

## State-driven motion and instanced detail (S75)

S75 adds believable secondary motion that strictly derives from runtime state and
raises scene detail without inflating draw calls. It changes no scenario event,
composition, success criterion or signal.

- **Gripper fingers.** `ScenarioCellAnimator` binds `gripper:finger-left` /
  `gripper:finger-right` (two-finger gripper) or `gripper:vacuum-cup` (vacuum
  gripper) to the authoritative `gripperHolding` state with deterministic
  interpolation (`stateDrivenMotion.gripperFingerGap`). The fingers close on a
  held part and open on release; they never move decoratively.
- **Conveyor belt.** A `belt-marker` node travels along the belt surface and the
  `roller-transfer` rollers rotate from an accumulated offset advanced by
  `advanceBeltOffset(offset, speed, delta)`. The declared visual speed is applied
  only while the authoritative lifecycle is `running`; a stopped or completed
  cell produces no motion.
- **Dress-pack cables/hoses.** The bounded `dressPackFlex` (clamped to ±0.35 rad)
  is derived from the robot joint pose the host mirrors from the authoritative
  `RobotController`; the existing CNC door/feed/clamp behaviour is unchanged.
- **Indicator emissive.** `emissive()` now changes only the emissive channel and
  preserves the PBR base color, so switching a signal never overwrites the
  material identity. An optional `robot-base-beacon` node is driven by
  `robotBeaconSignal` (off / running / fault).
- **Instanced detail.** The factory environment places expansion joints, access
  lane ticks and cable-tray rungs as one `InstancedMesh` per repeated family
  (one draw call each) and adds human-scale dressing (silhouette mannequins,
  cabinet, extinguisher, signage boards, overhead pipe) from shared geometry and
  materials. The dressing is optional (`includeDressing`) and render-only.

All of this is render-only: no state, safety, collision or signal logic moves
into visuals, and a visual without a semantic node is skipped rather than
inventing state. The pure helpers live in `scenarios/stateDrivenMotion.ts` and
are unit-tested without a WebGL context.

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
- `scenarioProcess.test.ts` (S67) — ordered non-instantaneous stage derivation,
  fault/recovery placement, clock-driven progression, pause/resume, Step Mode
  one-stage-at-a-time, fault interruption and recovery, continuous
  auto-acknowledgement and deterministic replay, plus equivalence with the
  historical run program;
- `scenarioProcessIntegration.test.ts` (S67) — host-level Step Mode inspection of
  every intermediate stage, fault interruption and recovery, visual/robot state
  reflecting (never authoring) scenario state, deterministic paced replay, and
  the preserved continuous run/recover contract;
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
  scenario; S75 adds gripper finger interpolation, belt run/stop, emissive
  preservation, robot-base beacon and bounded dress-pack flex;
- `stateDrivenMotion.test.ts` (S75) — pure deterministic helpers: gripper gap
  interpolation, belt offset advance/wrap, stopped-conveyor no-motion, bounded
  dress-pack flex and robot-base beacon derivation;
- `materialFlowVisuals.test.ts` — deterministic per-class visuals, declared
  dimensions, S65 GLB preference (scenario class → generated package, training
  manipulator → generic professional robot) and procedural fallback registration;
- `s65ScenarioAssets.test.ts` (S65) — re-reads every committed package from disk
  and verifies the in-code manifests match byte-for-byte, recomputes every
  SHA-256, checks bounds/LOD/triangle budgets and 0 textures, asserts the full
  animator node contract in primary and LOD, runs the shared `validateAssetPackage`
  pipeline, and proves preferred-GLB loading plus deterministic procedural
  fallback after a 404 and after a corrupt GLB;
- `materialLibrary.test.ts` (S68/S72) — vocabulary consistency, provenance/license
  for every material, the bounded procedural texture registry, only-declared
  surfaces attached (plus an explicit untextured variant), shared-texture reuse,
  material-pack reuse, unknown-id rejection and scene-tree material
  identification;
- `proceduralSurfaces.test.ts` / `equipmentGrounding.test.ts` (S72) — seeded
  byte-identical surfaces, declared dimensions/color space, no `Math.random`/
  `Date.now`, canvas-to-DataTexture fallback, bounded shared cache, radial contact
  decal, recursive shadow flags, transform-following decals and label/screen
  surface mapping;
- `factoryEnvironment.test.ts` (S68/S72) — declared industrial-hall/training-lab
  features, shared-vocabulary coverage, cell identifier, requested floor size,
  deterministic bounded geometry (54 meshes / 638 triangles / 54 draw calls /
  5 textures) and deterministic disposal; S75 adds instanced repeated families
  (one draw call each) and human-scale dressing props with an opt-out;
- `s68VisualVocabulary.test.ts` / `s68ScenarioEnvironment.test.ts` (S68/S72) — every
  procedural class, the CNC visual, the hero dressing, the environment and the
  four material-flow flagship cells use only shared-vocabulary materials, load the
  factory environment, and ground each equipment visual with shadow flags and a
  contact decal;
- `scenarioRobotMotion.test.ts` (S66) — waypoint ordering, immutability, profile
  selection, joint-limit compliance, multi-joint coverage and safety-condition
  priority;
- `ScenarioRobotMotionAdapter.test.ts` (S66) — deterministic joint traces,
  repeatability, FK/tool-frame, multi-joint `RobotVisualBinding` mirroring,
  E-stop/interlock/scanner inhibition, mid-motion stop and controlled resumption,
  safety-engine rejection and default-engine acceptance of every waypoint;
- `ScenarioRuntimeHost.test.ts` (S66) — scenario event → adapter/controller →
  semantic visual joints, carried-workpiece synchronization for palletizing and
  assembly, and safety-cell inhibition until the existing safety restart;
- `e2e/scenario-3d-runtime.spec.ts` (S66) — browser check that running the
  palletizing and assembly cells changes J1-J6 and completes;
- `e2e/scenario-3d-runtime.spec.ts` — browser smoke that each material-flow preset
  renders a canvas, reports 3D equipment, shows its bound cell state after
  run/recover, and that the CNC reference cell still renders;
- `e2e/scenario-visual.spec.ts` (S62 protocol) — committed deterministic
  full-page captures for the CNC cell, vision sorting, palletizing, assembly and
  safety training; the vision-sorting and palletizing baselines were regenerated
  once for the intended S65 GLB visuals, and the previously stale safety-training
  baseline was regenerated in S66 for the intended S65 safety-device GLB assets
  plus the new robot-motion status overlay; all reproduce deterministically.

`scenarioRuntimeMetrics.test.ts` writes a bounded GPU-free report to
`test-results/perf/scenario-runtime-metrics.json`. Recorded on the CI host
(2026-10-03, procedural visuals, no WebGL) after the S75 instancing and dressing:

| Scenario | Equipment | Meshes | Triangles | Draw calls | Load ms |
| --- | --- | --- | --- | --- | --- |
| `sorting-normal-cycle` | 11 | 82 | 2 396 | 82 | 57.0 |
| `palletizing-normal-cycle` | 15 | 108 | 2 824 | 108 | 8.1 |
| `assembly-inspection-cycle` | 12 | 87 | 2 498 | 87 | 6.8 |
| `safety-door-recovery` | 11 | 76 | 2 584 | 76 | 11.4 |

The S75 environment keeps the repeated expansion joints, access-lane ticks and
cable-tray rungs at one draw call per family through `InstancedMesh`, so the
added human-scale dressing does not multiply draw calls. The per-cell draw-call
budget asserted by `scenarioRuntimeMetrics.test.ts` remains `< 200`.

Before S58 these presets rendered an SVG plan view: 0 meshes, 0 triangles and 0
WebGL draw calls. Load time is wall-clock host time, not GPU frame time; the
reference-scene frame-time probe remains `e2e/perf.spec.ts` and is not a
per-scenario GPU claim. Repeated switching is covered by the S58 host tests and
the S56 soak, which keeps `drawCalls` flat across cycles.
