# Motion safety and trajectory diagnostics

The simulator provides deterministic, mesh-independent motion safety so robot movements are explainable and visibly safer for education. Safety calculations never rely on rendered mesh geometry; they use simplified collision primitives derived from the cell definition.

## Collision primitives

`src/safety/collision.ts` implements deterministic primitives (spheres, capsules, axis-aligned boxes, planes) with documented tolerances (`COLLISION_EPSILON_METERS`). Intersection tests return the shortest gap in meters, and a positive margin acts as a clearance. All lengths are SI meters.

## Robot model

`src/safety/robotModel.ts` builds a `SafetyRobotModel` from a catalog `RobotDefinition`. Its forward kinematics reproduces the `IndustrialRobot` joint hierarchy (base rotation about Y, then Z/Z/X/Z/X) in the cell frame (X right, Y up, Z forward), so safety positions match the visible robot. The arm is modelled as capsule segments per link plus a tool capsule; `selfCollision` checks non-adjacent links (links joined through a zero-length intermediate joint are excluded because they always touch).

## Cell collision world

`src/safety/cellObstacles.ts` derives obstacles from the layout configuration:

- **CNC** — solid chamber behind the door plane plus front slabs around the door opening; the door opening itself is the tool's legitimate workspace.
- **Conveyor** — solid box under the belt.
- **Floor** — plane at y = 0 (the base link is mounted on it and never counts as a floor collision).
- **Safety zones** — keep-out buffers such as the pallet infeed zone.
- **Pallets** — dynamic rim-frame obstacles (the cavity grid is the tool workspace).

## Reachability

`src/safety/reachability.ts` validates targets against the robot reach envelope (radial distance from the base plus the above-floor constraint). Unreachable targets are reported explicitly with a structured diagnostic; they warn but do not block execution.

## Motion safety engine

`src/safety/motionSafety.ts` (`MotionSafetyEngine`) validates a swept path before execution:

- joint-limit violations are blocking (`JOINT_LIMIT_VIOLATION`);
- self-collision is blocking (`SELF_COLLISION`);
- obstacle/safety-zone collisions are blocking (`COLLISION_RISK`) and identify the involved equipment and motion phase;
- unreachable targets warn (`UNREACHABLE_TARGET`).

The path is sampled from the same joint-space trajectory used by the controller, so the check reflects the motion the robot will actually make. Diagnostics can be disabled via `SafetyOptions.enabled`; disabled checks are measurably cheaper (performance budget covered by tests).

## Structured alarms

`src/safety/alarms.ts` defines a typed `SimulationAlarm` contract (code, severity, message, equipmentId, phase, distance, timestamp). `AlarmLog` records alarms and notifies listeners. The `MotionSafetyPanel` overlay displays the reach envelope, check status, and recent alarms.

## Workflow integration

`PalletMachiningWorkflow` accepts an optional safety engine. Every primary motion goes through a guarded move: if the swept path is blocked, the workflow pauses (never penetrating the obstacle) and the alarm is recorded. Without a safety engine the workflow keeps its previous behavior.

## Tests

- Deterministic collision tests for known colliding/non-colliding poses (`collision.test.ts`).
- Swept-path sampling tests for CNC and pallet movements (`motionSafety.test.ts`).
- Reachability tests for all catalog robots against reference cell targets (`reachability.test.ts`).
- Alarm contract tests (`alarms.test.ts`) and an end-to-end blocked-motion workflow scenario (`blockedMotion.test.ts`).
- Render-loop performance budget with diagnostics enabled and disabled (`motionSafety.test.ts`).