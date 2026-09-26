# Expected state sequence

This is the deterministic sequence the showcase cell follows. It is the same sequence the automated
fixture asserts step by step in
`ReferenceCellShowcaseTests.Fixture_controller_drives_the_showcase_sequence_closed_loop`.

Notation: `HRn.b` = holding register `n`, bit `b`. All positions are normalized `0..100` engineering
units (documented for the fixture, not SI).

| # | Step | Controller outputs (PLC → cell) | Cell behavior | Cell feedback (cell → PLC) |
| --- | --- | --- | --- | --- |
| 1 | **Permissives** | no stop, no fault | idle → ready | `HR10.0 Ready = 1`, `Running = 0` |
| 2 | **Start without pallet** | `HR0.0 Start = 1`, `HR1.0 PalletPresent = 0` | start refused; no motion | still `Ready = 1`, `Running = 0` |
| 3 | **Pallet detection** | `HR1.0 PalletPresent = 1`, `HR2 CycleTarget = 100` | ready → robot; actuator ramps toward target | `Running = 1`, `HR11 ActuatorPosition`, `HR12 SensorPosition` follow |
| 4 | **Robot cycle** | start stays requested, setpoint stays 100 | ramp holds until target reached and the minimum phase time elapsed | `HR10.2 RobotCycleComplete = 1`, actuator/sensor = `100` |
| 5 | **CNC cycle** | (no new command) | virtual CNC cycle runs for its fixed phase time | `HR10.3 CncCycleComplete = 1` |
| 6 | **Completion** | (no new command) | cycle completes, part counted | `HR10.4 CycleComplete = 1`, `HR13 PartsCompleted = 1`, `Running = 0` |
| 7 | **Stop during a cycle** | `HR0.1 Stop = 1` | latches fault; actuator holds; no motion | `HR10.5 Fault = 1`, `Running = 0`, actuator/sensor unchanged |
| 8 | **Reset** | `HR0.1 Stop = 0`, `HR0.2 Reset = 1` | fault cleared; idle | `Fault = 0`, all completion latches cleared |
| 9 | **Controller loss** | (PLC stops responding) | connector degrades; authority expires to `degraded`; commands are refused with `authority_lost`; no actuator effect and no silent takeover | cell outputs hold; HMI shows degraded authority |
| 10 | **Explicit release** | owner releases the lease | scope returns to `available`; implicit local simulation is allowed again | authority indicator returns to local |

## Determinism notes

- Each controller-output change is observed by Fabrik3D through the connector poll loop before the
  cell ticks, so the sequence is not sensitive to wall-clock timing.
- The cell advances at most one phase transition per tick and ramps the actuator in bounded steps
  (25 units/tick), so repeated runs produce identical positions.
- A denied tick (no authority) performs **no** actuator change and **no** protocol write.

## Faults and degraded mode

- **Stop during a cycle** sets `Fault` and drops `Running`; the actuator holds its last position. Only
  `Reset` (with `Stop` released) clears it.
- **Loss of the controller** is handled by S36: the connector reports `Degraded`/`Error`, the lease
  expires into the documented `degraded` state, and every subsequent command is refused with
  `authority_lost`. No other authority silently takes over; recovery is an explicit operator action
  (release or re-acquire).
- **Write refused** (not allow-listed, read-only signal, or connector disabled) is reported by the
  connector and the cell records a rejected write; it never mutates actuator state.
