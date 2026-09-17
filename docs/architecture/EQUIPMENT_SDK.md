# Equipment SDK

The simulator equipment SDK provides an incremental extension boundary for Fabrik3D cells. It does not replace the Vue 3 or Three.js components already used by the single-conveyor scene.

## Conventions

- SDK version: `1.0`.
- World frame: right-handed, `X` points right, `Y` points up and `Z` points forward.
- Internal units: meters, radians, seconds and kilograms.
- `EquipmentDefinition` describes a reusable model; `EquipmentInstance` locates it in a `CellDefinition`.
- Runtime, visual and telemetry contracts are separate, so a workflow does not require a Vue component reference.

## Current compatibility layer

`LegacyRobotAdapter`, `LegacyCncAdapter`, and `LegacyPalletStationAdapter` wrap the existing single-conveyor robot controller, CNC component API and pallet feed API. The fixture `SINGLE_CONVEYOR_CELL` declares the current robot, CNC, conveyor and pallet station with their real scene transforms.

New equipment is registered through `EquipmentRegistry`: add a definition, then an instance, without modifying `SingleConveyorCellLayout.vue`. Visual editor and external plugin loading remain out of scope for this SDK version.
