# Versioned 3D equipment assets

The semantic six-axis robot animation contract is documented in [Professional robot assets](PROFESSIONAL_ROBOT_ASSETS.md).

## Purpose and boundaries

Fabrik3D visual assets are replaceable packages. They improve scene fidelity;
they do not define orchestration, machine state, robot kinematics, collision
rules, or telemetry. The server remains the orchestration source of truth, the
simulator remains the execution/visualization layer, and the HMI remains the
operator interface.

`EquipmentRuntimeAdapter` owns behavior. `EquipmentVisualAdapter` and the
asset modules own only the renderer-facing representation. Detailed GLB meshes
are never used as the sole collision geometry.

## Package layout

```text
generic-conveyor/
├─ equipment.asset.json
├─ model.glb
├─ lod/
│  ├─ lod1.glb
│  └─ lod2.glb
├─ collision.glb              # only when collision.kind is mesh
├─ thumbnail.webp
└─ LICENSE.md
```

All paths in a manifest are package-relative POSIX paths. Absolute paths,
protocol URLs, backslashes, and traversal sequences are rejected. S25 added the
trusted import/catalog workflow (see [ASSET_IMPORT.md](ASSET_IMPORT.md)); this
document's contract applies to both code-owned and imported code-validated
packages.

## Manifest conventions

`equipment.asset.json` uses schema version `1.0` and declares:

- an asset id, equipment definition id, category and asset version;
- meters, Y-up, right-handed orientation, and `equipment-base` origin;
- positive X/Y/Z bounds, GLB source, LOD budgets, collision-proxy metadata,
  material identifiers, hashes and license;
- semantic GLB node names and anchor transforms in SI units.

Semantic node prefixes are fixed:

| Purpose | Node example |
|---|---|
| Robot articulation | `joint:j1` … `joint:j6` |
| Machine access | `door:loading` |
| Material connection | `anchor:material.in` |
| Detection | `sensor:infeed` |
| Tool mounting | `tool:flange` |
| Runtime status | `signal:stack.green` |
| Actuation | `motor:main` |
| Machining/workholding | `fixture:chuck` |

An anchor transform uses `frameId`, `position` in meters and `rotation` in
radians. Its identifier must begin with `anchor:`.

## Loading and fallback

`EquipmentAssetRegistry` selects a procedural or GLB visual by asset id.
`EquipmentAssetRuntime` is the scene/application-scoped owner of the registry,
loader, cache, reference counting, LOD policy and diagnostics; components request
visuals from it through Vue injection and never construct loaders independently.
`EquipmentVisualProvider` and `ThreeGlbAssetLoader` remain available behind the
runtime for compatibility and direct use.

If the registry entry, manifest, or GLB is invalid/unavailable, the runtime
progressively tries cheaper LODs and then calls the owner-supplied procedural
fallback with a diagnostic. Thus a visual failure cannot stop the reference cell
or modify its state machine.

Cached templates share geometry and textures. Each instance clones the scene
graph, and (through the runtime) clones its own materials so status-colour or
animation edits cannot leak between instances. Disposing an instance only removes
that clone and frees its instance-owned materials. `disposeUnused()` frees the
shared template GPU resources only after all clones for that template have been
released.

The full ownership, LOD-policy, quality-profile and diagnostics contract is in
[Shared 3D asset runtime](ASSET_RUNTIME.md).

The baseline uses uncompressed GLB. Draco or Meshopt decoding is intentionally
not enabled until a measured asset requires it, keeping initial loading and
bundle behavior deterministic. Any future decoder must remain an optional
loader configuration and retain the same fallback path.

## Blender authoring workflow

Use the supplied template generator from a Blender installation:

```powershell
blender --background --python tools/blender/create_equipment_asset_template.py -- --id generic-conveyor-v1 --category conveyor --output .\asset-output
```

The script sets metric units, creates a root at the equipment base, exports a
small GLB and writes a valid starting manifest. Replace placeholder geometry,
preserve semantic node names, create LOD/collision assets as required, calculate
real SHA-256 values, and record the actual license before a package is accepted.

AI-generated meshes may be used only as a visual starting point. They must be
cleaned, licensed, scaled and given deterministic pivots/semantic nodes; they
must never become the collision or kinematic source of truth.

