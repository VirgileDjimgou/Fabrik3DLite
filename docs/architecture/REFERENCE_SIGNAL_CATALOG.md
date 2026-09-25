# Reference cell signal catalog

This document is the authoritative catalog of the I/O declared by the CNC machine-tending reference cell and bound to its runtime by `ReferenceCellSignalBinding`. It complements the versioned schema in [INDUSTRIAL_SIGNAL_CORE.md](INDUSTRIAL_SIGNAL_CORE.md): declarations live on the equipment definitions, while the runtime registry uses the scene instance ids below.

## Binding model

- **Declarations** (`EquipmentDefinition.signals`) are definition-level metadata: name, direction, type, unit, range, default and safe value.
- **Runtime registry ids** use the scene instance id: `<instanceId>.<signalName>` (for example `robot-1.ServoOn`).
- **Readers** (`tick`) derive status signals from the actual runtime every simulation frame; a signal is never written with a fabricated value.
- **Writers** (`write`) validate the command signal, ask the simulated runtime to apply it, and only then record the value. A runtime refusal leaves both the machine state and the stored value untouched.
- **Coverage diagnostics** list any declared signal without a reader or writer (`missing-writer`) or belonging to an equipment id the binding does not manage (`unbound-equipment`). The signal inspector shows them; they are never hidden.

Direction is expressed relative to a controller: `in` = input to controller (status/measurement), `out` = output from controller (command).

## Robot `fanuc-like-6axis` → instance `robot-1`

| Signal | Direction | Type | Unit | Range | Driver (writer) | Consumer (reader) | Behaviour |
|---|---|---|---|---|---|---|---|
| `robot-1.ServoOn` | in | bool | — | — | robot controller mounted | binding | True while a robot controller is mounted in the scene. |
| `robot-1.Ready` | in | bool | — | — | derived | binding | Servo on, no active robot fault, no protective stop, not running. |
| `robot-1.ProgramRunning` | in | bool | — | — | derived | binding | Workflow run state is `running`. |
| `robot-1.AtHome` | in | bool | — | — | derived | binding | Workflow phase is `IDLE` or `COMPLETE`. |
| `robot-1.AtPick` | in | bool | — | — | derived | binding | Workflow phase is `DESCEND_TO_PICK` or `PICK_PART`. |
| `robot-1.AtMachine` | in | bool | — | — | derived | binding | Workflow phase is insert/load/retrieve. |
| `robot-1.Start` | out | bool | — | — | operator signal, workflow signal | binding | Starts the pallet cycle when a stopped pallet exists. |
| `robot-1.Stop` | out | bool | — | — | operator signal | binding | Stops the cycle and clears robot commands. |
| `robot-1.Reset` | out | bool | — | — | operator signal | binding | Resets workflow, orchestration and dashboard state. |
| `robot-1.GripperOpen` | in | bool | — | — | derived | binding | True while the workflow is not carrying a part. |
| `robot-1.GripperClosed` | in | bool | — | — | derived | binding | True while the workflow is carrying a part. |
| `robot-1.PayloadDetected` | in | bool | — | — | derived | binding | Part is held between pick and place-back. |
| `robot-1.Fault` | in | bool | — | — | active fault controller | binding | Any active simulated fault targets `robot-1`. |
| `robot-1.ProtectiveStop` | in | bool | — | — | safety interlock model | binding | E-stop latched or light curtain/scanner not clear. |

## CNC `educational-cnc` → instance `cnc-1`

| Signal | Direction | Type | Unit | Range | Driver (writer) | Consumer (reader) | Behaviour |
|---|---|---|---|---|---|---|---|
| `cnc-1.Ready` | in | bool | — | — | derived | binding | Machine `IDLE`, door closed, no CNC fault, no E-stop. |
| `cnc-1.DoorOpen` | in | bool | — | — | door animation | binding | Door reached its fully open position. |
| `cnc-1.DoorClosed` | in | bool | — | — | door animation | binding | Door reached its fully closed position. |
| `cnc-1.DoorCommand` | out | bool | — | — | operator signal, workflow signal | binding → `commandDoor` | Open when `IDLE` (starts a load) or `UNLOADING`; close when `IDLE`/`LOADING`; refused while machining. |
| `cnc-1.FixtureClamped` | in | bool | — | — | derived | binding | True while `MACHINING` or `UNLOADING`. |
| `cnc-1.PartPresent` | in | bool | — | — | derived | binding | Machine state is not `IDLE`. |
| `cnc-1.CycleStart` | out | bool | — | — | workflow signal | binding → `startCycle` | Starts machining only from `LOADING`. |
| `cnc-1.CycleRunning` | in | bool | — | — | derived | binding | Machine state is `MACHINING`. |
| `cnc-1.CycleComplete` | in | bool | — | — | derived | binding | Machine state is `UNLOADING` (cycle finished, awaiting unload). |
| `cnc-1.SpindleRunning` | in | bool | — | — | derived | binding | Machine state is `MACHINING`. |
| `cnc-1.SpindleSpeed` | in | float | rpm | 0…24000 | derived | binding | Nominal simulated spindle speed while machining, otherwise 0. |
| `cnc-1.FeedRate` | in | float | mm/min | 0…10000 | derived | binding | Nominal simulated feed while machining, otherwise 0. |
| `cnc-1.Fault` | in | bool | — | — | active fault controller | binding | Any active simulated fault targets `cnc-1`. |
| `cnc-1.EmergencyStop` | in | bool | — | — | safety interlock model | binding | E-stop latched. |

