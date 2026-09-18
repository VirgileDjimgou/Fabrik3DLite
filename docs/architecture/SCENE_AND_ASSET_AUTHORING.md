# Authoring scenes and equipment

## Safe extension path

1. Create an `EquipmentDefinition` with SI dimensions, typed ports, anchors, parameters and an analytic collision proxy. A visual mesh is never collision or runtime authority.
2. In Blender, model in metres with Y-up and the origin at the equipment base. Name semantic nodes with the approved prefixes (`anchor:`, `joint:`, `sensor:`, `tool:`, `signal:`, `motor:`, `fixture:`). Export GLB and generate a thumbnail plus LODs.
3. Create an asset manifest with bounds, licence, SHA-256 references, collision metadata and semantic nodes. Use the trusted package importer; invalid or corrupt packages remain visual-only and fall back to the registered procedural representation.
4. Register the visual with `EquipmentAssetRegistry`, then create an `EquipmentExtension` linking the definition and visual. Simulation-ready definitions must provide a code-owned `createRuntime` adapter; package imports cannot install executable behaviour.
5. Add a versioned scene preset with its cell, environment, camera, panel defaults and compatible scenario ids. `ScenePresetCatalog.register` validates it. No application-shell or existing scene-component edit is needed for a visual-only preset.
6. Test port compatibility, package integrity, fallback, deterministic cell round-trip, scene selection/remount and the relevant visual baseline. Review draw-call, texture and triangle budgets using `measureSceneResources`.

## Rollback

Keep the previous manifest version and preset data in source control. To rollback, unregister the new preset/asset registration or point its visual selection to the existing procedural fallback. Do not delete collision proxies, runtime adapters or old scene files while they may still be referenced.

## Templates

Copy the `ExtensionRegistry.test.ts`, asset-package importer tests and scene catalog tests when adding an extension. Tests must cover an invalid package and a missing visual fallback.
