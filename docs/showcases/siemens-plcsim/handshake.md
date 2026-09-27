# Handshake

The handshake is the S36 control-authority protocol, applied to the Siemens profile scope
(`siemens-cell`). It is identical to the Modbus S46 showcase by design: authority and failure
semantics are shared, never special-cased per vendor.

```text
  PLC (S7-1500 / PLCSIM)                         Fabrik3D server
  ───────────────────────                        ───────────────
  1. connect OPC UA session (secure endpoint) ─▶ OPC UA connector subscribes the node map
  2. acquire ExternalController authority     ─▶ authority held (owner: siemens-plc, kind: connector)
  3. read Ready / Running from DB tags        ◀─ Fabrik3D publishes observed feedback
  4. assert Start while PalletPresent = 1     ─▶ cell leaves Ready and ramps the actuator
  5. read ActuatorPosition / SensorPosition   ◀─ closed-loop feedback
  6. read *CycleComplete / PartsCompleted     ◀─ latched completion signals
  7. Stop = 1 during a cycle                  ─▶ Fault latched, actuator holds, no motion
  8. Stop = 0; Reset = 1                      ─▶ fault cleared, idle/ready again
  9. session/lease lost                       ─▶ connector Degraded, authority Degraded, writes fail closed
 10. owner releases lease                      ─▶ scope Available, implicit local simulation allowed
```

## Steps in detail

| # | Direction | Action | Requirement |
| --- | --- | --- | --- |
| 1 | PLC → Fabrik3D | Open the OPC UA session (`opc.tcp`, `Basic256Sha256` preferred). | Fabrik3D connector enabled; the PLC certificate trusted in the Fabrik3D trust store. |
| 2 | PLC → Fabrik3D | `POST /api/control-authority/{scope}/acquire` with mode `ExternalController`, owner `siemens-plc`, kind `connector`, a bounded lease. | The scope must be available; a conflicting owner is rejected with `authority_conflict`. |
| 3 | Fabrik3D → PLC | Fabrik3D writes `Ready`/`Running` and the completion/fault tags; the PLC reads them. | Writes enabled and those nine node ids exactly allow-listed. |
| 4 | PLC → Fabrik3D | Raise `Start` while `PalletPresent = 1`. | The cell acts only on a rising edge while ready and pallet-present; otherwise start is refused silently (no fault). |
| 5 | Fabrik3D → PLC | Fabrik3D writes `ActuatorPosition`/`SensorPosition`. | Closed-loop feedback; the PLC uses `SensorPosition` to confirm arrival. |
| 6 | Fabrik3D → PLC | Fabrik3D writes `RobotCycleComplete`, `CncCycleComplete`, `CycleComplete`, `PartsCompleted`. | Latched until reset; the PLC must not treat them as momentary. |
| 7 | PLC → Fabrik3D | Raise `Stop` during robot/CNC. | Latches `Fault`, drops `Running`, holds the actuator. |
| 8 | PLC → Fabrik3D | Drop `Stop`, raise `Reset`. | Clears the fault and completion latches, returns to idle/ready. |
| 9 | — | The PLC stops responding or the lease expires. | Connector reports `Degraded`/`Error`; authority becomes `degraded`; every command is refused with `authority_lost`; no actuator effect and **no implicit takeover**. |
| 10 | PLC → Fabrik3D | `POST /api/control-authority/{scope}/release` as the owner. | Scope returns to `available`; implicit local simulation is allowed again. |

## Permissives and guaranteed refusals

- **Start without a pallet:** a no-op; the cell stays `Ready` with `Running = 0`.
- **Local simulation while the PLC holds authority:** refused with `authority_conflict`.
- **Command after controller loss:** refused with `authority_lost`, even though the connector may
  still be reconnecting; the actuator holds its last position.
- **Write to a non-allow-listed or read-only tag:** refused by the connector (`not-allow-listed` /
  `not-writable-signal`) before any network traffic; the cell records a rejected write and never
  mutates actuator state.

Recovery from step 9 is an explicit operator action: re-acquire the lease after the PLC is back, or
release it to return to local simulation. There is no automatic resumption during a cycle.