## Conveyor `belt-conveyor` → instance `conveyor-1`

| Signal | Direction | Type | Unit | Range | Driver (writer) | Consumer (reader) | Behaviour |
|---|---|---|---|---|---|---|---|
| `conveyor-1.RunCommand` | out | bool | — | — | operator signal | binding → `setRunCommand` | Stops or resumes pallet advancing and spawning. |
| `conveyor-1.Running` | in | bool | — | — | derived | binding | Belt enabled and actual speed above zero. |
| `conveyor-1.SpeedReference` | out | float | m/s | 0…2 | operator signal | binding → `setSpeedReference` | Clamped to the documented belt limit. |
| `conveyor-1.ActualSpeed` | in | float | m/s | 0…2 | derived | binding | Reference while running, zero while stopped. |
| `conveyor-1.MotorFault` | in | bool | — | — | active fault controller | binding | Any active simulated fault targets `conveyor-1`. |
| `conveyor-1.PhotoeyeIn` | in | bool | — | — | pallet positions | binding | A moving pallet is inside the 1 m infeed window. |
| `conveyor-1.PhotoeyeStation` | in | bool | — | — | pallet positions | binding | A pallet is stopped at the work position. |
| `conveyor-1.EncoderPulse` | in | uint | pulses | — | real belt travel (1000 pulses/m) | binding | Accumulates only while the belt moves. |

## Safety `safety-zone` → instance `safety-zone-1`

| Signal | Direction | Type | Unit | Range | Driver (writer) | Consumer (reader) | Behaviour |
|---|---|---|---|---|---|---|---|
| `safety-zone-1.EmergencyStop` | in | bool | — | — | safety interlock model | binding | Latched simulated emergency stop. |
| `safety-zone-1.GateClosed` | in | bool | — | — | safety interlock model | binding | Access gate closed. |
| `safety-zone-1.GateLocked` | in | bool | — | — | safety interlock model | binding | Gate locked; unlocks on E-stop. |
| `safety-zone-1.LightCurtainClear` | in | bool | — | — | safety interlock model | binding | Light curtain clear. |
| `safety-zone-1.ScannerClear` | in | bool | — | — | safety interlock model | binding | Safety scanner clear. |
| `safety-zone-1.SafetyReset` | out | bool | — | — | operator/instructor signal | binding → `SafetyInterlockModel.reset` | Accepted only when gate closed, curtain clear and scanner clear. |
| `safety-zone-1.SafetyHealthy` | in | bool | — | — | safety interlock model | binding | All of the above conditions are healthy. |

Total: **43 signals** (14 robot, 14 CNC, 8 conveyor, 7 safety).

## Command routing

`SingleConveyorCellLayout.vue` routes Start/Stop/Reset through `robot-1.*` command signals and the pallet workflow routes door/cycle commands through `cnc-1.DoorCommand` / `cnc-1.CycleStart`. Rejected commands are reported on the dashboard (`Command rejected — …`) and the machine state is unchanged. Pause/Resume remain direct workflow controls because they are not part of the declared controller I/O contract.

## Engineering diagnostics

- WebGL-free harness: open the simulator with `?view=signals` to render the inspector with a deterministic mid-cycle state.
- In the running cell, enable **Expert diagnostics** and open the **I/O signals** dock panel.
- The inspector shows id, equipment, direction, type, value, unit, quality, source, timestamp, coverage diagnostics, and filters by equipment and free-text search. Signal engineering names stay canonical (untranslated); only the panel chrome is localized (EN/FR/DE).

## Safety scope

All signals, faults and interlocks are simulated training data. They are not certified safety functions and never replace a safety PLC, certified interlock, risk assessment or real collision system.
