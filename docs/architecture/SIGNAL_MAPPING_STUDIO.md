# Signal mapping studio (S37)

Status: **implemented** for the simulator engineering surface and the orchestrator API.
Mapping files are versioned, validated, non-executable data. Connector write policy and
control authority remain server-side; the studio never writes to a protocol itself.

## Purpose

S33–S36 can move values across OPC UA, MQTT and Modbus, but the internal↔external mapping was
hand-edited configuration. S37 adds a validated, inspectable, exportable mapping artifact and a
technician-facing diagnostics workflow:

- a versioned mapping-file schema (`1.0`);
- deterministic serialize/parse with human-readable, row-addressable diagnostics;
- conflict detection;
- import/export, migration from the earlier `0.9` shape;
- a studio UI (mapping list, validation panel, editor, live signal monitor);
- an explicit, all-or-nothing apply against connector configuration.

## Where the code lives

| Concern | Location |
|---|---|
| Mapping schema, validation, conflicts, migration, deterministic serialization, apply planning, monitor model | `Fabrik3D/fabrik3d.client/src/mapping/` |
| Studio UI (engineering surface) | `Fabrik3D/fabrik3d.client/src/components/MappingStudio.vue`, `MappingStudioPage.vue` |
| Route | simulator `?view=mapping-studio`, reachable from the editing (engineering) mode only |
| Server validation/serialization | `Fabrik3D/Fabrik3D.Domain/Mapping/SignalMappingRules.cs` |
| Server API + store | `Fabrik3D/Fabrik3D.Server/Controllers/MappingsController.cs`, `Services/SignalMapping*.cs` |
| Projection to connectors | `Fabrik3D/Fabrik3D.Infrastructure/Mapping/SignalMappingProjection.cs` |
| Contract DTOs | `Fabrik3D/Fabrik3D.Contracts/DTOs/SignalMappingDtos.cs` |
| Reference-cell sample | `docs/architecture/samples/reference-cell-mapping.json` |

The simulator signal catalog (S32) remains authoritative for internal signals. Some validation
rules are intentionally duplicated in C# so the server never trusts a client payload; the client
is authoritative for signal existence, the server re-checks every rule before an apply.

## Mapping-file schema 1.0

A mapping file is deterministic JSON with no timestamps and a fixed key order.

```json
{
  "schemaVersion": "1.0",
  "id": "reference-cell-mapping",
  "name": "Reference cell signal mapping",
  "entries": [
    {
      "id": "opcua-cnc-spindle-speed",
      "name": "CNC spindle speed to OPC UA",
      "protocol": "opcua",
      "internalSignalId": "cnc-1.SpindleSpeed",
      "equipmentId": "cnc-1",
      "direction": "read",
      "dataType": "float",
      "scale": 1,
      "offset": 0,
      "unit": "rpm",
      "enabled": true,
      "target": { "nodeId": "ns=2;s=Fabrik3D/CNC/SpindleSpeed" }
    }
  ]
}
```

- `protocol` is `opcua`, `mqtt` or `modbus`.
- `direction` is `read`, `write` or `read-write`.
- `dataType` is `bool`, `int`, `uint`, `float`, `enum` or `string`.
- Engineering value = `raw * scale + offset`.
- `target` carries protocol-specific wire data only.

### Protocol examples

OPC UA:

```json
{ "nodeId": "ns=2;s=Fabrik3D/Robot/Start" }
```

MQTT:

```json
{ "topic": "fabrik3d/v1/cells/<cell>/equipment/conveyor-1/telemetry", "payloadField": "ActualSpeed" }
```

Modbus (explicit endianness, scaling, signedness and address convention — never guessed):

```json
{
  "area": "holding-register",
  "address": 10,
  "width": 32,
  "byteOrder": "big-endian",
  "wordOrder": "high-word-first",
  "signed": false,
  "unitId": 1,
  "addressConvention": "zero-based"
}
```

Areas: `coil`, `discrete-input`, `input-register`, `holding-register`. Widths: `bool` = 1
(bit area) or 16 with `bitIndex` (register bit); `int`/`uint` = 16 or 32; `float` = 32 or 64.

## Validation rules

Errors block apply; warnings do not.

