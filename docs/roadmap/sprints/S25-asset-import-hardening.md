# S25 - Asset import, cell integration, and visual hardening

## Outcome

Allow validated equipment packages to be imported, placed, persisted, and simulated as first-class catalog assets, then harden the complete professional reference scene.

## Scope

- Add a trusted package-import workflow with manifest/file validation, explicit diagnostics, license display, thumbnail preview, duplicate/version handling, integrity checks, and path/URI restrictions.
- Keep the server/catalog boundary as the source of truth for installed asset metadata; use generated REST contracts for any new endpoint.
- Replace the static editor list with registry-backed entries while retaining all built-in definitions.
- Add 3D placement preview, floor/grid snapping, numeric transforms, rotation, bounds/clearance checks, and compatible port/anchor snapping for material flow and tools.
- Extend the cell-file schema compatibly with optional `assetRef`, asset version, parameters, and connections; add deterministic migration and round-trip support for existing 1.0 files.
- Instantiate imported visuals through `EquipmentVisualAdapter` and require an existing or declared runtime adapter before an asset may participate in simulation. Visual-only assets remain clearly identified and cannot silently emulate behavior.
- Complete whole-scene LOD, texture, draw-call, loading-progress, error-isolation, cache, and GPU-resource-disposal hardening.
- Add an end-to-end showcase and authoring guide covering generation in Blender, validation, import, placement, connection, simulation, replacement, and rollback.

## Tests and gates

- Security/boundary tests for malformed packages, traversal attempts, unsupported external URIs, duplicate versions, corrupt hashes, and missing licenses/nodes.
- Cell-schema migration and deterministic import/export round-trip tests.
- Editor component and Playwright flows for import, preview, placement, port snapping, save, reload, simulate, replace, and fallback.
- Complete reference-cell visual baselines at low/medium/high quality plus loading/error states.
- Documented performance budget for the full scene and a repeated load/unload GPU leak check.
- All workspace baseline gates, generated-contract checks when applicable, and the complete simulator visual suite.

## Acceptance criteria

- A validated new equipment asset can enter the catalog and be placed without editing scene component source code.
- A saved cell reopens with the same asset versions, transforms, parameters, ports, and runtime bindings.
- Existing cell files and procedural equipment remain fully supported.
- Invalid assets are isolated with actionable diagnostics and never destabilize the rest of the simulation.
- The professional reference scene has reproducible screenshots and meets its documented performance target.

## Non-goals

- No public asset marketplace, untrusted executable plugins, or arbitrary scripts inside imported packages.
- No automatic inference of safe behavior from visual geometry alone.
