# Modbus TCP adapter

Status: **implemented** (S35). The Modbus boundary is an optional infrastructure adapter, disabled
by default, that speaks a real Modbus TCP client transport over the public protocol. It is **based
on the public Modbus Application Protocol specification and the Modbus Messaging on TCP/IP
Implementation Guide**; it does **not** claim conformance certification, OEM emulation or vendor
compatibility.

Modbus is an integration boundary only. The internal orchestration bus remains REST + SignalR and
server-side domain services. Protocol addresses, unit ids and byte order are configuration data and
never leave `Fabrik3D.Infrastructure/Modbus`: values are translated into the protocol-independent
signal mirror before Domain or Server can see them. This adapter targets PLC training labs and
low-cost hardware: a trainee connects a real or simulated PLC to the virtual cell while the core
domain stays protocol-free.

## ADR: client (polling master) only

**Context.** Fabrik3D must be able to observe and, when explicitly enabled, command a PLC in a
training or commissioning cell. Modbus TCP defines both a client (master, initiates requests) and a
server (slave, answers requests). Implementing a Fabrik3D-side server endpoint would make Fabrik3D
the owner of authoritative register maps and would compete with the real PLC for the fieldbus.

**Decision.** S35 implements the **client/polling master role only**. `ModbusConnector` opens one TCP
connection to a configured host, polls declared points and optionally writes declared, allow-listed
points. A Fabrik3D Modbus server/slave endpoint is explicitly **not** implemented. If a server role
is ever added it must live in a separate class and a separate configuration section
(`ModbusServer`) so the two roles never share state.

**Consequences.** The adapter is a consumer of a PLC, which matches the training/commissioning
scenarios and keeps the server as the orchestration source of truth. Clients cannot command Fabrik3D
over Modbus directly; any future external-controller authority/handover is S36. Because only one
transport role exists, there is no role ambiguity in configuration or lifecycle.

## Architecture boundary

```text
PLC / Modbus TCP fixture
        │  MBAP frame + PDU (function codes 1/2/3/4/5/6/15/16)
        ▼
ModbusTcpProtocolClient (Fabrik3D.Infrastructure/Modbus)   <- knows addresses and function codes
        │  ushort[] / bool[]
        ▼
ModbusCodec (pure)                                          <- byte order, word order, scaling, bits
        │  IndustrialSignalUpdate (domain vocabulary)
        ▼
SignalMirrorStore (Fabrik3D.Infrastructure/Signals)         <- protocol-free sample store
        │
        ├── GET /api/connectors/modbus   (health/diagnostics DTO)
        └── server consumers in later sprints (arbitration, HMI live monitor)
```

- `Fabrik3D.Domain/Signals/IndustrialSignal.cs` defines the schema-1.0 vocabulary (quality, source,
  origin, direction, data type) with no protocol reference.
- `Fabrik3D.Contracts/DTOs/ConnectorStatusDto.cs` is the shared, additive REST contract introduced
  in S33; the Modbus endpoint reuses it unchanged.
