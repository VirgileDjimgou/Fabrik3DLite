# S73 - Anchor-driven modular assembly and equipment attachment

## Outcome

Make declared anchors, ports and connections authoritative for 3D runtime placement and attachment, so
cells compose from data (chains, runs, tool-on-flange) instead of hard-coded transforms, while every
existing scene keeps its current behavior.

## Scope

- Add explicit attachment semantics to the equipment/cell model: an instance may declare `attachTo`
  (instance id + port/anchor id) with a compatible-port check. Version and migrate the cell-file schema
  using the existing S10 migration pattern so old files load unchanged.
- Consume `anchorWorldPosition`/`nearestCompatibleAnchor` (`src/equipment/materialFlow.ts`) and the
  infrastructure anchors in the runtime: `ScenarioRuntimeHost.loadVisuals` and
  `SingleConveyorCellLayout` derive transforms from declared anchors/connections, keeping the declared
  transform as the compatibility fallback.
- Support the modular patterns the library already declares: conveyor-to-conveyor chains, fence-panel
  runs and interlocked gates, tool/gripper attached to `tool:flange`, and pallet station to conveyor
  ports.
- Guarantee editor/runtime parity: the same `CellDefinition` must produce identical world transforms in
  the 2D editor model (`src/editor`) and the 3D runtime, with a deterministic tolerance test.
- Fail closed on missing/incompatible anchors with a structured diagnostic; never place an instance
  silently at an arbitrary transform.
- Keep `Definition != Runtime != Visual != Collision != Telemetry`; attachment changes placement only,
  never collision authority, signal semantics or runtime behavior.
- Update `docs/architecture/EQUIPMENT_SDK.md`, `docs/architecture/SCENE_AND_ASSET_AUTHORING.md`,
  `docs/architecture/CELL_FILES.md` and `docs/architecture/PREDEFINED_INDUSTRIAL_SCENES.md`.

## Non-goals and boundaries

- No free-form 3D editor and no change to the existing 2D editor interaction model.
- No breaking change to already-published cell files, presets or scenario ids.
- No behavior, collision or telemetry logic inside asset packages.

## Testing and validation

- Anchor/attachment unit tests with documented tolerances: compatible ports, chain resolution, fence
  runs, tool attachment, missing/incompatible anchor diagnostics.
- Cell-file round-trip and migration tests; editor/runtime world-transform parity tests.
- Regression: all five flagship cells and the CNC reference cell load, match existing transforms when no
  connection is declared, and keep their visual baselines.
- Run every applicable baseline gate in `docs/roadmap/QUALITY_GATES.md`.

## Acceptance criteria

1. At least one scenario cell is assembled from declared anchors/connections end to end, with no
   hard-coded transform for the attached instances.
2. Editor and runtime resolve identical world transforms for the same cell definition.
3. Existing cells and presets remain compatible or migrate deterministically; no visual or behavioral
   regression.
4. Invalid anchors/ports fail closed with an actionable diagnostic and preserve the fallback path.
5. Documentation describes the schema, migration and composition rules.

## Evidence expected for completion

Record schema/migration tests, anchor-resolution and parity test results, a before/after cell
composition demonstration, regression and visual gate results, and all applicable baseline gates.
