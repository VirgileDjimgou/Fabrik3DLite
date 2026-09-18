# S21 - Versioned 3D asset SDK and GLB pipeline

## Outcome

Introduce a stable, validated asset boundary so professional GLB models can replace procedural visuals without changing equipment runtime behavior.

## Scope

- Define a versioned `EquipmentAssetManifest` covering equipment identity/category, asset version, GLB files, units, Y-up/origin convention, bounds, LODs, collision proxy, semantic nodes, anchors/ports, materials, thumbnail, license, and integrity hash.
- Add an `EquipmentAssetRegistry` and visual provider abstraction separate from `EquipmentRuntimeAdapter`, simulation state, and backend orchestration.
- Add a centralized Three.js GLB loader with resource caching, cloning, loading/error states, safe disposal, and optional Draco/Meshopt support only where justified.
- Keep every current procedural equipment model as a compatible fallback.
- Define the package layout and a validator usable from tests and the future importer.
- Add a Blender Python asset-template/export script that creates correctly scaled, named, and oriented packages without requiring Blender at application runtime.
- Document semantic naming conventions such as `joint:j1`, `door:loading`, `anchor:material.in`, `sensor:infeed`, and `tool:flange`.

## Tests and gates

- Manifest schema tests for valid packages, unsupported versions, missing files, duplicate semantic nodes, invalid units, axes, bounds, and hashes.
- Loader tests for cache reuse, independent scene instances, failure diagnostics, fallback, and disposal.
- Headless smoke test loading one intentionally small reference GLB package.
- Simulator type-check, unit tests, production build, and applicable workspace baseline gates.

## Acceptance criteria

- A definition can select either a procedural visual or a manifest-backed GLB through configuration.
- Replacing a visual asset does not modify its runtime adapter, state machine, kinematics, or telemetry contract.
- An invalid/missing asset never prevents the reference cell from loading and clearly activates the procedural fallback.
- The asset-generation/export workflow is reproducible and documented.

## Non-goals

- No complete professional equipment redesign in this sprint.
- No arbitrary end-user upload or remote marketplace.
