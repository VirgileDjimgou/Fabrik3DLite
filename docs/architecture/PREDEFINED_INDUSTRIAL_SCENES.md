# Predefined industrial scenes (S29)

The built-in scene catalog contains five versioned, data-only presets: CNC machine tending, vision sorting, robot palletizing, assembly and inspection, and robot safety training. Each has a declared runtime capability, floor/camera data, equipment identifiers and only compatible scenario identifiers.

Scenarios state their prerequisites and expected simulated events. Their identifiers are stable session inputs at the orchestration boundary. Material-flow presets expose a deterministic training runtime: it publishes an explicit simulated session identifier, advances through its declared process event, then requires an explicit recovery acknowledgement. They do not represent OEM robot programs or certified safety behavior. Scene selection is revisioned by `SceneSelectionController`, so the host remounts and drops transient state when switching presets.

## Real 3D runtime (S58)

The material-flow presets are no longer rendered as a plan view. Each resolves
through `Scenario → compatible ScenePreset → CellDefinition` and executes inside a
real Three.js cell (`ScenarioRuntimeHost`), with equipment acquired from the shared
`EquipmentAssetRuntime` and procedural visuals keyed by equipment class. Scenario
state and expected events are unchanged; only the rendered runtime changed. See
[Real 3D scenario runtime](SCENARIO_3D_RUNTIME.md).

## Scenario-specific cells (S59)

The material-flow presets now declare hand-placed, SI-metre `CellDefinition`s
(`src/scenes/materialFlowCells.ts`) containing the equipment each scenario needs:
an inspection/diverter/bins sorting line, a robot + vacuum gripper palletizing
cell, an assembly fixture with clamps, and a fenced safety cell with gate, scanner
and E-stop. `src/scenarios/cellComposition.ts` is the single requirement table
shared by the visual profiles and the composition tests. The visible state
(part routing, jam, vacuum loss, gate/scanner/E-stop, stack light) is derived from
the same expected events as the scenario outcome and is never read back from
meshes. See [Real 3D scenario runtime](SCENARIO_3D_RUNTIME.md).
