# S34 - Real MQTT transport

## Outcome

MQTT becomes a real, disabled-by-default client adapter with connection lifecycle, reconnect, QoS policy, retained-message policy, session semantics, Last Will, health monitoring, versioned payload validation, signal/twin mapping, command allow-list, and Mosquitto Docker integration tests. MQTT remains an integration boundary, never the internal orchestration bus.

## Motivation

`MqttOptions`/`MqttMapping` parse telemetry records but no client exists and nothing is registered. Digital-twin mode needs observed telemetry from real brokers, and training environments frequently prefer MQTT over OPC UA.

## Current-state assumptions to verify

- `MqttOptions`: `Enabled=false`, `Broker`, `ClientId`, `QoS`, `CleanSession=false`, `ReconnectDelaySeconds`, `AllowWrites=false`, `CommandAllowList`.
- `MqttMapping.TryParseTelemetry` requires a topic containing `/telemetry`, `schemaVersion == "1.0"`, non-empty `equipmentId`; `MqttTwinPayload` has no `source`/`quality` field.
- No MQTT NuGet package exists and no MQTT service is registered.
- `docs/demo/mosquitto.conf` (anonymous, no persistence) and `docs/demo/mqtt-telemetry.fixture.json` exist; the fixture record uses snake/camel shape documented in `docs/architecture/MQTT_SHOWCASE.md`.
- S33 introduced the server-side signal mirror and the pattern for connector health and Docker fixtures.

## Scope

- Add a maintained .NET MQTT client library compatible with .NET 8 (for example MQTTnet) to `Fabrik3D.Infrastructure`; document the pinned version and protocol version (MQTT 5 where interoperable, with a documented fallback if a peer requires 3.1.1).
- Implement a real `MqttConnector`:
  - connect/disconnect/reconnect with bounded backoff;
  - subscriptions for declared telemetry topics and command topics;
  - publish path for commands/telemetry with explicit QoS policy;
  - retained-message policy: a retained telemetry value must never become trusted fresh state on its own (document how retained values are accepted only with a valid, fresh timestamp and quality);
  - session behavior (`CleanSession`/session expiry) and Last Will where useful for health;
  - payload validation against versioned schemas, with correlation/session metadata;
  - mapping into the signal mirror and twin source `observed`;
  - command allow-list and read-only-by-default behavior;
  - health state, diagnostics counters, last error, broker state;
  - graceful shutdown and disposal.
- Extend the versioned payload contract with `source`, `quality`, `cellId`, `sessionId`, and `correlationId` where missing; keep parsing backward compatible with the existing `1.0` fixture.
- Provide Mosquitto Docker integration tests via Testcontainers or an equivalent documented fixture (no hand-started broker for mandatory gates).
- Keep REST/SignalR and server domain orchestration authoritative; MQTT must not carry application orchestration.
- Surface broker/connector health through the connector-health surface established in S33; regenerate contracts if needed.

## Non-goals

- No Sparkplug B or vendor-specific profile claims.
- No MQTT-over-WebSocket browser client in the simulator.
- No control arbitration (S36) or mapping studio (S37).
- Do not make MQTT enabled by default or in the public demo.

## Architecture boundaries

- MQTT is Infrastructure only; domain and services consume the signal mirror.
- Topic structure is configuration/mapping data, never hardcoded into equipment logic.
- The internal bus remains REST/SignalR + server domain services.
- Write access is disabled by default and fail-closed.

## Domain and data model changes

- Server-side versioned MQTT payload schema (documented) and mapping into the existing signal/twin model.
- No breaking change to the S33 signal mirror.

## Backend changes

- New package(s) in `Fabrik3D.Infrastructure`, real connector, options extensions (topics, schema validation, session/Last Will policy), DI registration, hosted-service lifecycle, health/diagnostics.
- Tests and fixture wiring.

## Simulator changes

None required. If contracts change additively, regenerate TypeScript contracts.

## HMI and UX changes

None in S34; diagnostics UI is S37.

