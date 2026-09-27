# Siemens profile I/O map (OPC UA)

The machine-readable map is [`io-map.json`](./io-map.json) (mapping schema `1.0`). It is validated by
`SiemensPlcsimProfileTests.Committed_siemens_profile_io_map_is_a_valid_versioned_mapping_document`
against the same rules the server applies before a mapping is applied, and it is projected into the
real OPC UA connector by `SignalMappingProjection.BuildOpcUaOptions` in the automated substitute. The
documented map and the exercised map are therefore identical.

## Conventions

- **Internal signals:** the shared Fabrik3D reference-cell vocabulary, equipment `showcase.cell`
  (`showcase.cell.*`). Only the external target differs from the S46 Modbus profile, so both profiles
  exercise the same signal model and the same deterministic cell state machine.
- **External target:** a Siemens S7-1500 OPC UA node id in the TIA Portal namespace (index `3`) with
  quoted DB syntax, for example `ns=3;s="Fabrik3D_Cell_DB"."Start"`.
- **Direction is relative to the Fabrik3D controller boundary:**
  - `read` = PLC output consumed by Fabrik3D (PLC → cell), written by the PLC program;
  - `write` = Fabrik3D output consumed by the PLC (cell → PLC), written by Fabrik3D.
- **Scaling:** the profile transmits normalized `0..100` engineering units directly; every entry has
  `scale = 1`, `offset = 0` and states its data type. No implicit conversion is applied, and no
  scaling is inferred.
- **Node ids are data, not code.** They live only in this mapping file and inside the OPC UA adapter;
  no node id leaks into the domain or the simulator.

## Data block layout

The profile expects one non-optimized, OPC UA-accessible data block named `Fabrik3D_Cell_DB`:

```text
Fabrik3D_Cell_DB
├── Start                 Bool    PLC → Fabrik3D
├── Stop                  Bool    PLC → Fabrik3D
├── Reset                 Bool    PLC → Fabrik3D
├── PalletPresent         Bool    PLC → Fabrik3D
├── CycleTarget           Int     PLC → Fabrik3D   (0..100)
├── Ready                 Bool    Fabrik3D → PLC
├── Running               Bool    Fabrik3D → PLC
├── RobotCycleComplete    Bool    Fabrik3D → PLC
├── CncCycleComplete      Bool    Fabrik3D → PLC
├── CycleComplete         Bool    Fabrik3D → PLC
├── Fault                 Bool    Fabrik3D → PLC
├── ActuatorPosition      Int     Fabrik3D → PLC   (0..100)
├── SensorPosition        Int     Fabrik3D → PLC   (0..100)   ← closed-loop feedback
└── PartsCompleted        Int     Fabrik3D → PLC   (counter)
```

`Int` may be `DInt`; the value is transmitted as an OPC UA integer either way. `SensorPosition`
mirrors `ActuatorPosition` in the educational model (a perfect position sensor); a real cell would
carry encoder/sensor noise.

## PLC outputs consumed by Fabrik3D (`direction: read`)

| Signal id | Type | Siemens DB tag | Node id | Meaning |
| --- | --- | --- | --- | --- |
| `showcase.cell.Start` | bool | `Fabrik3D_Cell_DB.Start` | `ns=3;s="Fabrik3D_Cell_DB"."Start"` | Start request; acted on only while the cell is ready and a pallet is present. |
| `showcase.cell.Stop` | bool | `Fabrik3D_Cell_DB.Stop` | `ns=3;s="Fabrik3D_Cell_DB"."Stop"` | Stop request; latches a fault if the robot/CNC cycle is active. |
| `showcase.cell.Reset` | bool | `Fabrik3D_Cell_DB.Reset` | `ns=3;s="Fabrik3D_Cell_DB"."Reset"` | Clears a latched fault or completion state. |
| `showcase.cell.PalletPresent` | bool | `Fabrik3D_Cell_DB.PalletPresent` | `ns=3;s="Fabrik3D_Cell_DB"."PalletPresent"` | Pallet-detection photo-eye; start is refused until true. |
| `showcase.cell.CycleTarget` | uint | `Fabrik3D_Cell_DB.CycleTarget` | `ns=3;s="Fabrik3D_Cell_DB"."CycleTarget"` | Normalized robot transfer-axis setpoint, `0..100`. |