## Adding a visual safely

1. Author and validate the package against the manifest contract.
2. Register a `glb` visual with a known procedural fallback in
   `EquipmentAssetRegistry`.
3. Reference the visual asset id from an equipment definition/configuration.
4. Bind visual nodes to an existing runtime adapter; do not put behavior in the
   asset package.
5. Add manifest, loader/fallback, transform and visual regression tests.

The small reference GLB used by tests exists only to prove headless parsing and
loader behavior. It is not a production robot mesh.

The first production-style generated assets are the generic conveyor and pallet
station; see [INDUSTRIAL_SCENE.md](INDUSTRIAL_SCENE.md) for their runtime
bindings, deterministic collision proxies, quality profiles and regeneration
workflow.

S55 adds the flagship `hero-cnc-machine-v1` and render-only
`hero-cell-dressing-v1` packages, generated by the same reproducible pipeline and
validated for semantic nodes, triangle budgets, bounds, hashes and license. S60
deepens the hero CNC/dressing detail and the three generic six-axis robot
packages, and the generator now additionally enforces the primary triangle
budget, declared bounds and LOD semantic-node preservation for those packages at
generation time. See [Hero reference cell](HERO_REFERENCE_CELL.md) and
[Professional robot assets](PROFESSIONAL_ROBOT_ASSETS.md).

S65 generates one generic, license-safe GLB package for every equipment class
used by the five flagship scenario cells (conveyors, vision station, diverter,
bins, cabinets, pedestal, pallet, cartons, gripper, fence, light curtain,
buffers, fixture, clamps, sensors, parts and safety devices). The packages follow
the same contract — meters, Y-up, right-handed, `equipment-base` origin, `lod1`
LOD, embedded SHA-256 hashes, a `box` collision proxy and the Fabrik3D generated
license — and are registered as preferred `glb` visuals with a procedural
fallback. See [Real 3D scenario runtime](SCENARIO_3D_RUNTIME.md) for the full
inventory, budgets and node contract.

## Shared PBR materials and factory environment (S68)

S68 replaces the per-builder material literals with one small, documented PBR
vocabulary in `equipment/visuals/materialLibrary.ts`, and adds a coherent
industrial ground layer in `equipment/visuals/factoryEnvironment.ts`. No new
asset runtime, scenario family or protocol was introduced; the appearance is
visual-only and never becomes collision, runtime, scenario or telemetry truth.

The vocabulary contains painted steel, bare steel, aluminium, rubber, industrial
plastic, glass, safety yellow, painted floor, wood/cardboard, screen/emissive and
the supporting industrial paints/indicators used by the existing visuals. Every
definition records a color, metalness, roughness and provenance
(repository-generated PBR parameters, Fabrik3D educational license);
`validateMaterialLibrary()` fails on an out-of-range or undocumented definition.
`createMaterialPack()` returns one material instance per id for a single visual,
so materials are reused within a visual (bounded material allocation) while
remaining instance-owned, and status-color edits cannot leak between visuals.

S68 originally kept the library texture-free. S72 supersedes that policy: selected
materials now carry deterministic, repository-generated procedural surfaces from
`equipment/visuals/proceduralSurfaces.ts` (see the next section).
`MATERIAL_TEXTURES` is no longer empty; it records the surface id, kind,
resolution, estimated RGBA8 bytes, source and license of every bound surface, and
`validateMaterialLibrary()` rejects an unknown surface reference.

The factory environment builder provides the shared ground layer used by the four
material-flow flagship cells (through `ScenarioRuntimeHost`) and by the CNC
reference cell (`SingleConveyorFloor.vue`): industrial (or training-lab) floor,
expansion joints, safety-zone perimeter, pedestrian/operator access lane, cable
tray and a cell-identifier plate. It is deterministic; the `industrial-hall`
variant measures **54 meshes / 638 triangles / 54 draw calls / 5 textures**
(GPU-free, `measureSceneResources`) after S72. A training-lab variant trims the
access lane and cable tray. The equipment visuals were also given credible detail
where it materially aids readability: cabinet doors/handles/hinges and labels,
conveyor guard rails and a motor/cable drop, cardboard cartons, and a robot
dress pack/hose.

## Procedural surface textures and equipment grounding (S72)