## 3D and visual requirements

Not applicable.

## Protocol and security requirements

- Disabled by default; anonymous brokers only when explicitly configured and clearly marked as development.
- Credentials from configuration/environment only; never committed; never logged.
- Malformed JSON, unsupported schema versions, unknown topics, and out-of-allow-list commands are rejected with diagnostics.
- QoS policy is explicit and documented per direction; retained commands are allowed only where explicitly configured.
- Payload size bounds are enforced.

## Backward compatibility

- Existing `MqttMappingTests` keep passing or are migrated with documented equivalence.
- The documented fixture `docs/demo/mqtt-telemetry.fixture.json` remains parseable.
- REST/SignalR contracts stay backward compatible.

## Migration requirements

- If payload fields are added, keep readers tolerant of missing optional fields and document the schema version bump.
- No destructive database changes.

## Failure and degraded-mode behavior

- Broker unavailable: connector reports `Degraded`/`Error`, retries with bounded backoff, no unhandled exceptions, no silent authority change.
- Duplicate deliveries: idempotent handling by correlation/session id; stale duplicates rejected by timestamp.
- Retained values: treated as historical; tested explicitly.
- Malformed payloads: counted, logged, skipped.
- Shutdown: unsubscribe, disconnect cleanly, no dangling tasks.

## Testing strategy

- Unit tests: option validation, topic/payload validation, schema version handling, command allow-list, QoS/retained policy decisions, correlation/session metadata, health transitions.
- Integration tests with Mosquitto:
  - connect, subscribe and receive telemetry;
  - broker restart and reconnect;
  - duplicate delivery handling;
  - retained value handling;
  - malformed JSON and unsupported schema;
  - rejected and allow-listed commands;
  - stale timestamp rejection;
  - Last Will / health visibility where configured;
  - graceful shutdown.

## Performance requirements

- Sustain the documented telemetry rate with bounded memory; measure and record messages/second and reconnect latency on CI-class hardware.
- No unbounded queues; drop/coalesce policy documented.

## Security considerations

- No hardcoded credentials; TLS configuration documented for production; insecure/anonymous only as an explicit development flag.
- Command allow-list exact match; read-only by default.
- Input validation before mapping; no `eval`/dynamic code.

## Documentation changes

- Rewrite `docs/architecture/MQTT_SHOWCASE.md` to describe the real transport, broker setup, topics, payload schemas, QoS/retained/session policy, write policy, health, and limitations.
- Update `README.md` to distinguish MQTT as implemented-but-disabled-by-default.
- Document the Docker fixture and CI invocation.

## Acceptance criteria

1. With `Mqtt:Enabled=false` (default), startup is inert and health reports `Disabled`.
2. With the Mosquitto fixture, integration tests prove connect, subscribe, telemetry mapping, reconnect after broker restart, duplicate handling, retained-value handling, malformed/unsupported payload rejection, command rejection and allow-listed command delivery, stale timestamp rejection, and graceful shutdown.
3. A retained telemetry value without a fresh valid timestamp is never surfaced as fresh `good` state.
4. MQTT is not used for application orchestration anywhere in the codebase.
5. `dotnet build`/`dotnet test` pass with fixture; frontend gates and contracts check pass.

## Evidence expected for completion

```text
dotnet build Fabrik3D/Fabrik3D.slnx (0 warnings 0 errors)
dotnet test Fabrik3D/Fabrik3D.slnx (N passed, listing MQTT integration tests)
docker fixture startup evidence (image:tag, broker logs excerpt)
npm run contracts:check (pass)
frontend gates (pass)
recorded throughput/reconnect measurements
```

## Rollback and failure containment

The connector is behind `Mqtt:Enabled`; failures leave orchestration unaffected. A broker fixture outage must fail or explicitly skip integration tests, never silently pass them.

## Follow-up items that must not leak into this sprint

- Modbus TCP (S35), control arbitration (S36), mapping studio (S37).
- Historian persistence of MQTT telemetry (S40).
