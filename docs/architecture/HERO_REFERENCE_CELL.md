# Hero reference cell (S55)

S55 deepens the canonical `cnc-machine-tending` preset into one coherent,
professionally legible flagship cell. It adds generated, license-safe visual
assets and binds them to the existing authoritative runtime; it does **not**
change kinematics, collision, safety, workflow or telemetry semantics.

The cell remains render-only where it should be: `CncCycleMachine`,
`RobotController`, the analytic collision models and the signal registry stay
authoritative, and every visual is a projection of that state.

## Composition

| Element | Source | Authority |
| --- | --- | --- |
| Six-axis robot | `generic-6axis-{compact,medium,heavy}-v1` GLB (S23) | `RobotController` + shared kinematics |
| CNC machining centre | `hero-cnc-machine-v1` GLB (S55) | `CncCycleMachine` |
| Conveyor | `generic-conveyor-v1` GLB (S22) | pallet flow runtime |
| Pallet / workpiece | `generic-pallet-station-v1` GLB (S22) | pallet flow runtime |
| Cell dressing (chip conveyor, buffers, work lights, cable drops, bollards) | `hero-cell-dressing-v1` GLB (S55) | render-only |
| Guarding, cabinets, pedestal, E-stop, scanner, stack lights | procedural `SafetyGuardSystem` / `IndustrialInfrastructureSystem` | simulated safety interlocks |
| Industrial floor and markings | procedural `SingleConveyorFloor` | render-only |

All assets are loaded through the S54 shared `EquipmentAssetRuntime`
(`ASSET_RUNTIME_KEY`); no component constructs its own loader. Missing or
corrupt assets fall back to the procedural representation and never stop the
simulation.

## Semantic-node contract

The generated GLB preserves the stable node names the runtime binds to. GLTF
export/import sanitizes `:` in node names, so the binding contract is
`userData.semanticId`, which survives cloning.

Robot (unchanged since S23): `joint:j1`…`joint:j6`, `tool:flange`, `tool:tcp`.

CNC (`hero-cnc-machine-v1`):

- `door:loading` — sliding loading door; Y travel `CNC_DOOR_REST_Y` + `doorPosition × CNC_DOOR_TRAVEL_Y`.
- `spindle:main` — spindle group; rotation follows the ramped simulated speed.
- `fixture:chuck`, `fixture:jaw-left`, `fixture:jaw-right` — clamp/unclamp travel.
- `axis:feed` — feed table advance while `feedActive`.
- `coolant:nozzle`, `signal:panel-screen`, `signal:stack-light` (+ amber/red).

S60 adds *render-only* detail nodes beside the state-bearing ones (side panels,
roof/plinth bevels, chamber rails, a thicker door with handle, spindle
collar/tool/holder, stepped jaws, coolant tank/pump/hose, operator-panel buttons,
leveling feet, way covers, work lights, a cable chain, `marking:footprint-*` and
additional safety labels). None of them changes a binding.

Dressing (`hero-cell-dressing-v1`): `motor:chip-conveyor`, `fixture:buffer:1`,
`fixture:buffer:2`, `signal:worklight:1`, `signal:worklight:2`,
`anchor:buffer.access`. S60 also adds electrical cabinets
(`cabinet:electrical:*`), painted pedestrian/zone markings and a cell label.

The map from visual node to runtime state and canonical signal is declared in
`equipment/visuals/referenceCellVisualMap.ts` and enforced by
`signals/referenceCellConsistency.test.ts`.

## Pipeline

`npm run assets:generate` (`scripts/generate-industrial-glb-assets.mjs`) is the
single reproducible generator. It builds every GLB with Three.js geometry,
exports GLB + LOD1 + thumbnail + `equipment.asset.json`, and validates before
writing:

- every declared semantic node exists in the exported scene;
- the primary and LOD triangle counts stay inside their declared budgets;
- measured bounds do not exceed the declared `boundsMeters` (hero assets);
- license metadata is present.

The generator is deterministic: re-running it reproduces byte-identical files
and hashes. The TypeScript manifests in `equipment/assets/heroAssets.ts` mirror
the generated `equipment.asset.json`; `assetPipeline.test.ts` re-computes every
referenced SHA-256 and fails on any drift.

## Materials and lighting

The hero assets use a conservative, reusable PBR palette (documented in the
generator): painted machine body `#e8e9ea`, dark trim `#333a3e`, stainless
`#aeb6bc`, safety hazard `#d6a400`, chamber `#181b1d`, glass `#2a3a44`, rack
blue `#27557a`, work light `#f6f3e6`. No 4K/8K texture set is used; the assets
are texture-free and rely on the shared renderer's sRGB output, ACES tone
mapping, PBR environment lighting and shadows.

## Measured budgets

Recorded on this development machine from the generated files: the S55 baseline
was 2026-10-01 and the S60 deepening was re-measured 2026-10-02. These are static,
renderer-independent counts, not GPU frame times. Draw calls are material
bindings and are one per mesh here.

| Asset | Level | Meshes | Triangles | Draw calls | Bytes |
| --- | --- | --- | --- | --- | --- |
| `hero-cnc-machine-v1` | primary | 69 | 1 608 | 69 | 174 700 |
| `hero-cnc-machine-v1` | lod1 | 33 | 620 | 33 | 77 164 |
| `hero-cell-dressing-v1` | primary | 62 | 1 064 | 62 | 136 032 |
| `hero-cell-dressing-v1` | lod1 | 30 | 460 | 30 | 63 752 |

For comparison, the S55 baseline was CNC primary 37 / 1 004 / 37 / 102 676 B and
lod1 25 / 656 / 25 / 69 200 B; dressing primary 38 / 676 / 38 / 85 160 B and lod1
30 / 460 / 30 / 63 752 B. The dressing LOD1 is intentionally unchanged: it already
kept only the silhouette, and S60 detail does not belong in the distance level.

Declared budgets: hero CNC primary ≤ 16 000 triangles, LOD1 ≤ 6 000; dressing
primary ≤ 12 000 triangles, LOD1 ≤ 6 000. Textures: 0 (procedural materials). This
is a moderate pass within the documented budgets, not 4K/8K asset inflation.

The S49 reference-scene frame-time probe recorded, under headless Chromium
software rendering, `frames=11 mean=289.38ms p50=283.40ms p95=316.60ms`. This is
an upper bound for a software backend, not reference-hardware GPU numbers.
Sustained hardware performance was subsequently measured: the S62 deterministic
visual QA/GPU validation and the S68 PBR/environment re-measurement ran the headed
hardware benchmark on the documented reference host (Intel UHD Graphics,
1920×1080, `gpuEvidence=true`), and every measured profile stayed above the 60 FPS
reference target (minimum 78.3 FPS). The exact numbers, methodology and
non-claims are recorded in [PERFORMANCE.md](../operations/PERFORMANCE.md).

## Provenance and licensing

Every asset is generated in-repository from original Three.js geometry. No
proprietary OEM model, scan or texture is included. Each manifest records
`license.name = "Fabrik3D generated generic asset; educational use"`. The
generated files pass the existing path, hash and manifest validation.

## Limitations and non-claims

- Visual meshes are not FK/IK, collision, safety or telemetry authorities.
- The dressing is decorative; the analytic cell collision models are unchanged.
- No photorealism, cinematic renderer or OEM replica is claimed.
- No safety certification, OEM emulation or standards compliance is claimed.
- Hardware GPU frame time is measured on the documented reference machine only;
  it is a reference observation, not an SLA for other hardware, and the JS heap is
  not GPU memory ([PERFORMANCE.md](../operations/PERFORMANCE.md)).
