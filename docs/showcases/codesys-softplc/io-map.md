# Showcase I/O map

The machine-readable map is [`io-map.json`](./io-map.json) (mapping schema `1.0`). It is validated by
`ReferenceCellShowcaseTests.Committed_showcase_io_map_is_a_valid_versioned_mapping_document` against
the same rules the server applies before a mapping is applied, and it is projected into the Modbus
connector by `SignalMappingProjection.BuildModbusOptions` in the automated fixture. The documented map
and the exercised map are therefore identical.

## Conventions

- **Register layout:** all points are **zero-based holding registers**. The PLC (Modbus server/slave)
  owns the register bank; Fabrik3D is the polling client (master).
- **Unit id:** `1`.
- **Bit order:** booleans live in bit positions `0..5` of their register; unrelated bits are preserved
  because a boolean register write is a read-modify-write.
- **Endianness:** stated explicitly on every register point (`big-endian`); no byte or word order is
  ever inferred (16-bit values occupy exactly one register).
- **Direction is relative to the Fabrik3D controller boundary:**
  - `read` = controller output consumed by Fabrik3D (PLC → cell);
  - `write` = Fabrik3D output consumed by the controller (cell → PLC).

## Controller outputs consumed by Fabrik3D (`direction: read`)

| Signal id | Type | Address | Bit | Meaning |
| --- | --- | --- | --- | --- |
| `showcase.cell.Start` | bool | `HR0` | 0 | Start request; acted on only while the cell is ready and a pallet is present. |
| `showcase.cell.Stop` | bool | `HR0` | 1 | Stop request; latches a fault if the robot/CNC cycle is active. |
| `showcase.cell.Reset` | bool | `HR0` | 2 | Clears a latched fault or completion state. |
| `showcase.cell.PalletPresent` | bool | `HR1` | 0 | Simulated pallet-detection photo-eye; start is refused until true. |
| `showcase.cell.CycleTarget` | uint16 | `HR2` | — | Normalized robot transfer-axis setpoint, `0..100`. |

## Fabrik3D outputs consumed by the controller (`direction: write`)

These nine signals are also the **exact write allow-list** for the showcase.

| Signal id | Type | Address | Bit | Meaning |
| --- | --- | --- | --- | --- |
| `showcase.cell.Ready` | bool | `HR10` | 0 | Permissives satisfied (no stop, no latched fault). |
| `showcase.cell.Running` | bool | `HR10` | 1 | True during robot and CNC phases. |
| `showcase.cell.RobotCycleComplete` | bool | `HR10` | 2 | Latched when the robot finished the transfer. |
| `showcase.cell.CncCycleComplete` | bool | `HR10` | 3 | Latched when the virtual CNC cycle finished. |
| `showcase.cell.CycleComplete` | bool | `HR10` | 4 | Latched when the whole pallet cycle completed. |
| `showcase.cell.Fault` | bool | `HR10` | 5 | Latched on stop during a cycle; cleared by reset. |
| `showcase.cell.ActuatorPosition` | uint16 | `HR11` | — | Normalized transfer-axis position reached by the actuator (`0..100`). |
| `showcase.cell.SensorPosition` | uint16 | `HR12` | — | Virtual position sensor measurement returned to the controller (the closed-loop feedback). |
| `showcase.cell.PartsCompleted` | uint16 | `HR13` | — | Finished pallets produced. |

## Register bank summary

```text
HR0   command bits    [ Start | Stop | Reset | … ]
HR1   sensor input    [ PalletPresent | … ]
HR2   setpoint        CycleTarget (0..100)
HR10  status bits     [ Ready | Running | RobotDone | CncDone | CycleDone | Fault ]
HR11  actuator position (0..100)
HR12  sensor position   (0..100)   ← closed-loop feedback
HR13  parts completed
```

## Notes

- Every signal id follows `<equipmentId>.<name>`; the showcase equipment is `showcase.cell`.
- The mapping is data only: it never executes code, and no Modbus address, area or bit leaks into the
  core domain.
- Changing the map is a versioned operation (see
  [`SIGNAL_MAPPING_STUDIO.md`](../../architecture/SIGNAL_MAPPING_STUDIO.md)); a mapping is validated
  before it is applied and is not silently hot-swapped.
