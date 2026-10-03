# Shared 3D asset runtime, cache and adaptive LOD (S54)

This document describes the scene/application-scoped asset runtime introduced by
S54. It complements [Versioned 3D equipment assets](3D_ASSETS.md), which remains
authoritative for the manifest contract and the package layout.

The runtime is render-only. It stays strictly separate from equipment
definitions, simulation runtime, collision proxies and telemetry; a failed asset
can only degrade the visual to a procedural representation and can never mutate
or stop simulation state.

## Ownership and lifecycle

| Concern | Owner |
|---|---|
| Asset catalog and manifest validation | `EquipmentAssetRegistry` (unchanged) |
| Physical GLB load and template cache | `ThreeGlbAssetLoader` (unchanged, now exposes `preload`) |
| Scene/application runtime, cache keys, ref counts, LOD, diagnostics | `EquipmentAssetRuntime` (new) |
| Retrieval by components | Vue `ASSET_RUNTIME_KEY` provided once by `ThreeScene.vue` |

`ThreeScene.vue` creates exactly one `EquipmentAssetRuntime` per scene and
provides it via `ASSET_RUNTIME_KEY`. `ConveyorBelt`, `RawMaterialPallet` and
`ScaledRobotComponent` inject that runtime; they no longer construct an
`EquipmentVisualProvider`, `ThreeGlbAssetLoader` or registry themselves.

Diagram of one acquisition:

```text
component
   │ acquire(assetId, { proceduralFallback, distanceMeters })
   ▼
EquipmentAssetRuntime ── select level (profile + distance + bounds)
   │                     └─ cache key = asset@version@lod@lvl@sha@decoder
   ▼
ThreeGlbAssetLoader.preload (single physical load, concurrent callers coalesce)
   │
   ▼
ThreeGlbAssetLoader.load  → clone() + instance material isolation
   │
   ▼
AssetRuntimeInstance { root, level, lodId, source, dispose() }
```

`createDefaultEquipmentAssetRuntime()` wires the industrial registry and a GLTF
loader. `disposeAll()` is called when `ThreeScene` unmounts; children release
their instances first.

## Cache keys and reference counting

The cache key includes asset id, asset version, LOD id, level index, source
SHA-256 and the decoder identity (`decoder=none` in the baseline). This makes a
hit safe across manifest versions and prevents a stale template from serving a
different LOD or decoder.

- The first request for a key physically loads the template once
  (`physicalLoads`); concurrent requests for the same key coalesce on one promise
  and increment the ref count instead of re-downloading.
- Every `acquire` returns an independent scene graph. `dispose()` decrements the
  ref count and frees that instance's cloned materials.
- `disposeUnused()` frees a cached template's geometry/textures only when its ref
  count is zero. `disposeAll()` drops all cache state at scene teardown.

## Mutation and clone rules

- Geometry and textures are immutable shared template resources.
- Materials are cloned per instance by the runtime (`isolateMaterials: true`).
  A component may change colour/emissive/opacity on its instance without
  affecting any other instance of the same asset.
- `SkeletonUtils.clone` produces the independent scene graph (bones, skins and
  animations), so animation sampling does not leak between instances.
- Semantic node names and `userData.semanticId` are preserved by cloning; the
  runtime never renames them.
- Procedural fallbacks remain owned by the caller, which disposes their geometry
  and materials when it unmounts.

## Quality profiles and LOD policy

LOD selection is centralized in `lodPolicy.ts` and is deterministic and
renderer-independent (no GPU required for tests).

- Manifest LODs are ordered by decreasing `triangleBudget`; level 0 is the
  primary `visual.glb`, levels 1..n are `visual.lods`.
- Thresholds are derived from the asset's declared `boundsMeters` (half of the
  largest extent = one radius) and the profile distance scale. The default
  multiplier is 4 radii per level.
- Profiles:

  | Profile | Distance scale | Maximum level |
  |---|---|---|
  | `performance` | 0.6 (reduce sooner) | 1 |
  | `balanced` | 1.0 | 2 |
  | `quality` | 1.6 (keep detail longer) | 3 |

  The available level count is always a hard cap. `ThreeScene` maps the renderer
  scene quality (`low`/`medium`/`high`) to `performance`/`balanced`/`quality`.
- Hysteresis (default 25% of a radius) means a pending level change is only
  applied after the camera crosses the switching threshold by the hysteresis
  band, which prevents thrashing at a boundary.
- Selection never affects simulation state; it only chooses which visual file is
  requested.

## Failure and degraded modes

- If the requested level is missing or corrupt, the runtime tries progressively
  cheaper levels and finally the primary.
- If every GLB level fails, the runtime returns the caller's procedural fallback
  with a sanitized diagnostic and increments `fallbacks`.
- `upgrade(instance, …)` attempts proxy → primary GLB, or a higher-detail LOD.
  On failure it returns the working instance unchanged with a diagnostic, so a
  degraded visual is never replaced by a broken one.
