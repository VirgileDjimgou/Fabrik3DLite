# Scene presets and loading lifecycle

`src/scenes/` defines versioned, non-executable scene presets. A preset links a
cell definition to compatible educational scenarios, a trusted runtime profile,
environment and camera metadata, and optional panel defaults. It never embeds
Vue components, Three.js objects, runtime callbacks, or scripts.

`ScenePresetCatalog` validates unique identifiers, scenario references,
capability/runtime consistency, SI transforms, and deterministic layout data.
`SceneSelectionController` owns selection and a revisioned host key. Changing or
resetting a scene remounts `SceneHost`, which prevents scene-local state from
surviving a scene switch.

The compatibility preset `cnc-machine-tending` resolves to the existing
single-conveyor runtime. `robot-safety-training` is deliberately `layout-only`:
it can be inspected but cannot mount or imply an executable safety simulation.

## Adding a preset

1. Build a versioned `CellDefinition` using registered equipment definition IDs.
2. Add a pure-data `ScenePreset` to the catalog with compatible scenario IDs.
3. Use `layout-only` and runtime `none` until all required runtime adapters exist.
4. Add validation, selection lifecycle, and layout/visual tests.
5. Add a trusted runtime-profile resolver only when the scene is executable.

Future equipment, scenario, editor, and rendering work extends registries and
the scene host resolver; the application shell and selector remain unchanged.
