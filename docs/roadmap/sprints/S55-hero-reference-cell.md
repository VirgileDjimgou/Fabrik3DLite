# S55 - High-fidelity hero reference cell

## Outcome

Create one visually convincing, coherent flagship CNC machine-tending cell that demonstrates Fabrik3D professionally while preserving the established simulation, kinematics, safety and asset architecture.

## Motivation

Broad asset coverage already exists, but credibility benefits more from one deeply integrated reference cell than from attempting photorealism everywhere. S54 provides the shared runtime needed to deliver and measure that flagship safely.

## Current-state assumptions to verify

- Confirm the canonical `cnc-machine-tending` preset, S39 reference-cell behavior, current GLB assets and Blender/Python generation tools.
- Inventory semantic nodes, animation bindings, materials, lighting, cameras, visual baselines and license metadata.
- Record current triangles, draw calls, textures, asset bytes, load time and frame timing before changes.

## Scope

- Deepen one flagship cell with a coherent six-axis robot, end effector, CNC center, conveyor, pallet fixtures/workpieces, guarding, sensing, cabinets, pedestal, cable routing, stack lights, industrial floor and machine detail.
- Extend the repository-owned Blender/Python pipeline for generation, semantic/pivot validation, batch export, manifests, thumbnails, hashes and LOD generation/validation.
- Preserve robot nodes `joint:j1`…`joint:j6`, `tool:flange`, `tool:tcp` and CNC nodes `door:loading`, `spindle:main`, `fixture:chuck`, `axis:feed`, `signal:stack-light`.
- Bind visual animations to existing authoritative runtime states.
- Improve conservative reusable PBR materials, industrial lighting, shadows, tone mapping and reflections within measured budgets.

## Non-goals

- No attempt to make every scene photorealistic, no cinematic renderer and no unlicensed OEM replica.
- Visual meshes do not define FK/IK, collision, safety or telemetry.
- No unnecessary 4K/8K texture set or effect that compromises stable performance.

## Architecture boundaries

- Kinematics and equipment runtime remain authoritative; visuals bind to them through existing abstractions.
- Collision proxies remain independent from render geometry.
- Use S54 shared asset runtime/cache/LOD; do not create component-local loaders.
- Retain procedural fallbacks and backward-compatible asset manifests.

## Asset and pipeline changes

- Prefer original/license-safe assets generated in-repository with reproducible scripts.
- Enforce coordinate systems, SI scale, origins, pivots, semantic names, bounds, hashes and license metadata automatically.
- Generate purposeful LODs that preserve silhouettes/semantic nodes and validate them structurally.
- Use reusable 1K/2K PBR texture sets unless measurement demonstrates another need.

## Simulator and 3D changes

- Integrate cell visuals without changing workflow/state-machine semantics.
- Animate CNC door/spindle/chuck/feed/stack light and robot/tool/conveyor/workpieces from runtime state.
- Improve camera framing and industrial ambient/work lighting while retaining accessibility/status-color meaning.
- Ensure idle, running, machining, fault, safety-stop and replay states are visually distinct and deterministic.

## Backend and HMI changes

- None expected beyond existing runtime state needed for bindings. Do not create visual-only server truth.
- HMI status remains authoritative and consistent with the rendered state.

## Backward compatibility

- Existing cell files, presets, asset manifests and scenarios remain readable.
- Old visual packages fall back safely; no silent asset-id or semantic-node breakage.

## Failure and degraded modes

- Missing/corrupt assets use validated procedural/proxy fallback and do not stop simulation.
- Unsupported GPU quality profile selects a lower measured profile without changing runtime state.
- Visual animation binding failures are diagnosed and isolated from control behavior.

## Testing strategy

- Pipeline tests for generation reproducibility, semantic nodes, pivots, scale, bounds, hashes, licenses, manifests and LODs.
- Runtime binding tests for robot/CNC/conveyor/stack-light states.
- Visual regression screenshots for idle, running, machining, fault, safety stop and replay.
- Existing kinematics/collision/state-machine tests must remain green.
- Run applicable build/type-check/unit/visual/docs/security gates.

## Performance requirements

- Record triangles, draw calls, textures, texture-memory estimate, asset bytes, load time, FPS/frame timing and renderer memory for each S54 profile.
- Compare to the pre-sprint baseline and justify budgets with evidence; stable interaction takes priority over fidelity.

## Security and licensing considerations

- Commit only assets with recorded provenance/license metadata; no proprietary OEM extraction.
- Generated/imported files pass existing path, hash and manifest validation.

## Documentation changes

- Document the hero cell, pipeline commands, semantic-node/material conventions, asset provenance, quality profiles, measured budgets and limitations/non-claims.

## Acceptance criteria

1. The canonical hero cell forms a coherent professional industrial scene across all specified equipment.
2. Robot/CNC semantics and animations follow authoritative runtime state without redefining kinematics.
3. Asset generation/export/validation is reproducible and license-safe.
4. Required state screenshots and quantitative visual/performance measurements are recorded.
5. Existing scenes/manifests/fallbacks remain compatible and all applicable gates pass.

## Evidence expected for completion

Record pipeline/validator outputs, asset hashes and provenance, visual-regression results/screenshots, state-binding tests, before/after resource tables and applicable quality gates. Do not fabricate GPU results.

## Rollback and failure containment

Keep prior manifests/assets addressable until migration is verified. A broken visual level falls back through S54; runtime, collision and control behavior must continue unaffected.

## Follow-up items

- Sustained hardware performance and resilience validation are S56.
