# Machine-state sequence

This is the deterministic sequence the Siemens-profile cell follows. It is the **same sequence and
the same state machine** as the S46 Modbus showcase; only the transport differs. It is asserted
step by step in
`SiemensPlcsimProfileTests.OpcUa_fixture_plc_drives_the_siemens_profile_sequence_closed_loop`.

Notation: `DB.tag` = `Fabrik3D_Cell_DB` tag. All positions are normalized `0..100` engineering units
(documented for the profile, not SI).

| # | Step | PLC outputs (PLC → cell) | Cell behavior | Cell feedback (cell → PLC) |
| --- | --- | --- | --- | --- |
| 1 | **Permissives** | no stop, no fault | idle → ready | `DB.Ready = 1`, `DB.Running = 0` |
| 2 | **Start without pallet** | `DB.Start = 1`, `DB.PalletPresent = 0` | start refused; no motion | still `DB.Ready = 1`, `DB.Running = 0` |
| 3 | **Load / pallet detection** | `DB.PalletPresent = 1`, `DB.CycleTarget = 100` | ready → robot; actuator ramps toward target | `DB.Running = 1`, `DB.ActuatorPosition`, `DB.SensorPosition` follow |
| 4 | **Transfer** | start stays requested, setpoint stays 100 | ramp holds until target reached and the minimum phase time elapsed | `DB.RobotCycleComplete = 1`, actuator/sensor = `100` |
| 5 | **Machining** | (no new command) | virtual CNC cycle runs for its fixed phase time | `DB.CncCycleComplete = 1` |
| 6 | **Unload / complete** | (no new command) | cycle completes, part counted | `DB.CycleComplete = 1`, `DB.PartsCompleted = 1`, `DB.Running = 0` |
| 7 | **Stop during a cycle** | `DB.Stop = 1` | latches fault; actuator holds; no motion | `DB.Fault = 1`, `DB.Running = 0`, actuator/sensor unchanged |
| 8 | **Reset** | `DB.Stop = 0`, `DB.Reset = 1` | fault cleared; idle → ready | `DB.Fault = 0`, all completion latches cleared |
| 9 | **PLC stop / disconnect** | (PLC CPU STOP or link loss) | connector degrades; authority expires to `degraded`; commands refused with `authority_lost`; no actuator effect and no silent takeover | cell outputs hold; HMI shows degraded authority |
| 10 | **Explicit release** | owner releases the lease | scope returns to `available`; implicit local simulation is allowed again | authority indicator returns to local |

## Determinism notes

- Each PLC output change is observed by Fabrik3D through the OPC UA subscription before the cell
  ticks, so the sequence is not sensitive to wall-clock timing (the tests poll the signal mirror).
- The cell advances at most one phase transition per tick and ramps the actuator in bounded steps
  (25 units/tick), so repeated runs produce identical positions.
- A denied tick (no authority) performs **no** actuator change and **no** protocol write.
- The OPC UA connector may receive an observed echo of a value it just wrote. When that observation is
  older than the local commanded write it is rejected as `stale-timestamp`; the commanded value stays
  authoritative and feedback never regresses. This is expected connector behavior, recorded in
  [`evidence.md`](./evidence.md).

## Faults and degraded mode

- **Stop during a cycle** sets `Fault` and drops `Running`; the actuator holds its last position. Only
  `Reset` (with `Stop` released) clears it.
- **Bad quality** (`Bad`/`Uncertain` OPC UA status) is propagated as bad, with the last known value
  preserved; it is never coerced to `Good`.
- **Loss of the PLC** is handled by S36: the connector reports `Degraded`/`Error`, the lease expires
  into the documented `degraded` state, and every subsequent command is refused with `authority_lost`.
  No other authority silently takes over; recovery is an explicit operator action (release or
  re-acquire).
- **Write refused** (not allow-listed, read-only tag, or connector disabled) is reported by the
  connector and the cell records a rejected write; it never mutates actuator state.