- `Fabrik3D.Modbus.Fixture` is a purpose-built Modbus TCP **server used only by tests**. The
  repository does not depend on an OCI image, proprietary desktop software or a hand-started
  process: the tests start a real TCP Modbus server in-process on a loopback port (see
  [Fixture and tests](#fixture-and-tests)).

## Implementation choice: no third-party Modbus package

The connector uses a **small, self-contained Modbus TCP implementation** (`ModbusTcpProtocolClient`,
~330 lines) instead of an external NuGet Modbus package. The choice is deliberate and allowed by the
sprint brief: an additional unaudited transport dependency was not justified for the tiny wire
subset Fabrik3D needs (MBAP framing and eight function codes), and a self-contained client keeps the
address/endianness transforms pure and deterministically testable. The implementation follows the
public specification only and adds no conformance claim. It is a client only, adds no Modbus RTU
serial support, and never guesses a byte order.

## Configuration

`Modbus` configuration section (`Fabrik3D.Server/appsettings.json` ships it disabled and read-only):

| Setting | Default | Meaning |
|---|---|---|
| `Enabled` | `false` | Master switch. Disabled is inert and warning-free. |
| `Host` | `127.0.0.1` | PLC host name or IP address. |
| `Port` | `502` | TCP port (the Modbus TCP default). |
| `UnitId` | `1` | Default unit (slave) identifier (1..247); a point may override it. |
| `ConnectTimeoutMilliseconds` | `5000` | TCP connect timeout. |
| `RequestTimeoutMilliseconds` | `2000` | Per-request response timeout. A timeout drops the connection so the stream cannot desynchronize. |
| `PollIntervalMilliseconds` | `1000` | Nominal poll interval; cycles never overlap. |
| `ReconnectDelaySeconds` / `MaxReconnectDelaySeconds` | `5` / `60` | Bounded exponential reconnect backoff. |
| `StaleAfterMilliseconds` | `10000` | Default read-time staleness threshold; a point may override it. |
| `AllowWrites` | `false` | Writes require the connector enabled **and** this flag **and** the point writable **and** an exact allow-list match. |
| `WriteAllowList` | `[]` | Exact-match signal ids that may be written. |
| `AddressConvention` | `zero-based` | `zero-based` or `one-based`; a point may override it. The convention is always stated in configuration, never inferred. |
| `Points` | `[]` | Explicit signal → Modbus point mappings. |

Example (writes still disabled by the master flags):

```json
"Modbus": {
  "Enabled": false,
  "Host": "127.0.0.1",
  "Port": 502,
  "UnitId": 1,
  "PollIntervalMilliseconds": 500,
  "StaleAfterMilliseconds": 5000,
  "AllowWrites": false,
  "AddressConvention": "zero-based",
  "Points": [
    { "SignalId": "robot-1.Speed", "Area": "holding-register", "Address": 10, "DataType": "float", "Width": 32, "ByteOrder": "big-endian", "WordOrder": "high-word-first", "Direction": "read" },
    { "SignalId": "robot-1.Counter", "Area": "holding-register", "Address": 0, "DataType": "uint", "Width": 16, "ByteOrder": "big-endian", "Direction": "read" },
    { "SignalId": "robot-1.Running", "Area": "coil", "Address": 0, "DataType": "bool", "Width": 1, "Direction": "read" },
    { "SignalId": "robot-1.Start", "Area": "coil", "Address": 1, "DataType": "bool", "Width": 1, "Direction": "read-write" }
  ],
  "WriteAllowList": ["robot-1.Start"]
}
```

## Versioned mapping schema

The mapping is data, never executable code. `ModbusMapping.SchemaVersion` is `1.0`. Migration
follows the same deterministic pattern as S31 cell files: add a `schemaVersion` field and migrate
older files explicitly; there is no implicit format change. Address-convention migrations must be
documented explicitly because a one-based file shifted to a zero-based default would move every
point by one address.

Each point declares:

| Field | Meaning |
|---|---|
| `SignalId` | Stable domain signal id, convention `<equipmentId>.<name>`. |
| `Area` | `coil`, `discrete-input`, `input-register` or `holding-register`. |
| `Address` | Address in the effective address convention. |
| `AddressConvention` | Optional per-point `zero-based`/`one-based` override. |
| `UnitId` | Optional per-point unit/slave id override (1..247). |
| `DataType` | `bool`, `int`, `uint` or `float`. Signedness is `int`/`uint`; it is never inferred from the wire. |
| `Width` | `1`/`16`/`32`/`64` depending on the type (see width policy). |
| `ByteOrder` | `big-endian` (spec order) or `little-endian`; **required** for register areas. |
| `WordOrder` | `high-word-first` or `low-word-first`; **required** for widths &gt; 16. |
| `BitIndex` | `0..15` for a boolean mapped into a register; required for boolean register points. |
| `Scale` / `Offset` | Engineering conversion (see below). |
| `EngineeringUnit` | Reported on the signal definition. |
| `Direction` | `read`, `write` or `read-write`. Input registers and discrete inputs are read-only in Modbus. |
| `PollIntervalMilliseconds` | Optional per-point poll interval. |
| `StaleAfterMilliseconds` | Optional per-point staleness override. |
| `Min` / `Max` | Optional engineering range enforced by the signal mirror. |

### Width policy

- `bool`: width `1` for `coil`/`discrete-input`; width `16` **plus** a `BitIndex` for a boolean carried
  by one bit of a register.
- `int` / `uint`: width `16` or `32`. 64-bit integers are rejected by validation because the
  schema-1.0 mirror declares 16/32-bit integer ranges; use a float64 or split the value explicitly.
- `float`: width `32` (IEEE-754 single) or `64` (IEEE-754 double).

### Validation rules

`ModbusMapping.Validate` rejects, before any network traffic and with a stable actionable code:

| Code | Trigger |
|---|---|
| `invalid-host` / `invalid-port` / `invalid-unit-id` | invalid connector endpoint or unit id |
| `invalid-connect-timeout` / `invalid-request-timeout` / `invalid-poll-interval` / `invalid-stale-after` / `invalid-reconnect-policy` | invalid timing settings |
| `invalid-address-convention` | convention is not `zero-based`/`one-based` |
| `invalid-area`, `invalid-data-type`, `invalid-direction` | unknown vocabulary value |
| `missing-endianness` / `missing-word-order` | register point without an explicit byte/word order |
| `invalid-width` | width not allowed for the type/area |
| `invalid-bit-index` | missing/out-of-range bit index on a boolean register, or a bit index on a non-register point |
| `invalid-scale` / `invalid-offset` / `invalid-range` | non-finite or zero gain, non-finite offset, `Min > Max` |
| `invalid-address` | address outside `0..65535` for the span and declared convention |
| `read-only-area-write` | write direction on `discrete-input` or `input-register` |
| `duplicate-signal-id` | the same signal id mapped twice |
| `overlapping-point` | two points on the same area/unit whose address spans overlap, unless they are distinct bits of the same 16-bit register |

## Endianness rules (never inferred)

The wire itself is always big-endian per 16-bit register. Two explicit axes describe vendor layouts:

- **Byte order** — order of the two bytes inside each 16-bit register: `big-endian` (high byte
  first, spec order) or `little-endian` (byte-swapped).
- **Word order** — order of the 16-bit words that make up a multi-word value: `high-word-first` (the
  register at the lowest address holds the most significant word) or `low-word-first`.

For a 32-bit value whose big-endian bytes are `A B C D` (`A` = most significant), the four
combinations are:

| Byte order | Word order | Wire layout |
|---|---|---|
| `big-endian` | `high-word-first` | `ABCD` (standard) |
| `little-endian` | `high-word-first` | `BADC` |
| `big-endian` | `low-word-first` | `CDAB` |
| `little-endian` | `low-word-first` | `DCBA` |

A missing byte order (register areas) or missing word order (width &gt; 16) is a validation error;
the codec never guesses. For a boolean mapped to a register bit, the bit index addresses the
register's numeric value (bit 0 = LSB), so byte/word order do not apply to the bit itself.

## Scaling and signedness

- Read direction: `engineering = raw * Scale + Offset`.
- Write direction: the inverse `raw = (engineering - Offset) / Scale`, rounded away from zero for
  integer points and range-checked against the declared width.
- `Scale` must be finite and non-zero; `Offset` must be finite. When no scaling is configured
  (`Scale = 1`, `Offset = 0`) integer points decode to their exact integer value; scaled points
  decode to floating point.
- Signedness is declared through `DataType` (`int` = two's complement, `uint` = unsigned) and is
  never inferred from the high bit.

## Signal mirror integration

- On start (when enabled and valid) each point is projected into an immutable
  `IndustrialSignalDefinition`: `read` → input-to-controller, `write` → output-from-controller,
  `read-write` → internal; `Writable` follows the direction; the unit/range/staleness are attached.
- Reads are applied as `observed` samples with `origin: controller` and the connector clock
  timestamp. Definitions and staleness reuse the S31/S33 schema-1.0 semantics.
- A successful write is mirrored as a `commanded` sample and the write is observed by the fixture.
- A point failure (illegal address, timeout) never fabricates a value: the connector records the
  error and the mirror derives `stale` at read time from the configured policy.

## Write policy (fail closed)

A write succeeds only when **all** of the following hold:

1. the connector is enabled (`Modbus:Enabled=true`);
2. writes are enabled (`Modbus:AllowWrites=true`);
3. the point declares a write-capable direction;
4. the point's area is writable (`coil` or `holding-register`);
5. the signal id is exactly present in `Modbus:WriteAllowList`;
6. the TCP connection is open.

Anything else returns a structured rejection (`connector-disabled`, `writes-disabled`,
`unknown-signal`, `not-writable-signal`, `not-allow-listed`, `not-connected`, `invalid-value`,
`write-rejected:<modbus-exception>`, `write-timeout`, `write-failed:<type>`). No broadcast (unit 0)
writes are issued and unit ids outside 1..247 are rejected by validation. A boolean register write
performs a read-modify-write so the other bits of the shared register are preserved.

## Health and diagnostics

`GET /api/connectors/modbus` returns the shared `ConnectorStatusDto` surface:

| DTO field | Modbus meaning |
|---|---|
| `State` | `Disabled`/`Connecting`/`Connected`/`Degraded`/`Error` |
| `Endpoint` | `host:port` when enabled, otherwise `null` |
| `LastError` | last connection or configuration error |
| `ReconnectCount` | reconnect attempts |
| `MonitoredItemCount` | number of configured points |
| `NotificationsReceived` | completed poll cycles |
| `UpdatesAccepted` / `UpdatesRejected` | mirror updates accepted/rejected |
| `WriteAttempts` / `WritesAccepted` / `WritesRejected` | write-policy counters |

`ModbusConnectorStatus` additionally exposes per-point diagnostics (reads, read errors, writes,
write errors, last latency, last error), `IllegalAddresses`, `Timeouts`, `LastPollLatencyMs` and
`AveragePollLatencyMs`. The endpoint is read-only and never performs a protocol write.

## Failure and degraded-mode behaviour

- **PLC unavailable**: `Error` (never connected) or `Degraded` (lost after connecting), with bounded
  exponential backoff. Values become `stale` under the configured policy and are never fabricated.
- **Illegal address**: counted per point (`illegal-data-address`); the connector continues with the
  remaining points.
- **Timeout**: counted and the connection is dropped (a missing response desynchronizes the stream),
  then the connector reconnects with backoff.
- **Disconnected PLC**: writes fail visibly (`not-connected`); there is no silent fallback to another
  authority.
- **Shutdown**: polling is cancelled, the socket is closed and the connector reports `Disabled`.

## Fixture and tests

`Fabrik3D.Modbus.Fixture` is a minimal, independent Modbus TCP **server** (real loopback TCP, MBAP
framing, function codes 1/2/3/4/5/6/15/16, register/coil banks, illegal-address and no-response
modes) used only by tests. It is explicitly not a product and is the documented alternative allowed
by the sprint brief because no reliable public OCI fixture image was adopted; it mirrors the
`Fabrik3D.OpcUa.Fixture` precedent. Docker is **not** required for the Modbus tests.

```powershell
# Modbus unit + integration tests (no proprietary software, no Docker)
dotnet test Fabrik3D/Fabrik3D.Server.Tests/Fabrik3D.Server.Tests.csproj --filter "FullyQualifiedName~Modbus"
```

Covered: codec byte/word order for all four layouts, signed/unsigned, float32/float64, boolean bit
mapping, scaling and its inverse, range checks, address conventions, every validation rule; and live
tests for connect, address-level reads of all four areas, illegal-address handling, request
timeouts, reconnect after a PLC outage, the fail-closed write policy (coil, register, boolean
register read-modify-write, non-allow-listed and read-only rejections) and graceful shutdown.

The tests are deterministic: no wall-clock randomness, no hand-started server, fixed register banks.
Environment: local Windows/.NET 8 CI-class machine.

## Recorded measurements

- Poll cycle latency (7 mapped points, 100 ms interval, in-process fixture): the integration test
  prints `lastCycleLatencyMs` and `averageCycleLatencyMs`; measured values were well below the
  configured interval (single-digit milliseconds per cycle on the reference machine). Both numbers
  are recorded in the test run output rather than asserted as capacity guarantees.
- Poll cycles never overlap: a single loop reads each due point, then waits out the remainder of the
  interval, so no unbounded queue can accumulate.

## Limitations and deliberate deferrals

- No Modbus RTU/serial support and no Modbus ASCII.
- No Fabrik3D-side Modbus server/slave endpoint (see the ADR).
- No vendor register-map assumptions: every map is user configuration.
- Control-authority arbitration and handover are provided by S36 (see
  [`CONTROL_AUTHORITY.md`](./CONTROL_AUTHORITY.md)); this adapter remains authority-agnostic and
  never decides authority itself. A Modbus owner is a handover precondition: it must be `Connected`.
- The mapping studio and live monitor are provided by S37 (see
  [`SIGNAL_MAPPING_STUDIO.md`](./SIGNAL_MAPPING_STUDIO.md)): a mapping file can carry any
  S35 point map, and an explicit apply projects it into `ModbusOptions`. Runtime hot-swap of a
  running connector is still a deliberate restart.
- No fault injection over the fieldbus (S38).
- No conformance certification; the implementation is based on the public specification only.
- The mapping is validated at startup and is not silently hot-swapped; an explicit restart applies a
  new mapping version, so semantics cannot change mid-cycle.
