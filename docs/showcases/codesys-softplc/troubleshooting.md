# Troubleshooting

Diagnose from the connector status and the signal monitor first; the showcase adds no custom
diagnostics of its own.

## Connector stays `Disabled`

- `Modbus.Enabled` is `false` (the default). Set it to `true` and restart. A mapping apply does not
  enable a disabled connector — it reports `connector-disabled` and applies nothing.

## Connector is `Error` at startup

- The configuration failed validation. `ModbusMapping.Validate` returns stable diagnostics such as
  `invalid-host`, `invalid-port`, `invalid-unit-id`, `ambiguous-endianness` or `overlapping-point`.
  Fix the named point; address/byte order is never guessed.

## Connector is `Degraded` / `Error` during the run

- The PLC is not responding (powered off, wrong IP/port, or the Modbus server is not listening).
  Confirm the endpoint and that a real TCP connection to port 502 (or your configured port) succeeds.
  The connector reconnects with bounded backoff and never silently falls back to another authority.

## `Ready` never becomes 1

- The cell is only ready with no stop and no latched fault. Clear `Stop` (`HR0.1`) and pulse `Reset`
  (`HR0.2`). Also confirm the points are reaching the mirror: the status bit is written to `HR10.0`
  only after a successful connector write.

## Start does nothing

- Start requires both `Start=1` (`HR0.0`) **and** `PalletPresent=1` (`HR1.0`). Without a pallet the cell
  stays ready and does not move. Check that the photo-eye bit is set in the PLC.

## Actuator does not reach the target

- The setpoint is `HR2 CycleTarget`. The fixture ramps at most 25 units per tick; a target is only
  reached after the minimum phase time. If `SensorPosition` (`HR12`) does not track `ActuatorPosition`
  (`HR11`), the feedback write is being refused — see below.

## Writes are refused

- `AllowWrites = false`: outbound writes are disabled by default.
- The signal is not in `WriteAllowList`: the allow-list is an **exact** match, no wildcards. Missing
  entries are refused with `not-allow-listed`.
- The signal is a read-only input (`direction: read`) or its area is read-only: refused with
  `not-writable-signal`.
- The connector is not connected yet: refused with `not-connected`.
- `GET /api/connectors/modbus` exposes per-point `Writes`/`WriteErrors` and the aggregate
  `WritesAccepted`/`WritesRejected` counters.

## Values look stale or wrong

- Quality/timestamp are mapped explicitly. A value without a fresh valid timestamp is surfaced as
  stale, never as good. Check `StaleAfterMilliseconds` and the poll interval.
- Byte/word order is explicit per point; if a 32-bit value reads wrong, verify `byteOrder` and
  `wordOrder` rather than changing the PLC. This showcase uses only 16-bit values.

## Authority is `degraded` and commands are refused

- The lease expired or the owner became unhealthy. This is the documented S36 degraded mode
  (`authority_lost`). It never silently reverts to another authority. Resume by explicitly releasing
  or re-acquiring the lease as the operator.

## The mapping was changed but nothing changed

- A validated mapping is not hot-swapped; the connector loads it on restart, so semantics cannot change
  mid-cycle. Restart the server after an intentional mapping change.