S72 removes the flat, ungrounded look without shipping an image file, adding a
runtime dependency or touching runtime/collision/telemetry authority.

- `equipment/visuals/proceduralSurfaces.ts` generates four categories of surface:
  floors (concrete, painted-profile, roughness), markings (safety stripes,
  access-lane), metals (diamond plate, perforated mesh, painted steel with wear,
  brushed metal), wood/cardboard grain, label/screen faces (warning label,
  equipment signage, HMI screen) and the radial contact-shadow decal. Every
  surface is a pure function of a seeded mulberry32 PRNG; `renderSurfacePixels()`
  is byte-identical for the same surface id and seed and the module contains no
  `Math.random` or `Date.now` (asserted by tests).
- The 14 declared surfaces are bounded by
  `SURFACE_TEXTURE_BUDGET = { maxResolution: 256, maxTextureCount: 14,
  maxEstimatedBytes: 4 MiB }`. The whole library estimates to **2.08 MiB** RGBA8
  base level (`width * height * 4`); the estimate is always labelled as an
  estimate because WebGL does not expose real texture memory.
- `materialLibrary.ts` attaches the shared cached `map`/`roughnessMap` surfaces
  declared by `MATERIAL_SURFACE_BINDINGS` (floor, floor roughness, safety
  markings, clear-zone paint, signage, painted steel, brushed metal, wood grain,
  HMI screen). One cached GPU texture is shared per surface, so many materials and
  instances reuse it. `createMaterial(id, { textures: false })` yields an
  explicitly untextured variant.
- Label and screen surfaces use a `CanvasTexture` with real text when a 2D canvas
  exists; headless hosts and tests get the deterministic `DataTexture` bitmap
  instead of a missing texture.
- `equipmentGrounding.ts` centralizes `castShadow`/`receiveShadow` for loaded GLB
  instances (`ThreeGlbAssetLoader` and `EquipmentAssetRuntime` call it) and for
  procedural fallbacks, adds the contact-shadow decal, and attaches surfaces to
  generated `label:*`/`signal:*screen*` GLB nodes.

Measured (GPU-free `measureSceneResources` / `estimateSceneTextureMemory`):

| Visual | Meshes | Triangles | Draw calls | Textures | Texture bytes |
|---|---|---|---|---|---|
| Factory environment (industrial-hall) | 54 | 638 | 54 | 5 | 1 048 576 |
| Procedural hero CNC visual | 28 | 764 | 28 | 4 | 851 968 |
| Material-flow scenarios (procedural fallback) | 55–125 | 1 008–1 652 | 55–125 | 5–8 | 0.81–1.50 MiB |

Textures, surfaces and contact decals are visual-only. They never become
collision proxies, runtime state, scenario truth or telemetry, and the procedural
fallback path is unchanged.

## Industrial environment, atmosphere and post-processing (S74)

S74 makes every cell read as a real industrial hall. It is visual-only and never
changes runtime, state, signal, safety or collision authority.

- `equipment/visuals/industrialEnvironment.ts` replaces the generic neutral
  `RoomEnvironment` PMREM with a deterministic procedural softbox rig
  (dark shell, bright ceiling softbox, two side softboxes, warm work strip)
  captured into a PMREM cube. It also assigns a deterministic vertical gradient
  background (`DataTexture`, sRGB, no downloaded HDRI), an optional
  `FogExp2` and the bounded local lights. The same quality always produces the
  same configuration (no `Math.random`, no `Date.now`), and every geometry and
  material it owns is disposed by `handle.dispose()`.
- The environment and light configuration is declared per quality preset:

  | Preset | Environment intensity | Fog density | Local-light budget | Shadow-casting lights |
  |---|---|---|---|---|
  | `low` (Performance) | 0.55 | 0 (disabled) | 0 | 1 (key light only) |
  | `medium` (Balanced) | 0.85 | 0.012 | 6 | 1 (key light only) |
  | `high` (Quality) | 1.00 | 0.016 | 7 | 1 (key light only) |

  `MAX_LOCAL_LIGHT_BUDGET = 10` is a hard ceiling; decorative local lights never
  cast shadows. Exactly one shadow-casting key light exists, and it is the only
  shadow caster. `validateIndustrialEnvironmentPresets()` rejects out-of-range
  intensities/densities, out-of-budget local lights and any decorative light that
  would cast a shadow.
