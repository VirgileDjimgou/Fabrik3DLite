# Optional OPC UA adapter

Status: **implemented** (S33). The OPC UA boundary is an infrastructure adapter, disabled by default, that speaks a real OPC UA client transport. It is aligned with selected OPC UA concepts; it does **not** claim IEC 62541 certification or vendor compatibility. MQTT (S34) and Modbus (S35) are still **planned**; nothing in this document applies to them.

The educational sample namespace `ns=2;s=Fabrik3D/{Equipment}/{Field}` remains the example mapping. Protocol node ids are configuration data and never leave this adapter: values are translated into the protocol-independent signal mirror before the Domain or Server can see them.

## Architecture boundary

```text
OPC UA server (fixture or real PLC)
        │  node id + value + status + timestamp
        ▼
OpcUaConnector (Fabrik3D.Infrastructure/OpcUa)        <- knows Opc.Ua types and node ids
        │  IndustrialSignalUpdate (domain vocabulary)
        ▼
SignalMirrorStore (Fabrik3D.Infrastructure/Signals)    <- protocol-free sample store
        │
        ├── GET /api/connectors/opcua        (health/diagnostics DTO)
        └── server consumers in later sprints (arbitration, HMI live monitor)
```

- `Fabrik3D.Domain/Signals/IndustrialSignal.cs` defines the schema-1.0 vocabulary (quality, source, origin, direction, data type) with no protocol reference.
- `Fabrik3D.Contracts/DTOs/IndustrialSignalDto.cs` and `ConnectorStatusDto.cs` are the additive REST contracts; `openapi.json` and the generated TypeScript contracts are kept in sync with `npm run contracts:generate`.
- `Fabrik3D.OpcUa.Fixture` is a purpose-built OPC UA **server used only by tests**. The repository does not depend on an OCI image, a proprietary desktop stack or a hand-started broker: the tests start the fixture in-process on a loopback port and speak a real OPC UA binary protocol to it.

## Configuration

`OpcUa` configuration section (`Fabrik3D.Server/appsettings.json` ships it disabled and read-only):

| Setting | Default | Meaning |
|---|---|---|
| `Enabled` | `false` | Master switch. Disabled is inert and warning-free. |
| `Endpoint` | `opc.tcp://localhost:4840` | Endpoint URL; must be a valid `opc.tcp://` URI when enabled. |
| `SecurityPolicy` | `Basic256Sha256` | `None` selects an unsecured endpoint; any other value requires a matching secure endpoint. |
| `ApplicationName` | `Fabrik3D.OpcUa` | Client application/certificate subject name. |
| `CertificateTrustStore` | `./data/opcua-trust` | Directory for the client certificate, trusted and rejected stores. Never commit certificates or keys. |
| `UserName` / `Password` | unset | Optional identity; anonymous is used when unset. Provide secrets from environment/secret stores only. |
| `AutoAcceptUntrustedCertificates` | `false` | Development-only escape hatch. Logs a prominent warning and is never a production setting. |
| `ReconnectDelaySeconds` / `MaxReconnectDelaySeconds` | `5` / `60` | Bounded exponential reconnect backoff. |
| `SamplingIntervalMilliseconds` / `PublishingIntervalMilliseconds` | `1000` / `1000` | Subscription and monitored-item intervals. |
| `OperationTimeoutMilliseconds` / `SessionTimeoutMilliseconds` | `15000` / `60000` | Session timeouts. |
| `StaleAfterMilliseconds` | `10000` | Default read-time staleness threshold; a node-map entry may override it. |
| `AllowWrites` | `false` | Writes require connector enabled **and** this flag **and** an exact allow-list match. |
| `WriteAllowList` | `[]` | Exact-match protocol node ids that may be written. |
| `NodeMap` | `[]` | `SignalId` → `NodeId` mapping plus the signal definition (direction, data type, unit, range, enum values, writable, staleness). |

Example (writes still disabled by the master flags):

```json
{
  "OpcUa": {
    "Enabled": true,
    "Endpoint": "opc.tcp://127.0.0.1:4840/Fabrik3D",
    "SecurityPolicy": "None",
    "CertificateTrustStore": "./data/opcua-trust",
    "AllowWrites": false,
    "NodeMap": [
      { "SignalId": "robot-1.Speed", "NodeId": "ns=2;s=Fabrik3D/Robot/Speed", "Direction": "input-to-controller", "DataType": "float", "EngineeringUnit": "m/s" },
      { "SignalId": "robot-1.Start", "NodeId": "ns=2;s=Fabrik3D/Robot/Start", "Direction": "output-from-controller", "DataType": "bool", "Writable": true }
    ],
    "WriteAllowList": ["ns=2;s=Fabrik3D/Robot/Start"]
  }
}
```

## Signal mirror (schema 1.0)

The server mirror implements the same schema documented in [INDUSTRIAL_SIGNAL_CORE.md](INDUSTRIAL_SIGNAL_CORE.md). Intentional representational differences: definitions come from the transport node map instead of the equipment SDK, values are CLR objects instead of JSON primitives, and the store is in-memory (no persistence yet; historian is S40/S41).

Arbitration rules (rejected updates never mutate stored state):

