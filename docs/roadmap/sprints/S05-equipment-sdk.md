# S05 - Cell model and equipment SDK

## Outcome

Introduce stable extension boundaries for equipment without rewriting the existing Vue/Three.js implementation.

## Scope

- Define versioned `CellDefinition`, `EquipmentDefinition`, `EquipmentInstance`, transforms, ports, capabilities, and runtime state.
- Define equipment categories: robot, machine, conveyor, pallet station, tool, sensor, and safety device.
- Separate definition data, runtime behavior, visual representation, and backend telemetry mapping.
- Wrap current robot, CNC, and conveyor components with adapters implementing the new contracts.
- Establish SI units and explicit coordinate-frame conventions.
- Add an equipment registry with validation and capability queries.

## Deliverables

- A small documented equipment SDK/API.
- Legacy adapters proving the current single-conveyor cell still runs.
- Example equipment definition fixtures.

## Tests and gates

- Schema and validation tests for valid and invalid equipment definitions.
- Transform/unit tests with numeric tolerances.
- Component adapter tests for existing robot, CNC, and conveyor.
- Regression test loading the current cell through the compatibility layer.

## Acceptance criteria

- New equipment can be registered without modifying the central scene component.
- Runtime logic does not depend directly on a specific Vue component implementation.

## Non-goals

- No visual editor yet and no external plugin execution.
