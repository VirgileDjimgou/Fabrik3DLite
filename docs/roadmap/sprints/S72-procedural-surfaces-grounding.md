# S72 - Procedural surface textures and equipment grounding

## Outcome

Remove the flat, ungrounded look of the current scenes by adding deterministic, license-safe procedural
surface textures and correct equipment shadowing, without shipping image files, adding a runtime
dependency or touching runtime/collision/telemetry authority.

## Scope

- Add a deterministic procedural surface module under the client `src/equipment/visuals/` area that
  generates `CanvasTexture`/`DataTexture` maps from seeded inputs (reuse the existing seeded-PRNG
  pattern): concrete and painted floor, safety stripes, access-lane markings, diamond plate,
  perforated guard mesh, painted steel with subtle wear, brushed metal, wood/cardboard pallet grain,
  warning/signage labels with canvas text and HMI screen faces.
- Extend `src/equipment/visuals/materialLibrary.ts` so the relevant `MaterialId`s can carry
  `map`/`normalMap`/`roughnessMap`. Keep the existing honest texture policy: update `MATERIAL_TEXTURES`
  and its tests instead of bypassing them. Textures are generated at runtime or build time and never
  committed as binaries.
- Apply surfaces to the shared factory environment (`src/equipment/visuals/factoryEnvironment.ts`:
  floor, expansion joints, safety perimeter, access lane, cell identifier) and to at least the hero CNC
  and the generated robot label/signage nodes, with an explicit texture budget (resolution, count,
  memory).
- Grounding: centralize GLB shadow flags so `EquipmentAssetRuntime`/`ThreeGlbAssetLoader` (or a shared
  helper) set `castShadow`/`receiveShadow` on loaded instances, and wire `ScenarioRuntimeHost`,
  `LargeCNCMachine` and `HeroCellDressing` through it; today only the legacy robot component does this.
- Add a cheap deterministic contact-shadow decal (radial-gradient procedural texture on a transparent
  plane) under scenario and hero equipment to anchor it to the floor.
- Preserve `Definition != Runtime != Visual != Collision != Telemetry`: textures and contact shadows are
  visual-only and never collision proxies or telemetry truth; the procedural fallback path is unchanged.
- Update `docs/architecture/3D_ASSETS.md`, `docs/architecture/ASSET_RUNTIME.md` and the
  material/environment documentation with the new policy, budgets and measured texture memory.

## Non-goals and boundaries

- No committed image/HDRI/KTX2 files, no external texture downloads, no new npm runtime dependency.
- No polygon explosion and no replacement of the existing ACES/sRGB/lighting configuration.
- No change to scenario state, robot kinematics, safety or signal behavior.

## Testing and validation

- Deterministic texture tests: same seed produces identical output, no `Math.random`/`Date.now`,
  declared dimensions and color space.
- Material-library tests updated for the new map slots, provenance and disposal; texture memory stays
  bounded.
- Shadow-flag tests prove loaded GLB equipment nodes cast/receive shadows, including the scenario host,
  and that contact decals follow equipment transforms.
- Visual regressions for the reference cell and at least one flagship scenario; record texture memory,
  draw calls and the GPU benchmark delta on the reference machine.
- Run every applicable baseline gate in `docs/roadmap/QUALITY_GATES.md`.

## Acceptance criteria

1. All new surfaces are generated procedurally and deterministically; no image file or external asset is
   added.
2. Floor, markings, signage and at least the hero CNC show measurable texture use (non-zero recorded
   texture memory) and remain within documented budgets.
3. Scenario/hero GLB equipment casts and receives shadows, and equipment reads as grounded via the
   contact decal.
4. Runtime, collision, telemetry and fallback behavior are unchanged; invalid assets still fall back
   with a diagnostic.
5. Performance claims are backed by recorded measurements; no unmeasured improvement is claimed.

## Evidence expected for completion

Record the texture inventory and generation determinism tests, updated material tests, shadow/contact
test results, visual before/after captures, measured texture memory/draw calls and the GPU benchmark
comparison, plus all applicable quality-gate results.
