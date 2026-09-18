# S29 - Predefined industrial scenes and scenarios

## Outcome

Deliver a useful catalog of complete industrial cells with normal, training, and fault-recovery scenarios.

## Scope

- Finish the CNC Machine Tending preset using robot, gripper, CNC, conveyor, pallet station, guarding, sensors, cabinets, and operator station.
- Add a Vision Sorting preset with conveyor, camera, photoeyes, diverter, reject bins, and quality counters.
- Add a Palletizing preset with infeed conveyor, vacuum gripper, pallet magazine, layer pattern, guarding, and finished-pallet buffer.
- Add an Assembly and Inspection preset with robot, fixture, simplified press, vision check, and rework buffer.
- Complete the Safety Training preset with access gate, scanner, emergency stop, acknowledgement, and controlled restart.
- Provide compatible scenarios: normal cycle, missing part/pallet, blocked sensor, jam, quality reject, unclamped fixture, loss of vacuum, door interlock, collision risk, and recovery.
- Add a scene/scenario launch flow that shows prerequisites, estimated complexity, supported runtime capabilities, and explicit simulated-data labeling.
- Make scenario selection drive the server-observable session identifiers and progress already present in orchestration.

## Tests and gates

- Deterministic happy-path completion and at least one recovery path per executable scene.
- Scene/scenario compatibility validation and unavailable-capability diagnostics.
- End-to-end backend/frontend/simulator flows for CNC, sorting, and palletizing.
- Visual regression for every preset at idle, running, warning, and fault states.
- Full workspace baseline and contract gates.

## Acceptance criteria

- At least five distinct predefined scenes load from the catalog.
- CNC, sorting, and palletizing run end to end; assembly and safety training expose their documented supported behaviors.
- Faults identify the involved equipment and require the expected recovery sequence.
- Switching scenes never leaks the previous runtime state.

## Non-goals

- No exact OEM programs, process certification, or unrestricted user scripting.
