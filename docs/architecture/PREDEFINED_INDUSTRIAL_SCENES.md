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

## Scenario-specific industrial assets (S65)

The preferred visual for each material-flow equipment class is now a generated,
license-safe GLB package (with the S58 procedural visual as the deterministic
fallback), and the training manipulator uses the existing generic professional
six-axis robot instead of a procedural preference. Scenario identifiers, events,
cell composition and success criteria are unchanged. See
[Real 3D scenario runtime](SCENARIO_3D_RUNTIME.md).

## Anchor-driven modular assembly (S73)

Declared anchors, ports and connections are now authoritative for 3D runtime
placement. `resolveCellAttachments` (`src/equipment/attachment.ts`) derives an
attached instance's world transform from its target's declared anchor or port,
with the declared transform kept as the compatibility fallback. The palletizing
cell attaches its vacuum gripper to the robot's `tool:flange` anchor and the CNC
reference cell attaches its pallet station to the conveyor's `pallet-stop` port;
both resolve to their existing poses, so the five flagship cells and the CNC
reference cell keep their transforms and visual baselines. A data-only
`MODULAR_ASSEMBLY_CELL` demonstrates conveyor chains, a fence run with an
interlocked gate, tool-on-flange and pallet-station-on-port composition with no
hard-coded transforms. The 2D editor and the 3D runtime consume the same
resolver, so a `CellDefinition` resolves to identical world transforms on both
surfaces. Attachment changes placement only; scenario state, collision authority
and telemetry are unchanged.

## Scenario robot motion (S66)

The palletizing, assembly/inspection and safety cells now visibly execute
deterministic six-axis motion. A thin `ScenarioRobotMotionAdapter` maps the
authoritative scenario cell state to declared joint-space waypoints and drives the
existing `RobotController` (owner of J1-J6) and `RobotVisualBinding`; a carried
workpiece follows the derived tool frame. The simulated E-stop, interlock and
scanner conditions inhibit motion until the existing scenario safety restart is
observed. This is simulated training behavior, not an OEM program or certified
safety function, and the robot controller remains the only source of joint state.
See [Real 3D scenario runtime](SCENARIO_3D_RUNTIME.md).

## State-driven motion and instanced detail (S75)

The five flagship cells now show secondary motion that strictly follows runtime
state: gripper fingers (or the vacuum cup) open and close with the authoritative
holding state, the conveyor belt marker and rollers move only while the cell is
running and stop when it stops, an optional robot-base beacon follows robot state,
and the dress-pack cables flex within a bounded range from the joint pose. The
shared factory environment instances its repeated static elements (expansion
joints, access-lane ticks, cable-tray rungs) and adds human-scale dressing
(mannequins, cabinet, extinguisher, signage, pipe) without inflating draw calls.
Scenario identifiers, events, cell composition, success criteria and collision
authority are unchanged; no visual invents a state the runtime does not have. See
[Real 3D scenario runtime](SCENARIO_3D_RUNTIME.md).
