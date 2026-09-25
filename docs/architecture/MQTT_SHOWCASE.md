# MQTT transport

MQTT is an optional, disabled-by-default infrastructure adapter implemented in S34. It lets the
orchestrator observe telemetry from real brokers and publish allow-listed commands, but it is **only
an integration boundary**: the internal bus remains REST + SignalR and server-side domain
orchestration. MQTT never carries application orchestration.

The transport is implemented with the maintained **MQTTnet 4.3.7.1207** client library (compatible
with .NET 8) in `Fabrik3D.Infrastructure/Mqtt`. MQTT **5.0** is the default wire protocol; set
`Mqtt:ProtocolVersion` to `3.1.1` for legacy peers (the `IP`/session-expiry features are then not
negotiated). No Sparkplug B or vendor-specific profile is implied.

## Broker setup

The repository ships a local development broker configuration, [mosquitto.conf](../demo/mosquitto.conf)
(`listener 1883`, anonymous, no persistence), and deterministic publisher data,
[mqtt-telemetry.fixture.json](../demo/mqtt-telemetry.fixture.json). Run a local broker with:

```powershell
mosquitto -c docs/demo/mosquitto.conf
```

The mandatory connector gate does **not** use a hand-started broker. Integration tests start an
`eclipse-mosquitto:2` container themselves through Testcontainers
(`Fabrik3D.Server.Tests/MosquittoContainerFixture.cs`). Docker Desktop (or a compatible engine) is
required to run those tests; a fixture outage fails the tests explicitly instead of skipping them.
For an equivalent manual fixture:

```powershell
docker run --rm -p 1883:1883 eclipse-mosquitto:2
```

Keep `Mqtt:Enabled=false` in the default and public deployment. Anonymous brokers are a development
convenience only and are marked by `Mqtt:AllowAnonymousBroker=true`.

## Topics

Topic structure is configuration/mapping data and is never hardcoded into equipment logic.

| Purpose | Default convention | Configuration |
|---|---|---|
| Telemetry (subscribe) | `fabrik3d/v1/cells/{cellId}/equipment/{equipmentId}/telemetry` | `Mqtt:TelemetryTopics` (wildcards allowed) |
| Commands (publish) | `fabrik3d/v1/cells/{cellId}/equipment/{equipmentId}/command/{action}` | `Mqtt:CommandAllowList` exact match |
| Command observation (subscribe) | `fabrik3d/v1/cells/{cellId}/equipment/{equipmentId}/command/#` | `Mqtt:CommandTopics` |
| Last Will (publish, broker-side) | `fabrik3d/v1/cells/{cellId}/equipment/{equipmentId}/status` | `Mqtt:WillTopic` |

Incoming telemetry is matched against `TelemetryTopics` with MQTT wildcard semantics (`+` per level,
`#` multi-level). When `TelemetryTopics` is empty, any topic containing `/telemetry` is accepted for
backward compatibility. Command topics are observed only and never used for orchestration.

## Versioned payload schema (1.0, additive optional fields)

```json
{
  "schemaVersion": "1.0",
  "equipmentId": "robot-1",
  "category": "robot",
  "executionState": "Running",
  "measurements": { "speedMetersPerSecond": 0.4, "running": true },
  "timestampUtc": "2026-01-01T00:00:00Z",
  "source": "observed",
  "quality": "good",
  "cellId": "demo",
  "sessionId": "session-7",
  "correlationId": "corr-42"
}
```

- `schemaVersion`, `equipmentId`, `measurements` and `timestampUtc` are the original 1.0 fields.
- `source`, `quality`, `cellId`, `sessionId` and `correlationId` are **optional and additive**. The
  existing 1.0 fixture (`docs/demo/mqtt-telemetry.fixture.json`) and all original publishers keep
  parsing unchanged, so no schema-version bump is required.
- `quality` uses the shared vocabulary (`good`, `stale`, `bad`, `uncertain`, `invalid`) and defaults
  to `good`. A declared quality is never upgraded.
- `source` defaults to `observed`. A publisher may not declare `commanded`; that would let an
  external broker impersonate an operator command and is rejected.
- A live message without `timestampUtc` is timestamped on arrival. A **retained** message must carry
  a valid timestamp.
- `sessionId` and `correlationId` provide duplicate and correlation metadata.

Each measurement is mapped to a canonical signal id `{equipmentId}.{measurement}` unless an explicit
`Mqtt:SignalMap` entry overrides the id, data type, unit, range or enum values. Data types are
inferred from the JSON shape (bool / int / float / string) when not declared.

## QoS, retained and session policy

- **QoS**: `Mqtt:QoS` (0/1/2, default 1) is applied explicitly to subscriptions and outbound
  publishes. It is documented per direction and never guessed.
- **Retained telemetry**: a retained value is historical by nature. It is accepted only with a valid
  timestamp; when its age exceeds `Mqtt:StaleAfterMilliseconds` it is stored with `stale` quality, so
  it is **never surfaced as fresh `good` state**. Retained telemetry without a timestamp is rejected.
  Set `Mqtt:AllowRetainedTelemetry=false` to reject retained telemetry outright.
