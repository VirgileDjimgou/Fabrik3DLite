# S07 - Frames and modular kinematics

## Outcome

Replace scene-specific angle presets as the primary targeting mechanism with testable coordinate frames and modular kinematics.

## Scope

- Introduce explicit World, Cell, RobotBase, Flange, Tool, Equipment, and WorkObject frames.
- Extract forward kinematics behind a robot-model-independent interface.
- Add an inverse-kinematics solver suitable for the catalog profiles, with convergence diagnostics.
- Preserve calibrated joint poses as fallback examples and migration aids.
- Standardize meters, radians, seconds, and kilograms internally.
- Add a developer overlay for frame axes, target poses, joint values, and solver status.

## Tests and gates

- FK reference cases for every robot profile.
- IK round-trip tests: pose → joints → pose within documented tolerances.
- Joint-limit, singularity, unreachable-target, and invalid-transform tests.
- Geometry tests for pallet slot and CNC target transforms.
- Performance benchmark for solving representative trajectories.

## Acceptance criteria

- Pallet/CNC targets are expressed in world/work-object coordinates.
- Unreachable positions produce a controlled failure, not a misleading motion.
- Kinematics can be replaced independently of Three.js rendering.

## Non-goals

- No certified robot accuracy or OEM postprocessor.