## Fabrik3D outputs consumed by the PLC (`direction: write`)

These nine signals are also the **exact write allow-list** for the profile.

| Signal id | Type | Siemens DB tag | Node id | Meaning |
| --- | --- | --- | --- | --- |
| `showcase.cell.Ready` | bool | `Fabrik3D_Cell_DB.Ready` | `ns=3;s="Fabrik3D_Cell_DB"."Ready"` | Permissives satisfied (no stop, no latched fault). |
| `showcase.cell.Running` | bool | `Fabrik3D_Cell_DB.Running` | `ns=3;s="Fabrik3D_Cell_DB"."Running"` | True during robot and CNC phases. |
| `showcase.cell.RobotCycleComplete` | bool | `Fabrik3D_Cell_DB.RobotCycleComplete` | `ns=3;s="Fabrik3D_Cell_DB"."RobotCycleComplete"` | Latched when the robot finished the transfer. |
| `showcase.cell.CncCycleComplete` | bool | `Fabrik3D_Cell_DB.CncCycleComplete` | `ns=3;s="Fabrik3D_Cell_DB"."CncCycleComplete"` | Latched when the virtual CNC cycle finished. |
| `showcase.cell.CycleComplete` | bool | `Fabrik3D_Cell_DB.CycleComplete` | `ns=3;s="Fabrik3D_Cell_DB"."CycleComplete"` | Latched when the whole pallet cycle completed. |
| `showcase.cell.Fault` | bool | `Fabrik3D_Cell_DB.Fault` | `ns=3;s="Fabrik3D_Cell_DB"."Fault"` | Latched on stop during a cycle; cleared by reset. |
| `showcase.cell.ActuatorPosition` | uint | `Fabrik3D_Cell_DB.ActuatorPosition` | `ns=3;s="Fabrik3D_Cell_DB"."ActuatorPosition"` | Normalized transfer-axis position reached (`0..100`). |
| `showcase.cell.SensorPosition` | uint | `Fabrik3D_Cell_DB.SensorPosition` | `ns=3;s="Fabrik3D_Cell_DB"."SensorPosition"` | Virtual position sensor measurement returned to the controller (closed-loop feedback). |
| `showcase.cell.PartsCompleted` | uint | `Fabrik3D_Cell_DB.PartsCompleted` | `ns=3;s="Fabrik3D_Cell_DB"."PartsCompleted"` | Finished pallets produced. |

## Node / address validation

- Validation is the S37 mapping validator: a missing `nodeId`, an unknown internal signal, a
  `write` direction on a read-only signal, ambiguous scaling or duplicate write targets are rejected
  **before** any connector is started.
- Each positive `nodeId` here is a real Siemens-style OPC UA node id. A node that does not exist on
  the live server is a **diagnostics** condition (the OPC UA connector logs it and monitors only the
  valid nodes), not a crash — this is covered by the negative test in
  [`evidence.md`](./evidence.md).
- The CI fixture serves the same symbolic identifiers (for example
  `Fabrik3D_Cell_DB.Start`) in its own namespace. The substitute rewrites only the namespace index;
  identifier, direction, type and scaling are never changed.

## Notes

- Every signal id follows `<equipmentId>.<name>`; the profile equipment is `showcase.cell`.
- The mapping is data only: it never executes code.
- Changing the map is a versioned operation (see
  [`SIGNAL_MAPPING_STUDIO.md`](../../architecture/SIGNAL_MAPPING_STUDIO.md)); a mapping is validated
  before it is applied and is not silently hot-swapped.
