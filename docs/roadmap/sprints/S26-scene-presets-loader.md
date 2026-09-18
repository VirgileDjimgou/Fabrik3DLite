# S26 - Scene presets and modular loading architecture

## Outcome

Introduce a versioned scene-preset boundary and deterministic scene selection lifecycle so Fabrik3D can load multiple industrial cells without encoding every layout in `SingleConveyorCellLayout.vue`.

## Scope

- Define a `ScenePreset` schema that references one cell definition, compatible scenario IDs, default scenario, environment, camera preset, runtime profile, and optional default panel layout.
- Keep scene data free of executable code. Resolve runtime adapters, visuals, collision proxies, and scenarios through their existing registries.
- Add catalog validation for unique IDs, supported schema versions, known scenarios, valid defaults, SI transforms, and explicit `simulation-ready` versus `layout-only` capability.
- Register the current CNC machine-tending cell as the compatibility preset without changing its orchestration behavior.
- Add a second lightweight safety-training layout preset using existing registered definitions, explicitly marked layout-only until its runtime is delivered.
- Add a compact scene selector showing scene name, purpose, capability, and compatible scenarios; prevent starting unsupported simulation while still allowing layout inspection.
- Implement deterministic selection/reset state and a scene host boundary that remounts the selected scene cleanly.
- Document how future presets add layout and scenario data without changing the application shell.

## Tests and gates

- Unit tests for schema/catalog validation, duplicates, unknown scenarios, invalid defaults, and capability rules.
- Component tests for selecting a scene, resetting to the default preset, and visibly identifying layout-only scenes.
- Lifecycle test proving scene selection produces a new host key and clears scene-local selection state.
- Simulator type-check, Vitest suite, production build, and focused visual/e2e coverage for the selector.
- Run the remaining workspace baseline gates and report unrelated failures.

## Acceptance criteria

- The existing CNC cell is loaded through a registered scene preset and behaves as before.
- A user can select a predefined scene from a catalog and immediately see whether it is simulation-ready.
- Unsupported/layout-only presets cannot silently start the CNC runtime.
- New preset definitions can be added as data without modifying `App.vue` or the selector.
- Scene selection has deterministic reset and remount semantics.

## Non-goals

- No generic rendering for every future equipment type in this sprint.
- No OEM virtual controller, exact OEM behavior, or safety certification claim.
- No untrusted scripts or remote executable scene packages.
