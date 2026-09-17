# S08 - Collision, reachability, and trajectory diagnostics

## Outcome

Make robot motion explainable and visibly safer for educational simulations.

## Scope

- Add simplified collision primitives independent from visual meshes.
- Detect robot self-collision and collisions with CNC, conveyor, floor, pallets, and safety zones.
- Validate targets for reachability and joint limits before execution.
- Add safe approach/retract waypoints and configurable clearances.
- Display planned paths, collision points, reach envelope, and warnings.
- Emit structured simulation alarms for collision risk and unreachable targets.

## Tests and gates

- Deterministic collision tests using known colliding/non-colliding poses.
- Swept-path sampling tests for CNC and pallet movements.
- Reachability tests for all catalog robots against reference cells.
- Alarm contract tests and an end-to-end blocked-motion scenario.
- Render-loop performance budget with diagnostics enabled and disabled.

## Acceptance criteria

- A known collision prevents or pauses execution before visible penetration.
- Collision diagnostics identify the involved equipment and motion phase.
- Safety calculations do not rely solely on rendered mesh geometry.

## Non-goals

- No safety certification and no full rigid-body dynamics.
