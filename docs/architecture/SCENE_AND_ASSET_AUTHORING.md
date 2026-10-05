# Authoring scenes and equipment

## Safe extension path

1. Create an `EquipmentDefinition` with SI dimensions, typed ports, anchors, parameters and an analytic collision proxy. A visual mesh is never collision or runtime authority.
2. In Blender, model in metres with Y-up and the origin at the equipment base. Name semantic nodes with the approved prefixes (`anchor:`, `joint:`, `sensor:`, `tool:`, `signal:`, `motor:`, `fixture:`). Export GLB and generate a thumbnail plus LODs.
3. Create an asset manifest with bounds, licence, SHA-256 references, collision metadata and semantic nodes. Use the trusted package importer; invalid or corrupt packages remain visual-only and fall back to the registered procedural representation.
4. Register the visual with `EquipmentAssetRegistry`, then create an `EquipmentExtension` linking the definition and visual. Simulation-ready definitions must provide a code-owned `createRuntime` adapter; package imports cannot install executable behaviour.
5. Add a versioned scene preset with its cell, environment, camera, panel defaults and compatible scenario ids. `ScenePresetCatalog.register` validates it. No application-shell or existing scene-component edit is needed for a visual-only preset.
6. Test port compatibility, package integrity, fallback, deterministic cell round-trip, scene selection/remount and the relevant visual baseline. Review draw-call, texture and triangle budgets using `measureSceneResources`.

## Composing cells from declared anchors (S73)

Prefer declared anchors/ports over literal transforms when equipment is
physically mounted on other equipment:

1. Declare the mating anchors on the `EquipmentDefinition` (for example
   `anchor:in`/`anchor:out` on a conveyor or fence panel, `tool:flange` on a
   robot) and point each port at its anchor with `EquipmentPort.anchorId`.
2. On the attached `EquipmentInstance`, declare `attachTo` with the target
   instance and either `anchorId` or `portId`. Keep a valid `transform` as the
   compatibility fallback; it is used unchanged when resolution fails closed.
3. Supported patterns: conveyor-to-conveyor chains (`anchor:out` → `anchor:in`),
   fence-panel runs with an interlocked gate, tool/gripper on `tool:flange`, and
   pallet station on a conveyor material port.
4. Verify with `resolveCellAttachments` unit tests (compatible ports, chain
   resolution, missing/incompatible diagnostics) and an editor/runtime parity
   test. Attachment changes placement only; it never changes collision, signal,
   telemetry or runtime behaviour.

## Rollback

Keep the previous manifest version and preset data in source control. To rollback, unregister the new preset/asset registration or point its visual selection to the existing procedural fallback. Do not delete collision proxies, runtime adapters or old scene files while they may still be referenced.

## Templates

Copy the `ExtensionRegistry.test.ts`, asset-package importer tests and scene catalog tests when adding an extension. Tests must cover an invalid package and a missing visual fallback.