| Code | Severity | Meaning |
|---|---|---|
| `unsupported-version` | error | Schema version is not `1.0`. |
| `unsupported-protocol` | error | Protocol is not `opcua`, `mqtt` or `modbus`. |
| `unknown-signal` | error | Internal signal is not declared in the signal catalog. |
| `unwritable-write-direction` | error | `write`/`read-write` on a read-only signal. |
| `duplicate-write-target` | error | Two writers share the same external target. |
| `ambiguous-endianness` | error | Register mapping omits `byteOrder`. |
| `missing-word-order` | error | Multi-word mapping omits `wordOrder`. |
| `invalid-width` / `invalid-bit-index` | error | Width/bit combination is not supported. |
| `path-traversal-rejected` | error | Target field looks like a filesystem path, traversal or `file:` URI. |
| `executable-payload-rejected` / `unknown-field` | error | Field implies executable behaviour. |
| `file-too-large` | error | Imported file exceeds the 512 KiB bound. |
| `equipment-mismatch` / `data-type-mismatch` | warning | Metadata differs from the catalog signal. |
| `incompatible-signal-mapping` | warning | One signal mapped to incompatible targets. |
| `migrated-from-0.9` / `endianness-defaulted` | warning | Migration outcome needing review. |

## Conflicts

Conflict detection is deterministic and independent of validation:

- two entries that both write the same external target → `duplicate-write-target` (error);
- the same internal signal mapped to different protocol/direction/datatype combinations →
  `incompatible-signal-mapping` (warning).

The studio validation panel shows every diagnostic, and clicking a diagnostic jumps to the
offending row. Destructive removal names the mapping and its target before confirmation.

## Apply and reload

Apply is explicit and all-or-nothing:

1. the document is validated against the internal signal catalog;
2. every protocol used by an enabled entry must have an enabled connector;
3. if any check fails, **nothing** is activated and the running connector keeps its previous
   validated mapping;
4. if all checks pass, the active mapping is recorded (audited) for the connectors to load on
   their next reload. The apply endpoint never opens a socket or writes a protocol value.

The studio reports separate pending, success and failure states. Connector health and quality
are shown per row; an unhealthy connector marks external values **stale** rather than
fabricating a value.

The server store is in-memory and versioned with optimistic concurrency and an audit trail. It
is an engineering store, not the final persistence layer; authorization uses the S42
`Fabrik3D.Engineer` server policy (see [`IDENTITY_AND_RBAC.md`](./IDENTITY_AND_RBAC.md)).

## Security model

- Mapping files are untrusted input: size-bounded (512 KiB), schema-validated, and rejected on
  unknown fields.
- Mapping files cannot execute code, reference scripts/expressions, traverse paths or name
  absolute filesystem paths / `file:` URIs.
- Write mappings still require the connector's own explicit write enable plus exact allow-list;
  the studio never bypasses server policy.
- Mapping apply is a privileged engineering action guarded by the `Fabrik3D.Engineer` server
  policy (S42); the earlier `X-Operator-Id` placeholder is removed. It is not publicly exposed by
  default.
- Diagnostics never include connector credentials or secrets.

## Engineer/operator boundary

The studio is an engineering surface reached from the simulator's editing (engineering) view
(`?view=mapping-studio`). The operator HMI has no mapping controls and is unchanged by S37.

## Testing

- Unit: `Fabrik3D/fabrik3d.client/src/mapping/*.test.ts` (schema, validation, conflicts,
  migration, deterministic round-trip, direction/writability, endianness, security).
- Components: `MappingStudio.test.ts` (list, validation panel + jump-to-row, apply feedback,
  destructive confirmation, live-monitor filtering, EN/FR/DE chrome).
- E2E: `e2e/mapping-studio.spec.ts` (import → conflict → fix → apply → monitor → export).
- Visual: `e2e/mapping-studio-visual.spec.ts` at 1280×800 and 1366×768.
- Server unit: `Fabrik3D.Server.Tests/SignalMapping*Tests.cs`.
- Connector integration: `SignalMappingModbusFixtureTests` projects a mapping document into
  Modbus options and observes external→internal reads and internal→external writes against the
  in-process Modbus TCP fixture.

## Performance

- `src/mapping/performance.test.ts` validates and serializes 500 mappings and asserts the work
  stays below a recorded, deliberately generous 2 s bound; the measured duration is printed in the
  run output.
- The studio is a separate engineering route, not an overlay on the 3D scene. The live monitor
  reads the signal registry snapshot through Vue reactivity rather than polling on a timer, so it
  cannot consume the simulator frame budget while a cell scene is running.

## Not in this sprint

Signal fault overlays and advanced diagnostics (S38), historian/time travel (S40/S41) and
authentication/RBAC hardening (S42).
