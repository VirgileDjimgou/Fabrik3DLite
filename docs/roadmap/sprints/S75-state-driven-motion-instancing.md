# S75 - State-driven equipment motion and instanced scene detail

## Outcome

Add believable secondary motion that strictly derives from runtime state, and increase scene detail
through instancing/merging and human-scale dressing without inflating draw calls.

## Scope

- Animate gripper fingers from the real gripper state: bind `gripper:finger-left/right` (or the vacuum
  interface) nodes in the scenario runtime with deterministic interpolation; open/close must match the
  simulation state and never run decoratively.
- Animate conveyor belt surfaces/rollers from the declared run/speed signals: UV scroll or segment
  offset proportional to the commanded speed, stopped when the conveyor is stopped.
- Add bounded secondary motion for dress-pack cables/hoses driven by joint pose (segment/curve update),
  preserving the existing CNC door/feed/clamp behavior as the reference.
- Fix indicator emissive handling in `src/scenarios/ScenarioCellAnimator.ts` so switching a signal
  preserves the PBR base color instead of overwriting it, and add an optional robot-base beacon driven
  by robot state signals.
- Increase detail with `InstancedMesh`/merged geometry for repeated static elements (fence posts/panels,
  floor joints/dashes, cable-tray rungs, pallet slats) and add human-scale dressing props (silhouette
  mannequins, cabinets, extinguishers, signage boards, pipes) using shared geometry and materials.
- Keep visuals strictly derived from runtime state; decorative animation must never contradict the
  simulation. No state, safety, collision or signal logic moves into visuals.
- Update `docs/architecture/SCENARIO_3D_RUNTIME.md`, `docs/architecture/3D_ASSETS.md` and
  `docs/architecture/PREDEFINED_INDUSTRIAL_SCENES.md`.

## Non-goals and boundaries

- No skeletal/baked animation pipeline, no physics simulation, no new animation dependency.
- No polygon or draw-call explosion; instancing must be measured.
- No state-bearing visual that invents a state the runtime does not have.

## Testing and validation

- Deterministic animation unit tests: gripper state to finger pose, conveyor speed to belt motion,
  stopped conveyor produces no motion, cable update bounds.
- Emissive-preservation tests for signal color changes.
- Draw-call/triangle measurements before/after instancing; visual regressions for the reference cell and
  flagship scenarios.
- Run every applicable baseline gate in `docs/roadmap/QUALITY_GATES.md`.

## Acceptance criteria

1. Gripper, belt and secondary motion visibly follow runtime state and stop when the state stops.
2. Signal indicators preserve material identity while changing state colors.
3. Instanced detail keeps draw calls within the documented budget and adds human-scale readability.
4. No visual contradicts the simulation; procedural fallbacks remain functional.
5. All changes are measured and documented.

## Evidence expected for completion

Record animation/state-binding tests, before/after motion captures, draw-call/triangle measurements,
visual regressions and all applicable baseline gates.