- **Retained commands**: refused unless `Mqtt:AllowRetainedCommands=true`.
- **Session**: `Mqtt:CleanSession` (default `false`) plus `Mqtt:SessionExpirySeconds` (MQTT 5) control
  session resumption.
- **Last Will**: when `Mqtt:WillTopic` is configured, the client arms a Last Will
  (`WillPayload`, `WillRetain`, configured QoS) for broker-side liveness signalling. A clean shutdown
  suppresses the Will.

## Write policy and security

- Writes are **disabled by default** and fail closed. A command is published only when the connector
  is enabled, `Mqtt:AllowWrites=true`, the topic is on the exact `Mqtt:CommandAllowList`, and (for
  retained publishes) `AllowRetainedCommands=true`.
- Credentials come from configuration or environment only (`Mqtt:UserName` / `Mqtt:Password`), are
  never committed and are never logged.
- `Mqtt:UseTls` enables TLS; `Mqtt:AllowUntrustedCertificates` is an explicit development-only escape
  hatch for self-signed brokers. It requires `UseTls=true` (the validator refuses it on a plaintext
  broker, where it has no effect) and logs a warning on connect. It must not be enabled in production.
- Malformed JSON, unsupported schema versions, unknown topics, invalid quality/source, oversized
  payloads (`Mqtt:MaxPayloadBytes`) and out-of-allow-list commands are rejected with diagnostics.
- No `eval`/dynamic code and no unbounded queues: duplicate tracking is bounded by
  `Mqtt:DuplicateWindowSize` and drops the oldest entry.

## Failure and degraded-mode behaviour

- Broker unavailable: state is `Error` (never connected) or `Degraded` (lost after connecting), with
  bounded exponential backoff between `ReconnectDelaySeconds` and `MaxReconnectDelaySeconds`. No
  unhandled exception escapes and authority never changes silently.
- Duplicate deliveries: ignored by `correlationId`, or by `sessionId` + timestamp + equipment when no
  correlation id is present.
- Stale updates: rejected by the signal mirror (`stale-timestamp`) without mutating stored state.
- Shutdown: unsubscribes, disconnects cleanly and disposes the client; no dangling tasks.

## Health and diagnostics

`GET /api/connectors/mqtt` returns the shared `ConnectorStatusDto` surface introduced in S33:
state (`Disabled`/`Connecting`/`Connected`/`Degraded`/`Error`), broker, last error, reconnect count,
subscription count, messages received, updates accepted/rejected, malformed payloads, unsupported
schemas, invalid payloads, duplicates ignored, stale rejections, retained-historical acceptances and
write attempt/accept/reject counters. With `Mqtt:Enabled=false` the connector is inert and health
reports `Disabled`.

## Configuration example

```json
"Mqtt": {
  "Enabled": false,
  "Broker": "mqtt://localhost:1883",
  "ClientId": "fabrik3d-orchestrator",
  "QoS": 1,
  "CleanSession": false,
  "SessionExpirySeconds": 3600,
  "ReconnectDelaySeconds": 5,
  "MaxReconnectDelaySeconds": 60,
  "ProtocolVersion": "5.0",
  "AllowWrites": false,
  "AllowRetainedCommands": false,
  "AllowRetainedTelemetry": true,
  "MaxPayloadBytes": 65536,
  "StaleAfterMilliseconds": 10000,
  "TelemetryTopics": ["fabrik3d/v1/cells/+/equipment/+/telemetry"],
  "CommandTopics": [],
  "CommandAllowList": [],
  "SignalMap": []
}
```

## Verification and performance

- Unit coverage: option validation, topic/payload validation, schema version handling, quality/source
  and retained policy, command allow-list, correlation/session metadata and the health surface.
- Mosquitto integration coverage: connect, subscribe, telemetry mapping, reconnect after a broker
  restart, duplicate handling, retained-value handling, malformed/unsupported payload rejection,
  stale-timestamp rejection, command rejection and allow-listed delivery, Last Will visibility and
  graceful shutdown.
- Run it with:

  ```powershell
  dotnet test Fabrik3D/Fabrik3D.Server.Tests/Fabrik3D.Server.Tests.csproj --filter "FullyQualifiedName~Mqtt"
  ```

- The throughput test records accepted messages/second and the reconnect test records reconnect
  latency after a broker restart on CI-class hardware; they are indicative measurements, not
  capacity guarantees.

## Limitations

- MQTT is an integration boundary, not an orchestration bus; it never drives jobs, sessions or tasks.
- No Sparkplug B, vendor profile or MQTT-over-WebSocket browser client is implemented.
- TLS client-certificate provisioning and per-tenant broker isolation are not part of S34.
- Historian persistence of MQTT telemetry is planned for S40.

## Signal mapping studio (S37)

MQTT mappings can be authored and validated in the simulator studio (see
[`SIGNAL_MAPPING_STUDIO.md`](./SIGNAL_MAPPING_STUDIO.md)). A mapping entry carries the
topic and payload field plus direction and datatype; an explicit apply projects it into the
connector's `SignalMap`. As before, command publishes still require `AllowWrites` and an exact
`CommandAllowList` entry, so the studio never bypasses MQTT write policy.

