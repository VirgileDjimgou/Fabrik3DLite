# S60 - Robot and industrial cell visual fidelity

## Outcome

Raise the visual credibility of the reference robot and industrial cells without creating excessive geometry, and make cell dimensions follow measured equipment bounds, robot reach and safety clearances.

## Motivation

The scenario runtime (S58) and per-scenario cells (S59) are functionally credible but visually generic. One credible manipulator and a measured cell layout benefit the whole product more than scattered asset inflation.

## Current-state assumptions to verify

- Inspect the existing generic six-axis GLB generation pipeline and its semantic rig.
- Record current asset bounds, robot reach, cell dimensions, camera presets, floor size, triangles, draw calls and textures.
- Confirm the S54 asset runtime/LOD policy and the S55 hero CNC/dressing bindings that must be preserved.

## Scope

### Robot

Improve the existing generic six-axis GLB generation. Preserve:

```text
joint:j1 ... joint:j6
tool:flange
tool:tcp
RobotVisualBinding
RobotController
FK/IK
collision model
```

Improve only visual geometry:

```text
realistic base
cast-arm shapes
joint housings
reducers/motors
wrist
flange
cable routing
dress pack
bolts
covers
labels
warning decals
two-finger gripper
```

The robot must visually resemble a credible industrial manipulator without copying an OEM model. Do not alter kinematics merely to fit the mesh.

### Cell dimensions

The current reference layout is approximately:

```text
robot = origin
CNC z = +3.4 m
conveyor z = -2.4 m
floor = 12 x 10 m
```

Re-evaluate these dimensions using actual asset bounds, robot reach and safety clearances. Do not arbitrarily enlarge the cell. Introduce a layout calculation/validation layer that verifies:

```text
equipment bounds
robot reach
service clearance
operator corridor
fence clearance
conveyor footprint
camera framing
safety zones
```

Target a slightly larger industrial cell only if measurements justify it. Camera presets and floor dimensions must derive from actual scene bounds where possible.

### Hero CNC and environment

Improve the existing hero CNC and dressing:

```text
panels
bevels
rails
door thickness
machine interior
spindle housing
chuck/jaws
operator panel
chip conveyor
coolant system
cables
work lights
floor markings
electrical cabinets
bollards
safety labels
```

Use moderate PBR assets.

### Budget direction (not hard requirements)

```text
robot: 20k-50k triangles
hero CNC: 15k-40k
secondary equipment: 5k-15k
textures: mostly 1K/2K
```

Preserve LOD. No 4K/8K asset inflation unless measured justification exists.

## Non-goals

- No OEM replica, no vendor-specific design copy.
- No change to FK/IK, collision, safety or telemetry semantics.
- No photorealistic renderer rewrite.
- No asset whose cost is not justified by measured benefit.

## Architecture boundaries

- `RobotVisualBinding` and `RobotController` remain the only link between visuals and kinematics.
- Collision proxies remain independent from render geometry.
- Use the shared S54 `EquipmentAssetRuntime`/cache/LOD; no component-local loader.
- The layout validation layer informs configuration; it never becomes runtime truth.

## Pipeline changes

- Extend the repository-owned, reproducible generation pipeline for the improved robot and cell assets.
- Validate semantic nodes, pivots, SI scale, bounds, triangle budgets, hashes, LODs and license metadata automatically.
- Generate purposeful LODs that preserve silhouette and semantic nodes.

## Simulator and 3D changes

- Replace the robot visual geometry while preserving rig semantics and bindings.
- Recompute camera presets and floor bounds from actual measured scene bounds.
- Improve industrial ambient/work lighting and material quality within the measured budget.
- Keep idle/running/fault/safety/replay states visually distinct and deterministic.

## Backend and HMI changes

- None expected. No visual-only server truth.
- HMI status remains authoritative and consistent with the rendered state.

## Backward compatibility

- Existing asset manifests, scene presets, cell files and fallbacks remain readable.
- Old asset packages fall back safely; no silent semantic-node or asset-id breakage.

## Failure and degraded modes

- Missing/corrupt new assets use validated procedural/fallback visuals and never stop simulation.
- Unsupported GPU quality profile selects a lower measured profile without changing runtime state.
- Layout validation reports clear diagnostics and does not block existing valid cells.

## Testing strategy

- Pipeline tests for generation reproducibility, semantic nodes, pivots, scale, bounds, triangle budgets, hashes, licenses, manifests and LODs.
- Layout validation tests with positive and negative clearance/reach/corridor cases.
- Runtime binding tests for robot/CNC/conveyor/stack-light states.
- Visual regression screenshots for idle, running, machining, fault, safety stop and replay.
- Existing kinematics, collision, state-machine and asset-runtime tests must remain green.
- Run applicable build/type-check/unit/visual/docs/security gates.

## Performance requirements

- Record per-asset triangles, draw calls, textures, texture-memory estimate, asset bytes, load time, FPS/frame timing and renderer memory per quality profile.
- Compare to the pre-sprint baseline; stable interaction takes priority over fidelity.
- Justify any cell enlargement or texture increase with measured evidence.

## Security and licensing considerations

- Record provenance/license metadata for every committed asset; no proprietary OEM extraction.
- Generated/imported files pass existing path, hash and manifest validation.

## Documentation changes

- Update the robot asset, hero cell, 3D budget and pipeline documentation with the new conventions, measured budgets and limitations/non-claims.

## Acceptance criteria

1. The reference robot looks like a credible industrial manipulator while preserving all rig node names, bindings and kinematics.
2. Hero CNC and environment detail are improved within moderation and documented budgets.
3. Cell dimensions are re-evaluated with a layout validation layer and justified by measurements.
4. Camera presets and floor dimensions derive from actual scene bounds where possible.
5. LODs, procedural fallbacks and existing asset/scene compatibility are preserved.
6. All applicable gates pass.

## Evidence expected for completion

Record pipeline outputs, asset hashes and provenance, layout validation results, before/after resource tables, visual regression results and the applicable quality gates. Do not fabricate GPU results.

## Rollback and failure containment

Keep prior asset packages addressable until the migrated visuals are verified. A broken visual level falls back through S54; runtime, collision and control behavior continue unaffected.

## Follow-up items

- HMI visual polish is S61.
- Deterministic visual QA and real GPU benchmarks are S62.
