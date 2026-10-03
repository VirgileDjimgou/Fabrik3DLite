# Scene presets and loading lifecycle

`src/scenes/` defines versioned, non-executable scene presets. A preset links a
cell definition to compatible educational scenarios, a trusted runtime profile,
environment and camera metadata, and optional panel defaults. It never embeds
Vue components, Three.js objects, runtime callbacks, or scripts.

`ScenePresetCatalog` validates unique identifiers, scenario references,
capability/runtime consistency, SI transforms, and deterministic layout data.
`SceneSelectionController` owns selection and a revisioned host key. Changing or
resetting a scene remounts `SceneHost`, which prevents scene-local state from
surviving a scene switch.

## Runtime profiles

| Runtime profile | Runtime view | Notes |
| --- | --- | --- |
| `single-conveyor-machining` | `SingleConveyorCellLayout.vue` | CNC reference cell; unchanged |
| `material-flow` | `MaterialFlowScenarioHost.vue` → `ScenarioRuntimeHost` (S58) | Real Three.js cell composed from the preset's explicit `CellDefinition` (S59) |
| `none` | `SceneLayoutPreview.vue` | Editor/catalog plan-view preview only |

All five built-in presets are `simulation-ready`:

- `cnc-machine-tending` → `single-conveyor-machining`, the reference cell.
- `vision-sorting`, `robot-palletizing`, `assembly-inspection`, `robot-safety-training`
  → `material-flow`, executed inside a real Three.js cell since S58 and composed
  from the explicit S59 equipment cells in `src/scenes/materialFlowCells.ts`.

`SceneLayoutPreview` is no longer the primary runtime view for any
`simulation-ready` scene. It remains the editing/catalog preview used by the
cell editor and the scene-preset catalog page.

## Adding a preset

1. Build a versioned `CellDefinition` using registered equipment definition IDs.
2. Add a pure-data `ScenePreset` to the catalog with compatible scenario IDs.
3. Use `layout-only` and runtime `none` until all required runtime adapters exist.
4. Add the equipment classes the scenario requires to
   `src/scenarios/cellComposition.ts` (S59) so the cell composition, the visual
   profile and the composition tests share one requirement table.
5. Add a `ScenarioVisualProfile` (S58) when the scenario needs explicit camera
   framing, environment level or expected equipment classes; otherwise the
   resolver derives one from the preset.
6. Add validation, selection lifecycle, binding and layout/visual tests.
7. Add a trusted runtime-profile resolver only when the scene is executable.

## Measured cell layout (S60)

A preset's `environment.floorSizeMeters` and `camera` are **derived**, not
hand-tuned. `catalog.ts` calls
`resolveCellLayout({ footprints: cellFootprints(cell) })` from
`src/scenes/cellLayout.ts` and `src/scenes/cellFootprints.ts`:

- `cellFootprints` reads only declarative data — the equipment SDK dimensions
  (with the analytic collision-box dimensions used for the CNC body) and the
  Y-up SI transform — and assigns each piece a role (`robot`, `machine`,
  `conveyor`, `pallet`, `fixture`, `tool`, `sensor`, `infrastructure`,
  `safety-zone`) plus declared robot-service/reach/overlap flags. It never
  inspects a mesh or touches runtime state.
- `computeCellExtents` measures the AABB of every footprint, conservatively
  expanding Y-rotated footprints and including the robot reach envelope.
- `deriveFloorSizeMeters` draws the floor around the equipment base frame with
  the documented `floorMarginMeters` (1.5 m) and rounds up to a stable 0.5 m
  increment, with a 4 m minimum.
- `deriveCameraPreset` preserves a three-quarter view direction and places the
  camera at the strict framing distance for the measured extents, looking at the
  measured centre at a height derived from the tallest equipment.
- `validateCellLayout` reports (never throws) diagnostics for equipment bounds,
  gross overlap, robot reach/service, fence clearance, service clearance,
  operator corridor, conveyor footprint, floor marking containment, safety-zone
  size and camera framing.

Re-measured derived values (2026-10-02) for the built-in presets:

| Preset | Floor X × Z (m) | Camera position (m) | Look-at target (m) |
| --- | --- | --- | --- |
| `cnc-machine-tending` | 9.0 × 11.5 | (4.691, 5.255, 6.489) | (0, 0.99, 0.775) |
| `vision-sorting` | 9.0 × 6.0 | (2.244, 3.736, 4.0) | (−0.875, 0.9, 0.2) |
| `robot-palletizing` | 10.5 × 8.0 | (4.903, 5.402, 5.715) | (0, 0.945, −0.257) |
| `assembly-inspection` | 9.5 × 6.5 | (3.635, 4.477, 4.794) | (−0.3, 0.9, 0) |
| `robot-safety-training` | 8.0 × 13.0 | (4.811, 5.182, 7.078) | (0.15, 0.945, 1.4) |

The CNC reference cell was previously a hand-set 12 × 10 m floor; the measured
9.0 × 11.5 m is smaller in X and larger in Z because it follows the real 6 m
conveyor and the 3.85 m reach envelope, not an arbitrary square. No cell was
enlarged arbitrarily. The layer is a configuration aid only: diagnostics are
advisory, an already-valid cell is never blocked, and simulation, collision,
safety and telemetry remain authoritative elsewhere.

The clearance constants live in `DEFAULT_CELL_LAYOUT_REQUIREMENTS`
(service 1.2 m, operator corridor 1.5 m, fence clearance 0.2 m, camera margin
1.0 m, safety-zone margin 0.25 m, robot reach tolerance ×1.25, floor margin
1.5 m). `cellLayout.test.ts` covers each positive and negative case and asserts
every built-in preset derives zero error-severity diagnostics.

## Derived camera views (S69)

S69 replaces the single framing with three derived camera presets.
`deriveCameraPresets(extents, footprints, options)` returns:

- `overview` — the primary default, equal to `deriveCameraPreset(extents)` and
  containing every measured corner inside the renderer frustum;
- `operator` — a `+Z` operator-side eye-height framing;
- `workcell` — a closer framing centred on the declared robot footprint and its
  reach envelope.

All three are pure functions of the measured extents and declared footprints, so
they are deterministic and never read a mesh or a render frame.
`cameraContainsExtents` projects the eight extents corners into normalized device
coordinates using the documented renderer parameters (50° vertical FOV, 16:9
aspect, near plane) and fails when a corner leaves the viewport or crosses the
near plane; `validateCellLayout` reports a `camera-clipping` diagnostic for that
case. `SingleConveyorCellLayout.vue` and `MaterialFlowScenarioHost.vue` expose the
views as `[data-camera-view]` buttons; the CNC cell applies them through
`SingleConveyorSceneSetup`, the material-flow cells through
`ScenarioRuntimeHost.placeCamera(camera, view)`.

`src/scenes/composition.test.ts` enforces the S69 acceptance criteria for all
five flagship presets: zero error diagnostics (overlap, floor bounds, reach,
service/operator/safety clearance), robot service targets inside the reach
envelope, fencing outside the swept envelope plus fence clearance, protective
zones large enough for the swept envelope, and full overview-camera containment —
plus a negative fixture proving each diagnostic fires on a real violation.

Future equipment, scenario, editor, and rendering work extends registries and
the scene host resolver; the application shell and selector remain unchanged.
