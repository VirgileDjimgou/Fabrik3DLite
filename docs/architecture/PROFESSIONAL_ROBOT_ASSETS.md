# Professional generic 6-axis robot assets

Sprint S23 adds three generated, license-safe visual assets: `generic-6axis-compact-v1`, `generic-6axis-medium-v1`, and `generic-6axis-heavy-v1`. They are generic educational models, not OEM replicas or safety-certified models.

Each package contains a full GLB, LOD1, thumbnail, and manifest. The generated geometry includes a bolted base plate, pedestal, joint covers, motors/reducers, external cable, axis/warning labels, ISO-style flange, and a TCP/tool frame. Regenerate deterministically with `npm run assets:generate`.

## Animation contract

The GLB hierarchy must expose a nested `joint:j1` through `joint:j6` chain. `RobotVisualBinding` maps controller joint values to fixed axes `Y, Z, Z, X, Z, X`. It owns no joint state and does not implement forward kinematics: `RobotController` and shared kinematics remain authoritative.

`tool:flange` and `tool:tcp` are stable import points for future end-effectors. The visual manifest keeps the existing `capsule-6axis` collision identifier; collision and safety logic remain in the established safety model rather than in a GLB mesh.

## Importing a future robot asset

1. Create a right-handed, metre, Y-up GLB with the six semantic pivot groups nested in order.
2. Keep the neutral pose at zero and match the profile dimensions/scale used by shared kinematics.
3. Add a validated equipment manifest, LOD, material identifiers, and a procedural fallback registration.
4. Add its catalog visual asset ID and profile mapping; preserve the generic fallback when loading or validation fails.
5. Add deterministic pivot/FK and package smoke tests before making it selectable.

## Reference-cell composition (S39)

The `cnc-machine-tending` reference cell composes the selectable robot profile
with a procedural CNC machining centre, the generated conveyor/pallet assets, a
safety-guard system and industrial infrastructure (cabinets, cable tray, operator
pedestal, E-stop, scanner, stack lights). Proportions stay in SI metres and at a
credible industrial scale: the robot mounts at the cell centre, the CNC body is
2.0 × 2.2 × 1.6 m with a 0.9 × 1.0 m loading door at 1.0 m height, the conveyor
runs 6 m, and the fence posts are 2.1 m. Materials use a coherent painted-steel /
stainless / safety-yellow / rubber / glass palette with believable roughness and
metalness; the shared renderer provides sRGB output, ACES tone mapping, PBR
environment lighting and shadows. The CNC visual exposes semantic nodes
(`door:loading`, `spindle:main`, `fixture:chuck`, `axis:feed`, `signal:stack-light`)
and is instance-owned so it disposes cleanly on scene unload.

