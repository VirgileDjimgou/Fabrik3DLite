# Kinematics and frames

`src/kinematics` is a pure TypeScript boundary for Fabrik3D robot motion. It does not import Three.js or Vue, so robot profiles can use it from a simulator, test harness, or future backend-side validation service.

## Units and frame convention

- Distance: meters (`m`)
- Rotation: radians (`rad`)
- Time: seconds (`s`)
- Mass: kilograms (`kg`)
- Coordinate system: right-handed, `X` right, `Y` up, `Z` forward.

The single-conveyor cell declares `world`, `cell`, `robot-base`, `flange`, `tool`, equipment (`cnc-1`, `conveyor-1`) and work-object frames (`pallet-work-object`, `cnc-work-object`). Pallet slots and CNC entry points are exported as world poses with their work-object origin recorded alongside them.

## Kinematics boundary

`RobotKinematicsModel` exposes forward and inverse kinematics. The current implementation, `SerialDhKinematics`, is a damped least-squares solver driven by generic DH links derived from each catalog profile's procedural dimensions. Its diagnostics distinguish convergence, invalid targets, singularity, targets outside the reach envelope, and iteration exhaustion.

This remains a demonstrative simulation model, not an OEM calibration or a certified collision/safety calculation. Existing calibrated joint-angle helpers in `PalletWorkspaceTargets.ts` are retained only as migration fallbacks for the current visual arm. The workflow now announces the corresponding frame-aware target before that legacy pose is applied.

## Published robot report (S53)

The simulator publishes the executed robot state to the orchestration server at 2 Hz. The payload is
explicit about its units and frame convention:

- `joints[]` — `index` (0-based), `name` (`J1`…`J6`), `angleRadians` plus the declared
  `minRadians`/`maxRadians` limits.
- `tcp` — `x`/`y`/`z` in meters and `rx`/`ry`/`rz` as intrinsic X-Y-Z (roll-pitch-yaw) radians,
  converted from the active profile's quaternion pose with Three.js `Euler('XYZ')`.
- `frames` — `baseFrame`, `toolFrame`, `workObjectFrame` and `currentToolId`.
- `units` — the literal `radians, meters`; `motionStatus` and `operatingMode` are derived from the
  controller/workflow state.

The report is the executed state, never an inverse-kinematics re-derivation or a fabricated pose. The
server validates structure (six distinct joints, a TCP pose and frames) and rejects malformed or
synthetic reports; it does not clamp the executed joint values — the simulator's
`ManualJogController` and `MotionSafetyEngine` own limits and collision checks.

## Developer overlay

`KinematicsDeveloperOverlay` shows the active profile, current tool pose, current work-object target, named frame tree and joint values. It is developer information rather than an HMI operator control.
