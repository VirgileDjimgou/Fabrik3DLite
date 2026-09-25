# S32 - Equipment I/O binding and reference signal catalog

## Outcome

The CNC-tending reference cell becomes genuinely signal-driven: robot, CNC, conveyor, and safety equipment declare a vendor-neutral I/O catalog, and those signals actually drive runtime behavior through explicit bindings. Existing deterministic workflows remain compatible through adapters, and an engineering-only signal inspector exposes live values without overloading the operator HMI.

## Motivation

S31 delivered the signal model and registry. Without binding, it is metadata. S32 turns the reference cell into the credible baseline that S33-S41 reference for OPC UA, MQTT, Modbus, external control, fault injection, historian, and time travel.

## Current-state assumptions to verify

- S31 merged: `src/signals/` exists with `SignalRegistry`, `SignalDefinition`, `SignalSample`, `signalDefinitionsForEquipment`, and `EquipmentDefinition.signals` is optional.
- The reference cell runtime is `src/components/SingleConveyorCellLayout.vue`, driven by `src/simulation/PalletMachiningWorkflow.ts`, `src/simulation/RobotController.ts`, `src/components/LargeCNCMachine.vue`, `src/components/PalletConveyorFeed.vue`, and `src/safety/*`.
- `src/equipment/fixtures/singleConveyorCell.ts` holds the reference definitions; legacy adapters live in `src/equipment/legacyAdapters.ts`.
- The `equipmentRegistry` created in `SingleConveyorCellLayout.vue` is currently unused and can host signal metadata without changing rendering.
- `src/services/simulatorOrchestrationBridge.ts` is the only backend boundary; no signal data is currently sent to the server.

## Scope

- Declare a realistic vendor-neutral signal catalog in the reference definitions:
  - Robot: `ServoOn`, `Ready`, `ProgramRunning`, `AtHome`, `AtPick`, `AtMachine`, `Start`, `Stop`, `Reset`, `GripperOpen`, `GripperClosed`, `PayloadDetected`, `Fault`, `ProtectiveStop`.
  - CNC: `Ready`, `DoorOpen`, `DoorClosed`, `DoorCommand`, `FixtureClamped`, `PartPresent`, `CycleStart`, `CycleRunning`, `CycleComplete`, `SpindleRunning`, `SpindleSpeed`, `FeedRate`, `Fault`, `EmergencyStop`.
  - Conveyor: `RunCommand`, `Running`, `SpeedReference`, `ActualSpeed`, `MotorFault`, `PhotoeyeIn`, `PhotoeyeStation`, `EncoderPulse` (position indicator).
  - Safety: `EmergencyStop`, `GateClosed`, `GateLocked`, `LightCurtainClear`, `ScannerClear`, `SafetyReset`, `SafetyHealthy`.
- Add signal bindings that actually affect runtime behavior:
  - `Conveyor.RunCommand` starts/stops pallet flow; `Conveyor.Running` and `Conveyor.ActualSpeed` reflect it.
  - `Conveyor.PhotoeyeIn`/`PhotoeyeStation` derive from real pallet positions in `ConveyorPalletFlow`/`PalletConveyorFeed`.
  - `CNC.DoorCommand` drives the door animation and `DoorOpen`/`DoorClosed`; `CycleStart` starts machining only when ready and door closed; `CycleComplete`, `SpindleRunning`, `SpindleSpeed`, `Fault` track the CNC state machine.
  - `Robot.Start`/`Stop`/`Reset` control `RobotController`/workflow execution; `ProgramRunning`, `AtHome`, `AtPick`, `AtMachine`, `GripperOpen`, `GripperClosed`, `PayloadDetected` track real phases and gripper/payload state.
  - Safety signals derive from the existing `SafetyGuardSystem`/motion-safety state; `SafetyReset` re-arms simulated safety conditions when it is safe to do so.