| Reason | Trigger |
|---|---|
| `unknown-signal` | update for a signal id that was never registered |
| `invalid-timestamp` | missing/default timestamp |
| `stale-timestamp` | timestamp older than the stored sample |
| `lower-priority-source` | equal timestamp and lower source priority (`commanded < replay < simulated < observed`) |
| `not-writable` | `commanded` update for a `Writable=false` definition |
| `type-mismatch` / `out-of-range` / `invalid-enum` | value does not match the declared type, range or enum |

- Quality is `good`, `stale`, `bad`, `uncertain` or `invalid` and is never upgraded silently.
- `stale` is derived at read time; the stored sample is not modified.
- An OPC UA status-change notification can carry a `Bad`/`Uncertain` status without a value. The connector then preserves the **last known value** and stores the degraded quality, so a bad status is never coerced to good and never crashes the subscription.
- Snapshots are stable-sorted by signal id, versioned with `SchemaVersion = "1.0"` and generated from an injectable clock.

## Health, diagnostics and the write path

Connector states: `Disabled`, `Connecting`, `Connected`, `Degraded` (was connected, currently retrying), `Error` (never connected or fatal configuration). Diagnostics counters: reconnect count, monitored-item count, notifications received, updates accepted/rejected, write attempts accepted/rejected, last error.

`GET /api/connectors/opcua` returns `ConnectorStatusDto`. The endpoint is read-only and never performs a protocol write.

Write path: connector enabled, `AllowWrites=true`, the node id is exactly allow-listed, the mapped signal is declared writable, and the session is connected. Anything else fails closed with a structured reason (`connector-disabled`, `writes-disabled`, `unknown-signal`, `not-writable-signal`, `not-allow-listed`, `not-connected`, `invalid-node-id`, `write-rejected:*`, `write-failed:*`). A successful write is mirrored with `source: commanded`, `origin: controller`.

Reconnect: bounded exponential backoff between `ReconnectDelaySeconds` and `MaxReconnectDelaySeconds`, never a busy loop; invalid node ids are reported as diagnostics and do not stop the connector.

## Fixture and tests

`Fabrik3D.OpcUa.Fixture` is a minimal .NET 8 OPC UA server (real TCP transport, binary encoding, sessions, subscriptions, monitored items) used only by tests. It is explicitly **not** a product, is not deployed, and is the documented alternative allowed by the sprint brief because no reliable public OCI fixture image was adopted. The fixture exposes plain read/write variables in `urn:fabrik3d:fixture` and supports both `None` and `SignAndEncrypt` endpoint policies.

```powershell
# all OPC UA unit + integration tests (no proprietary software required)
dotnet test Fabrik3D/Fabrik3D.Server.Tests/Fabrik3D.Server.Tests.csproj --filter "FullyQualifiedName~OpcUa"
```

Covered: option validation; node-map validation; write policy and allow-list rejection; quality/timestamp mapping; read-time staleness; connect; subscription delivery; bad/uncertain quality; invalid node ids; prohibited and allow-listed writes observed by the fixture; untrusted-certificate refusal and explicit development trust; reconnect after fixture restart; graceful shutdown; mirror throughput and sustained subscription delivery. Docker is only needed for the existing MongoDB integration tests, not for the OPC UA fixture.

Recorded measurements (2026-09-25, local Windows/NET 8 CI-class machine):

- `SignalMirrorStore`: 20,000 deterministic updates applied in ~16 ms (~1.25M updates/s), single signal.
- Subscription burst: 100 fixture updates over ~1 s delivered 10+ notifications with accepted mirror updates while sampling/publishing at 50/100 ms.

## Limitations and deliberate deferrals

- No control-authority arbitration or external-controller mode (S36); writes are operator/server-initiated only.
- No mapping studio or live monitor UI (S37).
- The mirror is in-memory; persistence, retention and history are S40/S41.
- One endpoint per connector instance; no redundancy or load balancing.
- User identity supports anonymous or username/password; token/certificate user identities are not implemented.
- `StartAsync` reports configuration errors through health/diagnostics; it does not fail the process.
- No claim of IEC 62541 certification, product compliance or OEM emulation.

## ADR: signal-mirror schema and transport boundary

**Context.** Equipment simulation is client-side and speaks the S31 TypeScript signal core. Real controllers connect through server-side transports a browser cannot open. Both sides must share one signal vocabulary, and the first transport must not leak protocol types into the domain.

**Decision.** S33 adds a C# mirror in `Fabrik3D.Domain/Signals` + `Fabrik3D.Infrastructure/Signals` that mirrors the schema-1.0 semantics of `INDUSTRIAL_SIGNAL_CORE.md`, and a real `OpcUaConnector` that translates node values into mirror updates. The TypeScript document stays the contract of record; the C# mirror references it and is covered by drift tests (wire-name round trips, identical arbitration/reason codes, quality/staleness semantics). Protocol node ids and `Opc.Ua` types remain inside `Fabrik3D.Infrastructure/OpcUa`.

**Consequences.** Later transports (MQTT S34, Modbus S35) map onto the same mirror; the historian and replay can reuse it. There are two implementations of one schema, so the drift tests are mandatory and the representational differences are documented above. The mirror is intentionally in-memory until a sprint needs persistence.
