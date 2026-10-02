# S67 - Deeper deterministic scenario process flows

## Outcome

Deepen the existing material-flow scenarios into inspectable, temporally credible stages without creating a
new scenario family or timeline engine.

## Scope

- Reuse `ScenarioDefinition.activities`, `expectedEvent`, `ScenarioRunner`, `ScenarioRuntimeHost`,
  `CellVisualState` and `ScenarioCellAnimator`; extend their existing definitions and bindings only as needed.
- Vision sorting stages: part enters, sensor detects, conveyor advances, inspection begins, classification,
  diverter actuates, part routes, cycle completes.
- Palletizing stages: part available, robot approach, gripper on, pick, transfer, place, gripper off, layer
  update, cycle completes.
- Assembly stages: part available, robot load, fixture clamp, assembly, inspection, accept/rework decision,
  unclamp, complete.
- Safety stages: unsafe state, interlock/scanner detection, motion inhibited, operator acknowledgement,
  safe-state restoration, controlled restart.
- Place existing fault injections at their credible process stage and resume deterministically from a defined
  recovery point without skipping required safety or process transitions.
- Make stage timing simulation-clock-driven and observable in Step Mode; never derive authoritative progress
  from render frames.

## Non-goals and boundaries

- No new scenario families, second timeline engine or new HMI module.
- No change to server orchestration authority or to the separation of definition/runtime/visual/collision/
  telemetry.

## Testing and validation

- Deterministic event/activity order, duration, pause, step, fault interruption, recovery and replay tests.
- Integration tests keeping robot, workpiece and equipment visual states synchronized to scenario state.
- Step Mode tests proving each meaningful intermediate stage can be inspected.
- Regression tests for normal and faulted flows in all four material-flow scenarios.

## Acceptance criteria

1. Each scenario follows the specified intermediate stages with credible non-instantaneous timing.
2. Step Mode exposes those stages deterministically.
3. Faults interrupt at the relevant stage and recovery resumes through a defined deterministic transition.
4. Robot and equipment visuals reflect, but never author, scenario state.
5. Existing replay and assessment behavior remains compatible.

## Evidence expected for completion

Record state-transition traces, duration/step/replay tests, fault-and-recovery results, representative captures
and all applicable quality gates.

