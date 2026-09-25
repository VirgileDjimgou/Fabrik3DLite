# Industrial scene: conveyor and pallet station

S22 replaces the reference cell's conveyor and pallet carrier visuals with
generated, manifest-backed GLB assets while retaining the prior procedural
builders as automatic fallbacks. Simulation ownership is unchanged: pallet flow
drives material movement, the workflow drives machine states, and safety uses
deterministic analytic geometry rather than render triangles.

## Assets and semantics

The reproducible source assets live under:

```text
Fabrik3D/fabrik3d.client/public/assets/equipment/
├─ generic-conveyor-v1/
│  ├─ equipment.asset.json
│  ├─ model.glb
│  ├─ lod/lod1.glb
│  └─ thumbnail.svg
└─ generic-pallet-station-v1/
   ├─ equipment.asset.json
   ├─ model.glb
   ├─ lod/lod1.glb
   └─ thumbnail.svg
```

Regenerate both assets after changing their source generator:

```powershell
npm run assets:generate
```

The conveyor has belt segments and rollers driven by its existing speed input.
`sensor:station` is illuminated only when the current pallet flow reports a
stopped pallet. The pallet asset contains locators, clamps, a presence sensor,
and `anchor:robot.grasp`; cavity/part occupancy remains driven by the existing
pallet data model. GLB exporters sanitize punctuation in node names, so the
authoring generator stores the stable semantic id in each node's GLTF `extras`
as `userData.semanticId`.

## Collision and dimensions

The conveyor visual is 6.0 m long with an analytic collision proxy of
6.0 × 0.64 × 0.72 m. `cellObstacles.ts` reads this proxy declaration, so its
keep-out geometry remains aligned with the manifest. The pallet rim collision
model remains intentionally more precise than the visual pallet envelope: the
open cavity is valid robot workspace.

## Rendering quality

The shared renderer uses sRGB output, ACES tone mapping, PBR environment
lighting and soft shadows. Select a profile with the URL parameter:

| Profile | URL | Intent |
|---|---|---|
| Low | `?quality=low` | No shadows, pixel-ratio cap 1 for constrained devices |
| Medium | default / `?quality=medium` | Reference mode: 2048 shadows, pixel-ratio cap 2 |
| High | `?quality=high` | 4096 shadows for inspection screenshots |

The generated conveyor contains fewer than 8,000 triangles; its LOD and the
pallet LOD are checked against their manifest budgets. No texture is required
by the current generated assets, keeping memory use and loading deterministic.

## Reference-cell material flow (S39)

The CNC machine-tending reference cell keeps the same pallet data model and adds
signal-visible material flow. Each pallet slot moves through `raw → in-process →
machined` as the workflow picks, machines and returns a part; on the stopped
pallet the remaining raw and completed machined counts are published as
`conveyor-1.RawSlotsRemaining` and `conveyor-1.MachinedSlots`. The pallet station
still only renders slot occupancy; it never owns the transition. The CNC cycle
itself is deterministic and documented in
[CNC_AND_SAFETY_VISUALS.md](CNC_AND_SAFETY_VISUALS.md), and the conveyor's
`SpeedDeviation` signal exposes |actual − reference| for drive diagnostics.

