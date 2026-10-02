# Professional generic 6-axis robot assets

Sprint S23 adds three generated, license-safe visual assets: `generic-6axis-compact-v1`, `generic-6axis-medium-v1`, and `generic-6axis-heavy-v1`. They are generic educational models, not OEM replicas or safety-certified models.

Each package contains a full GLB, LOD1, thumbnail, and manifest. The generated geometry includes a bolted base plate, pedestal, joint covers, motors/reducers, external cable, axis/warning labels, ISO-style flange, and a TCP/tool frame. Regenerate deterministically with `npm run assets:generate`.

## S60 visual-fidelity pass

S60 deepens the same three generic packages without touching the rig. The visual
geometry now models a credible industrial manipulator: a bolted cast base plate
with pedestal, collar, cable entry and a service cover; J1/J3/J5 joint housings and
J2/J3/J4/J6 covers; shoulder/upper-arm/forearm cast links with light-coloured
ribs and side panels; J2/J3/J4 reducer + motor packs; a wrist stack; a 6-bolt ISO
flange and an integrated **generic two-finger gripper**; routed external cabling
with a dress-pack bundle, cable loop and conduit; and `label:axis-1`,
`label:warning` and `label:warning-2` decals. The three sizes share the same
topology and differ only by the profile scale and link lengths, so their triangle
counts are identical.

Only visual geometry changed. `joint:j1`…`joint:j6`, `tool:flange`, `tool:tcp`,
`RobotVisualBinding`, `RobotController`, FK/IK and the `capsule-6axis` collision
model are unchanged; the robot still mounts at the cell origin and `tool:tcp`
stays at the grasp point between the two fingers.

The LOD1 drops the decals, dress-pack/bolt fine detail and cabinet-level props
while preserving every semantic pivot and tool frame, so the animation contract
still resolves at a distance. `s60AssetPipeline.test.ts` re-reads the committed
packages and asserts the six joints, both tool frames, the `gripper:*` nodes, the
`Y, Z, Z, X, Z, X` axis order, the license, the bounds range and the LOD triangle
reduction.

### Measured robot budgets (S60)

Render-independent counts, re-measured from the committed GLBs on this
development machine (2026-10-02; draw calls are material bindings and are one per
mesh here). Textures: 0 — the robot is procedural-material only.

| Asset | Level | Meshes | Triangles | Draw calls | Bytes |
| --- | --- | --- | --- | --- | --- |
| `generic-6axis-compact-v1` | primary | 58 | 4 640 | 58 | 259 204 |
| `generic-6axis-compact-v1` | lod1 | 42 | 1 656 | 42 | 131 952 |
| `generic-6axis-medium-v1` | primary | 58 | 4 640 | 58 | 259 236 |
| `generic-6axis-medium-v1` | lod1 | 42 | 1 656 | 42 | 131 984 |
| `generic-6axis-heavy-v1` | primary | 58 | 4 640 | 58 | 259 172 |
| `generic-6axis-heavy-v1` | lod1 | 42 | 1 656 | 42 | 131 948 |

Declared budgets: primary ≤ 25 000 triangles, LOD1 ≤ 2 500. The brief's 20k–50k
triangle direction for robots is a ceiling, not a target: this pass stays
deliberately lean (≈4.6k triangles, up from the S23 ≈2.4k) because the added
forms read at cell distance without inflating load, texture memory or draw calls
unjustifiably. No 4K/8K texture set or compressed decoder was introduced.

## Animation contract

The GLB hierarchy must expose a nested `joint:j1` through `joint:j6` chain. `RobotVisualBinding` maps controller joint values to fixed axes `Y, Z, Z, X, Z, X`. It owns no joint state and does not implement forward kinematics: `RobotController` and shared kinematics remain authoritative.

`tool:flange` and `tool:tcp` are stable import points for future end-effectors. The visual manifest keeps the existing `capsule-6axis` collision identifier; collision and safety logic remain in the established safety model rather than in a GLB mesh.

## Importing a future robot asset

1. Create a right-handed, metre, Y-up GLB with the six semantic pivot groups nested in order.
2. Keep the neutral pose at zero and match the profile dimensions/scale used by shared kinematics.
3. Add a validated equipment manifest, LOD, material identifiers, and a procedural fallback registration.
4. Add its catalog visual asset ID and profile mapping; preserve the generic fallback when loading or validation fails.
5. Add deterministic pivot/FK and package smoke tests before making it selectable.

## Reference-cell composition (S39, deepened in S55)

The `cnc-machine-tending` reference cell composes the selectable robot profile
with a CNC machining centre, the generated conveyor/pallet assets, a safety-guard
system and industrial infrastructure (cabinets, cable tray, operator pedestal,
E-stop, scanner, stack lights). Proportions stay in SI metres and at a credible
industrial scale: the robot mounts at the cell centre, the CNC body is
2.0 × 2.2 × 1.6 m with a 0.9 × 1.0 m loading door at 1.0 m height, the conveyor
runs 6 m, and the fence posts are 2.1 m. Materials use a coherent painted-steel /
stainless / safety-yellow / rubber / glass palette with believable roughness and
metalness; the shared renderer provides sRGB output, ACES tone mapping, PBR
environment lighting and shadows.

Since S55 the CNC visual is the generated `hero-cnc-machine-v1` GLB (with the
procedural S39 visual as fallback) and the cell adds the render-only
`hero-cell-dressing-v1` GLB. Both expose the same semantic nodes
(`door:loading`, `spindle:main`, `fixture:chuck`, `axis:feed`,
`signal:stack-light`) and are instance-owned so they dispose cleanly on scene
unload. See [Hero reference cell](HERO_REFERENCE_CELL.md).

