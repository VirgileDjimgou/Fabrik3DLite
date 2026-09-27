# Signal mapping guide

Status: verified against the 1.0 build. Mapping files are **data only**; they never bypass connector
write policy and never become a live integration by themselves.

The mapping studio connects internal Fabrik3D signals to OPC UA, MQTT or Modbus TCP targets. It is an
**engineering** surface (policy `Engineer`). Operators do not map signals.

## Open the mapping studio

Open `?view=mapping-studio`. The studio is also linked from the simulator's *Edit cell* mode. The
matching server surface is `/api/mappings` (list, get, validate, upsert, delete, apply, audit).

## Mapping file schema (`1.0`)

A mapping file is a versioned JSON document (`schemaVersion: "1.0"`) with an `id`, a `name`, an
optional `description`, and an `entries` array. Each entry connects one internal signal to one
protocol target:

| Field | Meaning |
| --- | --- |
| `id` | Stable entry id. |
| `protocol` | `opcua`, `mqtt` or `modbus`. |
| `internalSignalId` / `equipmentId` | The internal signal and its owner. |
| `direction` | `read` (device → twin) or `write` (twin → device). |
| `dataType` | `bool`, integer or float type of the mapped value. |
| `scale`, `offset`, `unit` | Engineering conversion and unit. |
| `enabled` | Whether the entry participates in apply. |
| `target` | Protocol-specific address. |

Protocol targets are explicit and never guessed:

- **OPC UA** — `nodeId` (for example `ns=2;s=Fabrik3D/CNC/SpindleSpeed`).
- **MQTT** — `topic`, optional `payloadField`, optional `retain` (default false).
- **Modbus TCP** — `area` (coil, discrete-input, input-register, holding-register), `address`,
  `width`, optional `bitIndex`, `byteOrder`, `wordOrder` and `addressConvention`.

For Modbus, ambiguous byte/word order, invalid widths/addresses/scales and unsafe overlaps are
**rejected**, not resolved by a guess. Address convention is explicit.

## Workflow

1. **Load or import** a mapping file, or start from the reference mapping
   (`docs/architecture/samples/reference-cell-mapping.json`).
2. **Validate**. The studio validates every row against the real signal catalog: unknown signals,
   type mismatches, non-writable targets used for writes, invalid addresses and conflicts are
   reported with a row-addressable diagnostic. You can jump to the offending row.
3. **Resolve conflicts.** Two entries that would write the same target, or overlap in a way that
   cannot be unambiguous, are surfaced before anything is applied.
4. **Apply** — an explicit, confirm-guarded, all-or-nothing operation. Apply reports pending →
   success/failure; a failed apply changes nothing.
5. **Monitor** — the live monitor filters by equipment or protocol and shows the observed values,
   quality and timestamps flowing through the mapping.
6. **Export** a deterministic file for Git review. Export refuses to serialize a mapping with
   validation errors.

## Security model

- Mapping files cannot enable a connector or enable writes. A write still requires the connector to
  be enabled **and** `AllowWrites` **and** an exact allow-list match **and** a writable signal/point.
  Misconfiguration fails closed with an explicit reason and emits no protocol write.
- During replay and while an external controller owns a scope, writes are blocked.
- Certificate trust is never silently bypassed by a mapping.
- The `/api/mappings` surface is authorized and audited; the interim `X-Operator-Id` placeholder was
  removed in S42.

## The reference sample

`docs/samples/fabrik3d-1.0-reference-project/reference-cell-mapping.json` (also
`docs/architecture/samples/reference-cell-mapping.json`) maps the reference cell across all three
protocols with read and write directions. It references only signals the reference cell really
declares, and it is covered by an automated integrity test.

## Troubleshooting

- **"Unknown signal"** — the `internalSignalId` is not declared by the configured cell. Check the
  signal inspector (`?view=signals`).
- **Write rejected at runtime** — the connector, `AllowWrites` or the allow-list is not configured,
  or the signal is not writable. This is fail-closed behaviour, not a bug.
- **Modbus ambiguity rejected** — specify byte/word order (and bit index for bit targets)
  explicitly.

## Related documents

- [Signal mapping studio architecture](../architecture/SIGNAL_MAPPING_STUDIO.md)
- [Industrial signal core](../architecture/INDUSTRIAL_SIGNAL_CORE.md)
- [OPC UA adapter](../architecture/OPC_UA_ADAPTER.md)
- [MQTT transport](../architecture/MQTT_SHOWCASE.md)
- [Modbus TCP adapter](../architecture/MODBUS_TCP_ADAPTER.md)
- [External controller guide](EXTERNAL_CONTROLLER_GUIDE.md)
