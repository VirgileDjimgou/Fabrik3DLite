# S66 - Real robot motion in scenario cells

## Outcome

Make the existing palletizing, assembly/inspection and safety scenarios visibly execute deterministic
six-axis robot motion by adapting scenario activity to the existing robot stack.

## Scope

- Inspect and reuse `RobotCatalog`, `RobotController`, `RobotVisualBinding`, FK/IK, `joint:j1` through
  `joint:j6`, `tool:flange`, `tool:tcp` and `MotionSafetyEngine`.
- Add only a thin adapter, such as `ScenarioRobotMotionAdapter`, from authoritative scenario activity or
  event to motion targets/waypoints and then to the existing controller.
- Palletizing sequence: home, approach box, pick, lift, transfer, approach pallet, place, release, retreat,
  home.
- Assembly sequence: home, approach source, pick part, approach fixture, place, retreat, inspection pose,
  home.
- Safety sequence: limited demonstrative motion that is inhibited or stopped by the existing simulated
  E-stop, interlock and scanner state and resumes only through the existing controlled recovery path.
- Select existing compact/medium/heavy generic profiles and bind compatible professional robot GLBs.
- Keep the robot controller authoritative over J1-J6. Scenario state requests motion; visual meshes do not.

## Non-goals and boundaries

- No second robot engine, scenario timeline, OEM emulation or new scenario family.
- No arbitrary writes to external or live machinery. Safety behavior is simulated and not certified.
- Do not make render frame rate authoritative; motion progression must use deterministic simulation time.

## Testing and validation

- Deterministic waypoint ordering, joint-limit, FK/IK, tool-frame and repeatability tests.
- Integration tests from scenario event through adapter/controller to `RobotVisualBinding` semantic joints.
- Safety tests proving active E-stop/interlock/scanner prevents continued motion and controlled recovery is
  required before restart.
- Visual tests showing multi-joint motion and workpiece synchronization in palletizing and assembly.

## Acceptance criteria

1. Palletizing visibly performs approach, pick, transfer, place and retreat with J1-J6 motion.
2. Assembly visibly loads the fixture and reaches its inspection pose with J1-J6 motion.
3. Safety motion stops or is blocked for every active simulated safety condition and never runs through it.
4. Existing robot profiles, controller, kinematics, safety engine and visual binding are reused unchanged or
   extended compatibly; no duplicate engine exists.
5. Scenario, collision, telemetry and visual authority boundaries remain explicit.

## Evidence expected for completion

Record deterministic motion/safety tests, joint traces or snapshots, scenario visual captures and all
applicable quality gates. State explicitly that the safety behavior is simulated and not certified.