- A failed load deletes its cache entry, so a later request can retry.

## Diagnostics

`runtime.diagnostics()` returns engineering counters and per-entry metadata:

- profile, cache entries, hits, misses, coalesced requests and physical loads;
- live instances, releases, procedural requests, fallbacks and load failures;
- per entry: key, asset id, LOD id, level, ref count and a renderer-independent
  resource estimate (`measureSceneResources`: meshes, triangles, draw calls,
  textures);
- a bounded error list.

Diagnostics are sanitized (`sanitizeAssetDiagnostic`) so URLs, local paths and
asset filenames cannot leak. They are exposed programmatically to engineering
surfaces and are deliberately not part of operator workflows.

## Asset-author guidance

- Keep `boundsMeters` accurate: the LOD thresholds are derived from them.
- Order/derive `triangleBudget` so the primary is the most detailed and each LOD
  is cheaper; the runtime sorts LODs by descending budget.
- Keep semantic node names stable (`joint:*`, `sensor:*`, `anchor:*`, …) — they
  are the binding contract and survive cloning.
- Keep LOD files package-relative (`lod/lod1.glb`); the runtime resolves them
  against the primary URL.
- Compression (Draco/Meshopt/KTX2) is not enabled. Decoder identity is part of
  the cache key, so any future opt-in decoder must be measured and remain
  failure-safe. Do not claim compression benefits without comparative numbers.

## Measured evidence

Deterministic, GPU-free evidence is recorded by the S54 tests:

- `EquipmentAssetRuntime.test.ts` — one physical load for concurrent/multiple
  acquisitions; independent roots with shared geometry and isolated materials;
  ref-counted disposal after the last owner; 25 repeated load/release cycles with
  identical `measureSceneResources` output and a single physical load; LOD
  profile selection; progressive LOD and procedural fallback; failed upgrade
  keeps the lower level; diagnostic sanitization.
- `lodPolicy.test.ts` — radius derivation, monotonic thresholds, per-profile
  caps, distance selection and hysteresis.
- `industrialAssets.test.ts` — generated conveyor/pallet/robot GLB and LOD
  triangle budgets, semantic nodes and zero-texture pallet metrics.
- `assetPipeline.test.ts` — recomputes every declared SHA-256 for the S55 hero
  CNC and dressing packages, asserts the runtime node contract, LOD budgets,
  bounds and license, and proves a tampered hash or missing node is reported
  rather than silently accepted.
- `s60AssetPipeline.test.ts` (S60) — re-reads the committed, regenerated robot and
  hero packages and asserts byte-identical TypeScript/generated manifests, the
  six semantic pivots + `tool:flange`/`tool:tcp` + `gripper:*`, the LOD semantic
  nodes and triangle reduction, primary/LOD triangle budgets, the declared bounds
  range and a license that does not copy an OEM name.
- `cncGlbBinding.test.ts` — binds the generated hero CNC GLB to the authoritative
  `CncMachineVisualState`, reports missing nodes without throwing, and verifies
  the shared runtime acquires the GLB and falls back to the procedural visual on
  load failure.
- `ScenarioRuntimeHost.test.ts` (S58) — acquires one visual per scenario cell
  equipment instance from the shared runtime, releases them deterministically on
  switch/dispose and proves the resource count stays bounded across repeated
  scenario switches. `materialFlowVisuals.test.ts` registers the procedural
  scenario assets idempotently and disposes their instance-owned geometry.
- `ScenarioCellAnimator.test.ts` / `cellComposition.test.ts` (S59) — the animator
  mutates only instance-local materials (created per `createMaterialFlowVisual`
  call, so no cross-instance sharing), and the composition tests prove the S59
  cells resolve through the shared runtime. After S65 the preferred asset for a
  scenario class is the generated `scenario-*` GLB with the S58 procedural visual
  as its registered fallback.
- `s65ScenarioAssets.test.ts` (S65) — the shared runtime acquires the preferred
  scenario GLB for a scenario class and the generic professional robot for the
  training manipulator, and degrades deterministically to the procedural fallback
  (with a diagnostic) when the GLB 404s or is corrupt. See
  [Real 3D scenario runtime](SCENARIO_3D_RUNTIME.md).

The simulator visual-regression gate (`npm --prefix Fabrik3D/fabrik3d.client run
test:visual`) passed after the migration. The S49 reference scene frame-time
probe recorded, on this development machine under headless Chromium software
rendering (2026-10-01): `frames=15 mean=208.87ms p50=216.60ms p95=216.70ms`.
These are an upper bound for a software backend, not reference-hardware GPU
numbers. Hardware GPU frame time was subsequently measured by the S62 GPU
validation and re-measured after S68: the headed benchmark on the documented
reference host reports `acceleration=hardware`, `gpuEvidence=true`, every profile
above the 60 FPS reference target and 0 textures. See
[PERFORMANCE.md](../operations/PERFORMANCE.md) for the numbers and non-claims.
