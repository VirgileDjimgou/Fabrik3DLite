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

Robot kinematics (payload, reach, joint limits, dimensions) live in the separate `RobotCatalogService`; see `ROBOT_CATALOG.md`. The robot instance in `SINGLE_CONVEYOR_CELL` is driven by the catalog's default compatibility profile (`medium-6axis`).

Versioned GLB visual packages are an optional layer above this SDK. They use the
separate renderer-facing asset registry and preserve the procedural model as a
fallback; see [3D_ASSETS.md](3D_ASSETS.md).

## Anchors, ports and declared attachments (S73)

An `EquipmentDefinition` may declare semantic `anchors` (local SI positions in
the equipment base frame) and typed `ports`. A port may name the anchor it mates
at (`EquipmentPort.anchorId`); when it does not, a deterministic convention
applies: material inputs default to `anchor:in`, material outputs to
`anchor:out`, and everything else to `anchor:placement`. `anchor:placement` is
always available at the instance origin.

An `EquipmentInstance` may declare `attachTo`:

```ts
interface EquipmentAttachment {
  targetId: string          // target instance id, or a world/infrastructure anchor id
  anchorId?: string         // target anchor (mutually exclusive with portId)
  portId?: string           // target port; a compatible mating port is required
  sourcePortId?: string     // explicit compatible port on this instance
  sourceAnchorId?: string   // local mating anchor (defaults to anchor:placement)
  rotationOffsetRad?: number
}
```

`resolveCellAttachments` (`src/equipment/attachment.ts`) derives each attached
instance's effective world transform so its source anchor coincides with the
target anchor/port, inheriting the target's Y rotation plus the declared offset.
Resolution is deterministic and dependency-ordered. It fails closed: a missing
target, unknown anchor/port, incompatible ports or an attachment cycle produces a
structured `AttachmentDiagnostic` and keeps the declared `transform` as the
compatibility fallback. Attachment changes placement only — never collision
authority, signal semantics, telemetry or runtime behaviour.

The same resolver is consumed by the 3D runtime (`ScenarioRuntimeHost.loadVisuals`)
and the 2D editor (`cellDefinitionToPlacements`), so a `CellDefinition` resolves
to identical world transforms on both surfaces. The CNC reference cell attaches
its pallet station to the conveyor's declared `pallet-stop` port, and the
palletizing cell attaches its vacuum gripper to the robot's `tool:flange` anchor;
both resolve to their existing poses, so no visual baseline changes.