- The local-light vocabulary is `work-light`, `machine-hood-spot` and
  `emissive-fixture` (`LOCAL_LIGHT_KINDS`), tied to the existing `work-light` /
  `screen-emissive` material families. Their placements are deterministic and
  capped by the preset budget, and they are scenery: they never drive a signal,
  a status color or collision.
- `equipment/visuals/postProcessing.ts` adds an optional `EffectComposer` path
  gated by the existing quality presets: cheap depth AO (reuses the depth buffer
  produced by the beauty pass, so the scene is not re-rendered), selective bloom
  for emissive screens/signals and FXAA, followed by `OutputPass` for tone
  mapping/color space. `low` quality, a missing context, a WebGL1 context or a
  non-`hardware` acceleration class fall back to the direct
  `renderer.render(scene, camera)` path (`resolvePostProcessingDecision`).
- The blast radius of bloom is bounded so status colors stay readable: the
  luminance threshold is ≥ 0.8 and the strength ≤ 0.45. `validatePostProcessingPresets()`
  rejects a disabled preset that declares passes, an enabled preset with no
  passes, and any threshold/strength/scale outside the documented range.
- `useThreeScene` re-applies the preset pixel ratio on resize and resizes the
  composer, and the frame metrics/benchmark read the captured scene beauty-pass
  statistics (not the trailing fullscreen pass) so draw-call/triangle numbers
  stay honest when the composer is active.

Measured on the documented reference machine: the geometry delta is +1 draw call
and +2 triangles (the gradient background quad); the composer path costs frame
time but every measured profile stays above the 60 FPS target (minimum 63.8 FPS).
The full before/after table, methodology and non-claims are in
[PERFORMANCE.md](../operations/PERFORMANCE.md).

## State-driven motion and instanced detail (S75)

S75 adds secondary motion that strictly derives from runtime state and raises
scene detail without inflating draw calls. It is visual-only and never changes
runtime, state, signal, safety or collision authority.

- **State-bearing nodes.** The procedural `two-finger-gripper` declares
  `gripper:finger-left` / `gripper:finger-right`; the `vacuum-gripper` declares
  `gripper:vacuum-cup`; the `straight-conveyor` declares `belt-marker`; the
  `fanuc-like-6axis` fallback declares `robot-base-beacon`, `dress-pack` and
  `hose`. `ScenarioCellAnimator` binds them to the authoritative
  `CellVisualState` and the mirrored robot joint pose; a visual without a node is
  skipped rather than inventing state.
- **Deterministic helpers.** `scenarios/stateDrivenMotion.ts` holds the pure,
  WebGL-free functions (`gripperFingerGap`, `advanceBeltOffset`, `dressPackFlex`,
  `robotBeaconSignal`) with declared constants (`GRIPPER_FINGER_OPEN_METERS`,
  `GRIPPER_FINGER_CLOSED_METERS`, `DECLARED_CONVEYOR_SPEED_MPS`,
  `BELT_MARKER_TRAVEL_METERS`, `DRESS_PACK_MAX_FLEX_RADIANS`). The belt offset
  advances only while the lifecycle is `running`, so a stopped conveyor produces
  no motion.
- **Emissive preservation.** `emissive()` changes only the emissive channel; the
  PBR base color is preserved, so a signal change never overwrites the material
  identity. The optional robot-base beacon uses the off/running/fault roles.
- **Instancing.** The factory environment places expansion joints, access-lane
  ticks and cable-tray rungs as one `InstancedMesh` per repeated family (one draw
  call each) instead of one mesh per element.
- **Human-scale dressing.** Silhouette mannequins (~1.75 m), a control cabinet,
  an extinguisher, two signage boards and an overhead pipe run are built from
  shared geometry and the shared material vocabulary. The dressing is optional
  (`includeDressing`) and render-only.

Measured on the four material-flow cells (procedural fallback, GPU-free,
2026-10-03): 76–108 meshes / 2 396–2 824 triangles / 76–108 draw calls per cell,
inside the documented `< 200` draw-call budget. The full table is in
[SCENARIO_3D_RUNTIME.md](SCENARIO_3D_RUNTIME.md).

