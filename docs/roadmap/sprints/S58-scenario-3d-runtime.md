# S58 - Real 3D scenario runtime foundation

## Outcome

Every `simulation-ready` scenario must execute inside a real Three.js industrial cell. Scenario composition becomes data-driven through the existing scene, equipment and asset abstractions instead of a bespoke application per scenario or a plan-view preview.

## Motivation

Current non-CNC presets run through `MaterialFlowScenarioHost` rendered by `SceneLayoutPreview`. Several scenarios are therefore logically simulated but are not actually experienced inside a real Three.js industrial cell. This is the credibility gap between the scenario catalogue and the product promise; S59-S64 build visual richness on top of the runtime introduced here.

## Current-state assumptions to verify

- Inventory the existing `ScenePreset`, `ScenarioDefinition`, `ScenarioRunner`, `SceneHost`, equipment SDK and `EquipmentAssetRuntime` implementations and their current wiring.
- Confirm which scenarios are `simulation-ready` and which still rely on the layout preview as the primary runtime view.
- Record current scenario switching behavior, resource disposal and camera handling before changes.
- Identify the deterministic scenario event flow that must be preserved.

## Scope

- Introduce, where appropriate and only with a documented reason:
  - `ScenarioVisualProfile` - declarative visual composition data for a scenario (equipment classes, placement hints, camera framing, environment level).
  - `ScenarioSceneBinding` - resolution from a scenario to a compatible `ScenePreset` and `CellDefinition`.
  - `ScenarioRuntimeBinding` - binding from scenario state/events to equipment runtime behaviors and expected events.
- Make a scenario resolve through the full chain:
  `Scenario → compatible ScenePreset → CellDefinition → equipment instances → visual assets → runtime behaviors → expected events`.
- Replace `SceneLayoutPreview` as the primary runtime view for `simulation-ready` material-flow scenarios. Keep `SceneLayoutPreview` for editor/catalog preview only.
- Create one reusable Three.js scenario host owned by the simulator runtime (not by a Vue component) so scenario logic is not hardcoded in components.
- Scenario switching must:
  - unload the previous runtime;
  - dispose scene resources deterministically;
  - load the correct cell;
  - position the camera from scenario/scene data;
  - initialize equipment;
  - initialize scenario state;
  - preserve deterministic scenario events.
- Use the shared `EquipmentAssetRuntime` and existing procedural fallbacks; do not add component-local loaders.

## Non-goals

- No new industrial protocol, database, framework or HMI framework.
- No new scenario categories; only make the existing catalogue execute in 3D.
- No change to server orchestration authority or to scenario success criteria.
- No mesh-derived runtime truth: visual assets never become authority for state, events, collision or telemetry.

## Architecture boundaries

- Preserve `Definition ≠ Runtime ≠ Visual ≠ Collision ≠ Telemetry`.
- The server stays the orchestration source of truth; the simulator stays execution/visualization; the HMI stays the operator interface.
- Scenario events remain deterministic and independent from render frame rate.
- Collision and kinematics remain authoritative and separate from render geometry.
- Prefer data-driven scene composition over conditional code per scenario.

## Simulator and 3D changes

- Add the scenario-to-scene resolution layer and a reusable scenario host with explicit lifecycle (`load`, `initialize`, `switch`, `dispose`).
- Migrate `simulation-ready` material-flow scenarios off `SceneLayoutPreview` as their runtime view.
- Preserve existing scenario selection UX while changing what is rendered.
- Keep the preview available in the editor/catalog surfaces.

## Backend and HMI changes

- No backend change expected; if a contract is needed, extend the existing versioned contracts and regenerate clients instead of hand-editing generated code.
- HMI behavior and role surfaces remain unchanged; any selector change must preserve EN/FR/DE and accessibility.

## Backward compatibility

- Existing scene presets, cell files and scenario definitions remain readable.
- Existing scenario ids, expected events and success criteria are unchanged.
- Missing or unknown visual profiles fall back to a valid composed scene rather than failing scenario execution.

## Failure and degraded modes

- A missing/unknown `ScenePreset` or asset falls back to the documented procedural path and never blocks the scenario logic.
- Disposal failures are diagnosed and contained; switching scenarios repeatedly must not leak GPU resources.
- A scenario without a visual profile remains selectable with an explicit diagnostic rather than a blank view.

## Testing strategy

- Unit tests for scenario-to-preset resolution, compatibility validation and deterministic binding.
- Unit tests for host lifecycle: load/switch/dispose idempotence, resource disposal and camera placement.
- Scenario runner equivalence tests proving runtime events and outcomes are unchanged by the new host.
- Visual smoke test that a `simulation-ready` scenario renders real 3D equipment.
- Existing kinematics, collision, state-machine, signal and scenario tests must remain green.
- Run applicable build/type-check/unit/visual/docs/security gates.

## Performance requirements

- Record scenario load time, triangle count, draw calls and frame timing before and after the change for each migrated scenario.
- Repeated scenario switching must keep renderer resource counts stable within documented tolerance.

## Security and licensing considerations

- Use existing license-safe, repository-generated or generic assets only; no proprietary OEM content.
- No new external endpoint, credential or connector behavior.

## Documentation changes

- Document the scenario visual profile/binding model, resolution chain, host lifecycle, fallback behavior and the editor-preview boundary.
- Update the simulator README/scenario documentation and the architecture index references that describe scenario rendering.

## Acceptance criteria

1. Selecting any `simulation-ready` scenario displays an actual 3D cell containing the equipment required by that scenario.
2. `SceneLayoutPreview` is no longer the primary runtime view for `simulation-ready` material-flow scenarios and remains available for editor/catalog preview.
3. Scenario switching performs unload, disposal, cell load, camera placement, equipment and scenario initialization deterministically.
4. Scenario events and outcomes are unchanged and deterministic, with tests proving equivalence.
5. No bespoke per-scenario Vue application was introduced; composition is data-driven through existing abstractions.
6. Existing scenes, assets and fallbacks remain compatible and all applicable gates pass.

## Evidence expected for completion

Record resolution-chain tests, host lifecycle/disposal tests, scenario equivalence results, per-scenario resource measurements and the applicable quality gates. Include the commands and their actual results.

## Rollback and failure containment

Keep the preview path intact until the runtime host is verified for every `simulation-ready` scenario. A regression can disable the new host per scenario without touching scenario definitions or equipment runtime.

## Follow-up items

- Scenario-specific industrial 3D cells are S59.
- Robot and cell visual fidelity is S60.
