# S30 - Extensibility, realism, and scene hardening

## Outcome

Harden the multi-scene ecosystem so future equipment, assets, and presets can be added safely with predictable performance and documentation.

## Scope

- Add a registry-backed equipment/scene browser with categories, search, thumbnails, capability badges, license display, and simulation-ready status.
- Finalize the extension contract linking equipment definition, visual asset, collision proxy, optional runtime adapter, ports, anchors, parameters, and telemetry mapping.
- Extend versioned cell/scene files compatibly for parameter values, connections, environment, camera, and panel defaults with deterministic migration.
- Add import/validation flows for new scene presets and visual assets; keep runtime adapter installation code-owned and trusted.
- Improve materials, lighting, shadows, contact cues, status animations, cables, utility details, and restrained environmental dressing across all presets.
- Add scene loading progress, recoverable asset errors, unload/disposal diagnostics, LOD/texture/draw-call budgets, and repeated scene-switch leak checks.
- Publish an authoring guide covering Blender generation, semantic nodes, anchors, collision proxies, registration, scenario compatibility, validation, rollback, and test templates.

## Tests and gates

- Schema migration, deterministic round-trip, package security, registry, compatibility, and fallback tests.
- Repeated multi-scene load/unload memory and listener-leak checks.
- Performance budgets and visual baselines for all quality profiles and scenes.
- Complete backend, HMI, simulator, contracts, e2e, and documentation gates.

## Acceptance criteria

- A developer can add a visual-only equipment type and scene preset without editing the application shell or existing scene components.
- Simulation-ready equipment requires an explicit trusted runtime adapter and declared capabilities.
- Existing scene files migrate deterministically and preserve transforms/connections.
- All reference scenes meet documented visual and performance budgets and survive missing/corrupt assets.

## Non-goals

- No public marketplace, arbitrary executable plugins, or automatic safety/runtime inference from imported geometry.