- Update the `SingleConveyorCellLayout.vue` wiring so an injectable `SignalRegistry` is created per scene load, equipment runtimes publish their signals each update, and signal-driven commands feed back into the same workflow paths currently used by UI actions.
- Ensure no signal is UI-only or fake: every declared signal must have a runtime writer and/or reader, and the mapping must be listed in the catalog documentation table with its driver.
- Provide an engineering-only signal inspector (`?view=signals` harness plus a dockable panel in engineering/developer surfaces) showing id, equipment, direction, type, value, unit, quality, source, origin, and timestamp, with filtering by equipment and text search. Do not add it to the operator HMI routes.
- Keep the pallet workflow, task reporting, alarms, scenarios, and fault lab outcomes deterministic and unchanged. Where a workflow command previously came from a UI button, route it through the signal (UI writes the command signal), preserving behavior.
- Document each signal's purpose, direction, unit, and driver in `docs/architecture/REFERENCE_SIGNAL_CATALOG.md`; update `docs/architecture/INDUSTRIAL_SIGNAL_CORE.md` with the binding pattern.

## Non-goals

- No protocol connector work (S33+).
- No server-side signal telemetry, historian, or twin-source arbitration across processes (S33+).
- No new industrial scenes; deepen the existing reference cell only.
- No changes to operator HMI workflows or alarms.
- Do not model hundreds of placeholder tags; target tens to low hundreds of meaningful signals with real drivers.

## Architecture boundaries

- Runtime binding is owned by the simulator runtime host; signal declarations are metadata owned by equipment definitions.
- UI components may publish commands through the signal registry but must not bypass workflow/safety guards.
- Safety signals remain simulated diagnostics; they never claim certified safety behavior.
- The registry is per scene/session and disposed with the scene to avoid cross-scene leakage.

## Domain and data model changes

- Equipment definitions gain the declared signal catalog from S31 (populated now).
- Add a small `SignalBinding` contract in `src/signals/binding.ts` (or `src/simulation/signalBindings.ts`) describing `read` and optional `write` functions per signal id, so bindings stay framework-independent and testable.
- No persisted schema changes.

## Backend changes

None required. The session state payload may optionally include a bounded signal summary later; that belongs to S33+ and must not be invented here.

## Simulator changes

- `src/equipment/fixtures/singleConveyorCell.ts`: add the full catalog with units and ranges.
- `src/signals/binding.ts`: binding runtime that samples equipment runtimes into registry updates on each tick and dispatches command writes back to runtime adapters.
- `src/components/SingleConveyorCellLayout.vue`: create the registry and binding runtime per scene, publish on animation frame, dispose on unload, and route existing UI commands through command signals where a declared signal exists.
- `src/components/LargeCNCMachine.vue`, `PalletConveyorFeed.vue`, `ConveyorBelt.vue`: expose the state needed for truthful signal derivation (door, spindle, sensor, motor states) without changing visuals.
- New `SignalInspectorPanel.vue` and `?view=signals` harness.
- Existing `PalletMachiningWorkflow` gains signal-aware transitions only where required to keep commands and signals consistent; its phase order and timing must not regress.

## HMI and UX changes

- No operator HMI changes. The signal inspector is an engineering surface, reachable from the simulator engineering/developer view only.
- Inspector must be usable at 1280x800 desktop and 1366x768 laptop, keyboard reachable, with EN/FR/DE labels for its own chrome (signal engineering names stay canonical and untranslated).

## 3D and visual requirements

- Visual states that already exist (CNC door, spindle, conveyor motion, stack light, safety devices) must now derive from signals where a signal exists, without changing the approved look.
- No new visual assets required. Existing visual regression baselines must not change except where an intentional, documented state-driven correction is made.
- Frame budget: binding overhead must stay below 1 ms per frame for the reference cell on the documented reference machine.

## Protocol and security requirements

- Command signals are writable only through explicit registry `update` calls with the correct origin; read-only signals reject writes.
- No network protocol is involved; no endpoint, certificate, or credential appears.
- Signal strings remain constrained data.

## Backward compatibility

- Existing workflow behavior and scenario outcomes remain identical when driven through the new signal path.
- Offline local demo mode keeps working with signals entirely in-memory.
- Existing scene presets that do not bind signals continue to load.

## Migration requirements

- No persisted migration. Signal catalog additions are additive.
- If `SignalRegistry` evolves, S31 migration rules apply.