## Reference-cell budgets and measured values

S39 made the CNC machine-tending reference cell the deep demonstration baseline.
Its visual state is driven by `CncCycleMachine`; the visual geometry is built by
`equipment/visuals/cncMachineVisual.ts` and measured deterministically with
`measureSceneResources` in `cncMachineVisual.test.ts` (no GPU required):

| Metric | Documented budget | Measured (CNC visual, S39/S72) |
|---|---|---|
| Draw calls | ≤ 60 | 28 |
| Triangles | ≤ 6 000 | 764 |
| Meshes | ≤ 40 | 28 |
| Textures | ≤ 14 (procedural, ≤ 4 MiB) | 4 (851 968 bytes) |

The machine visual uses a coherent painted-steel / stainless / safety-yellow /
rubber / glass palette with believable roughness and metalness. Build/dispose was
repeated 25 times in the same process and produced identical metrics every cycle,
which demonstrates deterministic disposal and no per-instance resource
accumulation.

The one signal-binding tick is also budgeted, because it runs every frame for the
whole catalog: `binding.test.ts` drives 1 000 ticks and asserts < 1 ms per tick
(measured average is printed by the test). The reference target remains a stable
60 fps at 1080p on the documented reference machine and browser. That wall-clock
GPU frame time was measured, hardware-labelled and re-measured by S62/S68 rather
than asserted from geometry counts alone; the recorded numbers and non-claims are
in [PERFORMANCE.md](../operations/PERFORMANCE.md). No asset is downloaded at
runtime: the reference cell's GLB packages are generated deterministically and the
procedural CNC/conveyor/pallet builders remain the fallback.

S60 re-measured the generated packages with `measureSceneResources` (GPU-free,
`test-results/perf`-style static counts). Full before/after tables are in
[Professional robot assets](PROFESSIONAL_ROBOT_ASSETS.md) and
[Hero reference cell](HERO_REFERENCE_CELL.md); the summary is:

| Package | Primary triangles (S55 → S60) | Primary meshes (S55 → S60) | Textures |
| --- | --- | --- | --- |
| `generic-6axis-*-v1` | 2 364 → 4 640 | 32 → 58 | 0 |
| `hero-cnc-machine-v1` | 1 004 → 1 608 | 37 → 69 | 0 |
| `hero-cell-dressing-v1` | 676 → 1 064 | 38 → 62 | 0 |

All levels stay far inside their declared budgets, no package downloads a texture
at runtime and no compressed decoder was introduced. LOD1 keeps the silhouette and
every semantic node while dropping fine detail.

### Measured cell layout (S60)

Floor size and camera framing are no longer hand-tuned constants. `catalog.ts`
derives each built-in preset's `environment.floorSizeMeters` and `camera` from
`resolveCellLayout(cellFootprints(cell))` (`src/scenes/cellLayout.ts` +
`src/scenes/cellFootprints.ts`). The derivation uses declared SI footprints
(equipment SDK dimensions, with the analytic collision proxy for the hero CNC),
the robot reach envelope and the documented clearances in
`DEFAULT_CELL_LAYOUT_REQUIREMENTS` (service 1.2 m, operator corridor 1.5 m, fence
clearance 0.2 m, camera margin 1.0 m, safety-zone margin 0.25 m, floor margin
1.5 m). Floor sizes round up to a stable 0.5 m increment and stay centred on the
equipment base frame; the camera keeps a three-quarter view direction and takes
the strict framing distance for the measured extents.

The layer is a configuration aid, never runtime truth: it reads only declared
data, reports diagnostics (`equipment-outside-floor`, `equipment-overlap`,
`robot-unreachable`, `fence-clearance`, `service-clearance`, `operator-corridor`,
`conveyor-footprint`, `camera-framing`, `safety-zone-too-small`, …) instead of
throwing, and never mutates simulation, collision, safety or telemetry state.
`cellLayout.test.ts` covers the positive and negative clearance/reach/corridor
cases and proves every built-in preset has zero error-severity diagnostics with
floor and camera exactly matching the derived values. S69 adds `composition.test.ts`,
which enforces the same acceptance criteria on all five flagship cells and proves
the derived `overview`/`operator`/`workcell` cameras contain the measured bounds
(see `SCENE_PRESETS.md`).

