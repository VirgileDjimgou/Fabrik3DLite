# S65 - Scenario-specific industrial 3D assets

## Outcome

Replace the visibly simplistic preferred visuals in the five existing flagship cells with generated,
license-safe, moderate-budget industrial GLB packages while retaining deterministic procedural fallback.

## Scope

- Inspect and reuse `EquipmentAssetRuntime`, `EquipmentAssetRegistry`, `equipment.asset.json`, LOD handling,
  asset hashes and semantic-node validation. Do not create a parallel asset runtime.
- Generate credible assets for existing scenario equipment only: conveyors, vision gantry/camera, diverter,
  bins, cabinets and pedestal; pallet, cartons, vacuum gripper, controller cabinet, fence, light curtain and
  buffers; assembly workstation, fixture, toggle clamps, sensors, parts and rework buffer; safety fence,
  interlocked gate, area scanner, E-stop, stack light and control cabinet.
- Use the existing generic professional six-axis robot assets wherever compatible. Replace the
  `fanuc-like-6axis` procedural preference without introducing an OEM name or copied geometry.
- Preserve every moving or state-bearing semantic node consumed by `ScenarioCellAnimator`.
- Resolve visuals as `GLB -> procedural fallback`; do not delete `materialFlowVisuals.ts`.
- Record provenance, license, coordinate conventions, dimensions, LODs, hashes and geometry budgets.

## Non-goals and boundaries

- No new scenarios, protocols, HMI modules, databases or product capability.
- No proprietary/OEM models, unnecessary photorealism, or 4K/8K texture sets.
- Meshes remain visual representations, never collision, telemetry or runtime truth.
- SI metres, Y-up and existing asset-coordinate conventions remain mandatory.

## Testing and validation

- Deterministic generation and byte/hash integrity tests.
- Manifest/schema, semantic-node, pivot, bounds, LOD and geometry-budget tests.
- Runtime tests proving preferred GLB loading and deterministic fallback after a missing/corrupt asset.
- Visual coverage for all five flagship cells plus applicable baseline gates.

## Acceptance criteria

1. All five flagship cells prefer visually credible, license-safe industrial GLB assets.
2. Required animator semantic nodes and existing scenario-state bindings remain functional.
3. Procedural visuals remain supported and are proven as deterministic fallback.
4. Assets stay within documented moderate geometry/texture budgets and pass integrity tests.
5. Existing robot, runtime, collision, telemetry and scenario contracts are not duplicated or weakened.

## Evidence expected for completion

Record generation commands, deterministic hashes, asset/LOD budgets, semantic-node and fallback tests,
representative visual captures, repository policy results and all applicable quality gates.