## Failure and degraded-mode behavior

- A missing runtime writer for a declared signal must surface as a visible engineering diagnostic, never as a silently fabricated value.
- If a signal-driven command is rejected (permissions, invalid value), the UI action reports failure and the workflow state remains unchanged.
- Scene unload disposes bindings and clears the registry; a reload must not retain stale values.

## Testing strategy

- Unit tests for each binding: command signal write changes runtime state; runtime state change updates the corresponding signal.
- Deterministic workflow-equivalence test: run the reference cell cycle with UI commands vs signal commands and assert identical phase sequences and outcomes.
- Signal catalog validation test: every declared signal has at least one writer or reader binding; no duplicate ids; units and ranges valid.
- Component tests for `SignalInspectorPanel` (filtering, rendering quality/staleness, EN/FR/DE chrome).
- Visual regression for the reference cell and the signals harness.
- Performance test for per-frame binding overhead and registry snapshot cost.

## Performance requirements

- Binding tick under 1 ms for the full catalog on the reference scene.
- No per-frame allocations beyond bounded, reused buffers where practical; snapshot generation at most twice per second in the inspector.
- Existing frame-time and draw-call budgets must not regress measurably.

## Security considerations

- No new attack surface; signal commands are local and validated.
- Inspector is read-only plus the same command actions already available in engineering surfaces.

## Documentation changes

- Add `docs/architecture/REFERENCE_SIGNAL_CATALOG.md` with the complete signal table (id, direction, type, unit, range, driver, consumer, behavior).
- Update `docs/architecture/INDUSTRIAL_SIGNAL_CORE.md` (binding pattern, lifecycle, disposal).
- Update `README.md` to state accurately that the reference cell is signal-driven and list the catalog size.
- Update `docs/architecture/ORCHESTRATION.md` only if the signal path touches session reporting (it should not in S32).

## Acceptance criteria

1. Every signal in the four equipment catalogs has a documented runtime driver and appears in `REFERENCE_SIGNAL_CATALOG.md`.
2. Writing `Conveyor.RunCommand=false` stops pallet flow and `Running`/`ActualSpeed` follow within one simulation tick; writing `true` resumes it.
3. `CNC.DoorCommand` and `CNC.CycleStart` drive the same door/machining transitions as today, with `DoorOpen`/`DoorClosed`/`CycleRunning`/`CycleComplete` consistent with the visual state at all times.
4. `Robot.Start`/`Stop`/`Reset` and the home/pick/machine/gripper/payload signals track the actual `PalletMachiningWorkflow` phase within one tick.
5. Safety signals reflect the simulated safety state; `SafetyReset` only clears conditions that are safe to clear.
6. The workflow-equivalence test proves identical phase outcomes for UI-driven and signal-driven execution.
7. Signal inspector shows live values with quality/source/timestamp, filters by equipment, and is absent from operator HMI routes.
8. Type-check, tests, build, visual regression, HMI gates, backend build/tests, and contracts check pass.

## Evidence expected for completion

```text
npm --prefix Fabrik3D/fabrik3d.client run type-check (pass)
npm --prefix Fabrik3D/fabrik3d.client run test (N passed, including binding + equivalence tests)
npm --prefix Fabrik3D/fabrik3d.client run build (pass)
npm --prefix Fabrik3D/fabrik3d.client run test:visual (N passed)
npm --prefix Fabrik3D/fabrik3d.hmi run type-check/test/build (pass)
dotnet build Fabrik3D/Fabrik3D.slnx (0 warnings 0 errors)
dotnet test Fabrik3D/Fabrik3D.slnx (N passed)
npm run contracts:check (pass)
```

Include the measured binding overhead and catalog size in the evidence.

## Rollback and failure containment

Revert the catalog, binding runtime, and inspector; the reference cell returns to its S30 behavior because the existing workflow paths remain authoritative. No persisted data or contract changes are involved beyond additive signal metadata.

## Follow-up items that must not leak into this sprint

- OPC UA/MQTT/Modbus transports (S33-S35).
- Control-authority model and external takeover (S36).
- Mapping studio, fault overlays, historian, time travel (S37-S41).
