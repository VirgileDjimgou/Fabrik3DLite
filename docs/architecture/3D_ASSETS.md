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
protocol URLs, backslashes, and traversal sequences are rejected. S25 will add
the trusted import/catalog workflow; S21 deliberately accepts only code-owned
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
`EquipmentVisualProvider` loads GLBs through a cache and returns independent
scene instances. If the registry entry, manifest, or GLB is invalid/unavailable,
it calls the owner-supplied procedural fallback and returns a diagnostic. Thus a
visual failure cannot stop the reference cell or modify its state machine.

Cached templates share geometry/materials. Disposing an instance only removes
that clone. `disposeUnused()` frees GPU resources only after all clones for that
template have been released.

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
