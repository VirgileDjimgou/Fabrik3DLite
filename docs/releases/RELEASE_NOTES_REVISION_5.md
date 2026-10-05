# Fabrik3D — Release notes, Roadmap Revision 5 (S72–S76)

Release date: 2026-10-03. Status: **finalized by S76** after the Revision 5 validation record and the
measured Revision 4 → Revision 5 GPU comparison were produced
([`S76-revision5-validation-demo.md`](../roadmap/sprints/S76-revision5-validation-demo.md)). The
architecture and asset/layout facts below remain renderer-independent; the performance statement links
the measured comparison and claims no blanket improvement.

Release candidate: **v1.3.0** (recommended; see
[`RELEASE_PREPARATION_REVISION_5.md`](../operations/RELEASE_PREPARATION_REVISION_5.md) for the rationale
and the non-moving `v1.1.0` tag). Revision 5 builds on the immutable 1.0 baseline, the completed Roadmap
Revision 2 (S51–S57, tagged `v1.1.0`), the completed Roadmap Revision 3 (S58–S64) and the completed and
validated Roadmap Revision 4 (S65–S71). It adds no protocol, database, product or safety capability.

## Highlights

- **Procedural surface textures and equipment grounding (S72).** A deterministic, seeded RGBA surface
  generator (14 texture-free-of-files surface maps) and a shared grounding helper give the equipment
  bounded `map`/`roughnessMap` detail, contact-shadow decals and label/screen surfaces without adding an
  image dependency or an external asset license. The maps are generated in code and are visually
  grounded on the existing PBR material vocabulary.
- **Anchor-driven modular assembly (S73).** Equipment can declare an `attachTo` anchor/port reference;
  a deterministic resolver derives the placement from the declared anchor with structured fail-closed
  diagnostics and the declared transform as fallback. The cell-file schema moves to `1.1` with a
  provided `1.0 → 1.1` migration and round-trip coverage, and a data-only modular-assembly cell
  demonstrates conveyor chains, a fence run/gate, a tool on a flange and a pallet station on a port with
  no hard-coded transforms.
- **Industrial lighting, atmosphere and quality-gated post-processing (S74).** The generic room
  environment is replaced by a deterministic industrial-hall environment (procedural softbox PMREM,
  gradient background, subtle exponential fog and bounded local lights with one shadow-casting key
  light). An optional quality-gated `EffectComposer` path adds cheap depth AO, selective bloom and FXAA,
  and falls back to the direct renderer path on low quality or any non-hardware / WebGL1 / no-context
  environment.
- **State-driven equipment motion and instanced scene detail (S75).** A pure deterministic motion module
  interpolates the gripper finger gap, advances/wraps the belt offset, adds a bounded dress-pack flex and
  a robot-base beacon, all bound to the authoritative `CellVisualState`; repeated factory-environment
  elements are instanced (one `InstancedMesh` per family) and optional human-scale dressing is added.
  It is render-only: no scenario event, success criterion, signal, collision or telemetry change.

## Flagship demonstration

The documented authoritative workflow is unchanged and is re-validated in S76:

```text
HMI → New Job → scenario/cell/pallet → Create → Start → server targeted dispatch →
simulator ACK → automatic 3D execution → robot/CNC/conveyor → live HMI →
fault/recovery → Job 100 % → Completed → historian/time travel
```

- Runbook: [FLAGSHIP_DEMO.md](../operations/FLAGSHIP_DEMO.md)
- Captures and media inventory: [`artifacts/demo/flagship/`](../../artifacts/demo/flagship/README.md)
- S76 Revision 5 execution capture: 21 `quality=high` stage stills (five declared stages each for
  palletizing, vision sorting, assembly/inspection and safety training, plus CNC running) under
  [`artifacts/demo/flagship/execution-revision5/`](../../artifacts/demo/flagship/execution-revision5/),
  reproduced by `demo-12-revision5-flagship.spec.ts`. They show real declared S67 process stages with the
  S72–S75 surfaces, assembly, lighting/post-processing and motion, not idle cells. The Revision 4 stills
  remain intact under `artifacts/demo/flagship/execution/`.
- The CNC HMI → server → simulator ACK → automatic 3D execution → completion → historian/time-travel
  workflow is proven by `FlagshipWorkflowIntegrationTests`, `FlagshipDemoHistorianTests`,
  `flagship-demo.spec.ts` and the no-simulator-local-Start test.

## Compatibility and migration

- **No manual migration is required.** Revision 5 changes generated visuals, screenshot/capture media and
  additive layout/visual-runtime data only.
- The cell-file schema moves **1.0 → 1.1** (S73) for the additive `attachTo` anchor reference. A
  deterministic `1.0 → 1.1` migration is provided (the `0.9 → 1.1` path remains), the field is optional,
  and a cell without it resolves through the declared transform exactly as before.
- Scenario ids, expected events, success criteria and the cell composition contract are unchanged; the
  S67 `ScenarioActivity` metadata fields remain optional and additive.
- REST/SignalR contracts, persisted document schemas, the historian schema and connector mappings are
  unchanged (`npm run contracts:check` passes).
- Procedural fallback remains supported: a missing, corrupt or absent GLB degrades to the procedural
  visual with a diagnostic and never blocks scenario logic. The `quality=high` composer path falls back
  to the direct renderer whenever hardware acceleration is unavailable.
- Existing documentation, runbooks and the 1.0 reference sample remain valid.

## Validation

The full automated, visual, hardware-benchmark, fixture and manual gate results are recorded in
[VALIDATION_REVISION_5.md](../operations/VALIDATION_REVISION_5.md), together with the measured
Revision 4 → Revision 5 comparison (triangles, draw calls, texture memory, load time, FPS and frame
p50/p95/p99 on the documented reference machine). The comparison is mixed and reported honestly:
fidelity increased by design with the S72 surfaces, S73 assembly, S74 atmosphere/post-processing and
S75 instancing/motion, the Performance profiles stay close to Revision 4 or improve slightly, and the
Balanced/Quality profiles are measurably slower because the S74 composer path is active there.
**No blanket improvement is claimed.** The preceding record is
[VALIDATION_REVISION_4.md](../operations/VALIDATION_REVISION_4.md); the recorded hardware benchmark is
[PERFORMANCE.md](../operations/PERFORMANCE.md).

## Known boundaries

- The platform is simulated throughout; no certified safety function, OEM emulator or real-PLC
  integration is claimed. Real PLC/PLCSIM remains explicitly deferred.
- The generated GLB assets and procedural surface maps are original generic content under the Fabrik3D
  educational license; no OEM model, scan, texture or externally downloaded image is included.
- Visual meshes and post-processing never become the FK/IK, collision, safety or telemetry authority.
- See [LIMITATIONS.md](../operations/LIMITATIONS.md) for the consolidated non-claims.
