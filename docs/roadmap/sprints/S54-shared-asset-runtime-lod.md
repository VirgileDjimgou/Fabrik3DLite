# S54 - Shared 3D asset runtime, cache and adaptive LOD

## Outcome

Turn the existing GLB architecture into a scene/application-scoped asset runtime with one cache owner, safe instancing/disposal, adaptive LOD and diagnostics.

## Motivation

Components currently construct their own `EquipmentVisualProvider`/`ThreeGlbAssetLoader`, obscuring cache ownership and preventing reliable load-once/instantiate-many behavior. Existing manifest LOD declarations are not governed by a shared policy.

## Current-state assumptions to verify

- Inventory every loader/provider construction site and scene lifecycle/disposal path.
- Verify clone behavior for geometry, materials, skeletons, animations and semantic nodes.
- Inspect manifest LOD, hash, bounds, license, coordinate/pivot validation and procedural fallback behavior.
- Establish current resource/load baselines before changing ownership.

## Scope

- Introduce injected `EquipmentAssetRuntime`/`AssetRuntime` through Vue or the established ThreeScene context.
- Own registry, loader, visual provider, diagnostics, cache lifecycle, quality profile and LOD selection centrally.
- Support physical load once, independent instances, immutable shared geometry/material templates, reference counting and safe disposal.
- Define clone-on-mutation rules so animation/material changes cannot leak across instances.
- Implement centralized LOD selection using distance, bounds and Performance/Balanced/Quality profiles, optionally informed by measured scene load.
- Support progressive fallback/proxy → primary GLB → optional higher-quality level without affecting simulation state.

## Non-goals

- No replacement of `EquipmentAssetRegistry`, `EquipmentVisualProvider`, `ThreeGlbAssetLoader`, manifests, semantic nodes, procedural fallback, collision proxies or `RobotVisualBinding`.
- No per-component LOD policy and no unmeasured mandatory Draco/Meshopt/KTX2 adoption.
- No coupling of visual assets to kinematics/collision/runtime truth.

## Architecture boundaries

- Visual runtime remains separate from definition, simulation runtime, collision and telemetry.
- Components request visuals from the shared runtime and never instantiate independent loaders.
- Asset loading failure cannot mutate or stop simulation state.

## Runtime and data changes

- Define cache keys including asset/version/LOD/decoder-relevant identity and stable diagnostic metadata.
- Specify ownership of templates, cloned scene nodes, mutable materials/textures, animations and disposal.
- Preserve semantic-node names and manifest schema; version any necessary additive LOD policy metadata.

## Simulator and 3D changes

- Wire one runtime per scene/application lifetime and migrate every component construction site.
- Add deterministic quality-profile and camera/bounds-based thresholds with hysteresis to avoid thrashing.
- Expose engineering diagnostics: cache entries/hits/misses/refcounts, selected LOD, load/fallback errors and resource estimates.
- Dispose GPU resources only after the last owner; cancel or reconcile late loads safely.

## HMI changes

- None expected beyond any existing engineering diagnostics surface; do not expose asset controls to operator workflows.

## Asset integrity and compression

- Continue hash, manifest, semantic-node, bounds, license, coordinate-system and pivot validation at the appropriate load boundary.
- Benchmark decoder/download/runtime tradeoffs before introducing compression. Decoder configuration, if justified, remains optional and failure-safe.

## Backward compatibility and migration

- Existing manifests and procedural assets load unchanged.
- Existing cells retain visual identifiers and transforms; no collision or runtime schema migration is implied.

## Failure and degraded modes

- Missing/corrupt LOD falls back to the next valid level or procedural proxy with diagnostics.
- A failed high-quality upgrade leaves the working lower level in place.
- Scene teardown, rapid profile changes and cancelled loads release references without double-disposal/use-after-disposal.

## Testing strategy

- Single physical load/multiple independent instances, cache reuse and concurrent-request coalescing.
- Reference-count disposal after last owner and repeated scene-load resource regression.
- Same asset across component types; mutable-material isolation; semantic-node preservation.
- LOD thresholds/hysteresis/profiles, failed LOD fallback, missing asset fallback and progressive loading.
- Manifest/hash/bounds/license/pivot validation and applicable visual/build/type-check gates.

## Performance requirements

- Capture before/after asset bytes loaded, load count/time, cache hit rate, draw calls, geometry/textures and renderer memory on representative scenes.
- Define regression bounds from measured evidence; do not claim compression benefits without comparative results.

## Security considerations

- Preserve import/path/hash/license validation and reject traversal/unbounded asset inputs.
- Diagnostics must not leak local paths, credentials or cross-tenant private asset details.

## Documentation changes

- Add asset-runtime ownership/lifecycle documentation, quality profiles, LOD policy, mutation/clone rules, diagnostics and asset-author guidance.

## Acceptance criteria

1. Components obtain visuals through one shared scene/application runtime and no longer construct loaders independently.
2. One asset load safely creates multiple independently transformed instances.
3. Reference counting/disposal has deterministic tests and no measured resource regression.
4. Manifest LODs switch through a centralized profile policy and fail back safely.
5. Semantic nodes, procedural fallbacks and collision/runtime separation remain intact.
6. Applicable tests and quality gates pass with recorded performance evidence.

## Evidence expected for completion

Record loader call counts, cache/refcount/disposal tests, LOD/profile/fallback tests, renderer resource/load measurements, visual regression and applicable global gates.

## Rollback and failure containment

Keep existing providers/loaders behind the runtime abstraction so policy can be disabled without changing manifest identity. Never dispose shared resources while referenced; fall back to procedural/proxy visuals on load failure.

## Follow-up items

- The flagship visual cell built on this runtime is S55.
