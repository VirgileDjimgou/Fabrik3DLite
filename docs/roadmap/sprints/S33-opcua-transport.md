# S33 - Production-grade OPC UA transport

## Outcome

The OPC UA boundary stops being a mapper/stub and becomes a real, disabled-by-default client transport: connection lifecycle, secure endpoint handling, certificate trust, subscriptions with monitored items, quality/timestamps, explicit write policy, health and diagnostics, graceful shutdown, and deterministic Docker-fixture integration tests. Protocol node ids never leak into the domain model.

## Motivation

`Fabrik3D.Infrastructure/OpcUa/OpcUaConnector.cs` currently only sets a `Health` string; `OpcUaMapping` maps in-memory records with no stack. Digital-twin mode and virtual commissioning require a real observed/commanded path. This sprint is the first real connector and establishes the pattern S34/S35 follow.

## Current-state assumptions to verify

- `OpcUaOptions` exposes `Enabled=false`, `Endpoint`, `SecurityPolicy`, `CertificateTrustStore`, `ReconnectDelaySeconds`, `SamplingIntervalMilliseconds`, `AllowWrites=false`, `WriteAllowList`.
- `OpcUaConnector` is registered as a singleton and started by `OpcUaConnectorHostedService`; `OpcUaMapping.CanWrite` is exact-match allow-list.
- No OPC UA NuGet package is referenced anywhere; `Fabrik3D.Infrastructure` currently references only MongoDB.Driver and Options.ConfigurationExtensions.
- `MachineState` is a single snapshot with no equipment id, source, quality, or measurements dictionary; S31 signals are client-side; there is no server-side signal mirror yet.
- Tests use xUnit with Testcontainers for MongoDB; DI and server build run on .NET 8.

## Scope

- Add a maintained .NET OPC UA client stack compatible with .NET 8 (`OPCFoundation.NetStandard.Opc.Ua.Client` and required companions) to `Fabrik3D.Infrastructure`.
- Define the server-side signal mirror required for transports: a versioned `IndustrialSignal`/snapshot contract and a server `SignalMirrorStore` (or equivalent) shaped consistently with `docs/architecture/INDUSTRIAL_SIGNAL_CORE.md`; reuse the same id convention and quality/source semantics. Document any intentional representational difference.
- Implement a real `OpcUaConnector` transport:
  - configuration validation and explicit disabled-default behavior;
  - endpoint selection, session creation, secure channel, and reconnection with bounded backoff;
  - certificate trust store handling (auto-trust only in an explicitly labelled development mode);
  - subscription with configurable sampling and publishing intervals, monitored items derived from an explicit node map;
  - value/quality/timestamp mapping into the signal mirror and twin source `observed`;
  - write path gated by `AllowWrites` + `WriteAllowList`, with writable signal legality checked before any node write;
  - health state (`Disabled`, `Connecting`, `Connected`, `Degraded`, `Error`), diagnostics counters, last error, and reconnect count;
  - graceful start/stop in the hosted service with proper disposal and no application crashes on fixture loss.
- Node ids remain configuration/mapping data; no OPC UA type appears in Domain entities.
- Provide a deterministic OPC UA server fixture for local and CI integration tests. Prefer an OCI image (for example an OPC Foundation sample server image or a small purpose-built .NET fixture) started via Testcontainers; document the exact image and tag. If no reliable public image exists, add a minimal fixture server project used only by tests (not shipped to production) and say so.
- Expose connector health through an existing observability surface (extend `HealthDto` or add a connector-status endpoint) without breaking existing contracts; regenerate TypeScript contracts if the REST contract changes.

## Non-goals

- Do not claim IEC 62541 certification or product compliance; use "aligned with selected OPC UA concepts".
- No MQTT or Modbus work (S34/S35).
- No control-authority arbitration or takeover (S36).
- No mapping studio UI (S37).
- Do not enable OPC UA in the public demo or in `appsettings.json` defaults.

## Architecture boundaries

- OPC UA stays an Infrastructure adapter; Domain and Server services consume only the signal mirror and DTOs.
- No node id may appear inside Domain entities or equipment domain logic.
- Writes are disabled by default and must fail closed if the allow-list or writable flag is missing.
- The connector must never block the API event loop; connection work is asynchronous with cancellation.

## Domain and data model changes

- Add server-side signal model DTOs (Contracts) and an in-memory/persisted signal mirror in Domain/Infrastructure, versioned and documented. Do not silently mutate existing `MachineState`; observed state is a separate, explicitly named source.
- If persistence is introduced for the mirror, version it and add indexes intentionally.

## Backend changes

- New packages in `Fabrik3D.Infrastructure` and a real connector implementation.
- `OpcUaOptions` extensions: node map/allow-list shape, trust configuration, subscription intervals, development-mode trust flag, health/status reporting.
- `InfrastructureServiceRegistration` wiring for the connector and any mirror store.
- `OpcUaConnectorHostedService` lifecycle (start, stop, dispose).
- Connector-health surface (endpoint or health DTO extension) and contract regeneration.

## Simulator changes

None required beyond consuming regenerated contracts if `HealthDto` changes. The simulator must keep working when OPC UA is disabled.

## HMI and UX changes

None in S33. Connector diagnostics UI is S37; HMI must remain functional and unchanged.

## 3D and visual requirements

Not applicable. No visual behavior changes.

## Protocol and security requirements

- Security defaults: disabled unless configured; writes disabled; no anonymous insecure assumption; certificate validation never silently accepts arbitrary certificates.
- Insecure/development trust must be an explicit flag that logs prominent warnings and is documented as non-production.
- Passwords/secrets come from configuration/environment, never committed. No certificate or private key is committed.
- Map only allow-listed nodes; unknown nodes produce diagnostics, not crashes.
- Values with bad/uncertain quality are preserved as such (never coerced to good).

## Backward compatibility

- `OpcUaConnector` public surface may change but the DI/health behavior for `Enabled=false` must remain inert and warning-free.
- Existing MQTT mapping tests and all other gates stay green.
- Existing REST/SignalR contracts remain backward compatible; any addition is additive.

## Migration requirements

- If `MachineState` or the database gains fields, provide compatibility reads/defaults and do not rewrite existing documents destructively.
- Document the signal-mirror schema version and its relation to the simulator signal schema.

## Failure and degraded-mode behavior

- Server unreachable: connector reports `Degraded`/`Error`, keeps retrying with bounded backoff, never throws unhandled exceptions, and never reverts another control source.
- Certificate/trust failure: connection refused, error surfaced, no bypass.
- Malformed/stale values: stored with their quality; stale beyond a documented threshold becomes `stale`, not falsely `good`.
- Shutdown: subscriptions closed, session closed, no dangling threads.

## Testing strategy

- Unit tests: option validation, health transitions, write policy, node-map validation, quality/timestamp mapping, malformed values, allow-list rejection.
- Integration tests against the deterministic OPC UA fixture:
  - connect; disconnect; reconnect after fixture restart;
  - subscription delivers changed values;
  - invalid node id produces a diagnostic without crashing;
  - stale values and bad quality surface correctly;
  - certificate/trust failure refuses connection;
  - prohibited write rejected; allow-listed write performed and observed by the fixture;
  - graceful shutdown.
- CI must not depend on proprietary desktop software.

## Performance requirements

- Connector must sustain the documented monitored-item count with sampling/publishing configured intervals; measure and record value throughput and CPU on CI-class hardware.
- Reconnect backoff must be bounded and must not spin.

## Security considerations

- OWASP-aligned configuration handling and secure defaults.
- Explicit allow-list for writes; exact match; reject unknown.
- No secrets in logs; node ids and endpoints may be logged at information level, credentials never.

## Documentation changes

- Rewrite `docs/architecture/OPC_UA_ADAPTER.md` to describe the real transport, setup, security model, node map, health, and limitations. Remove any language implying a live transport already existed.
- Add an ADR section for the signal-mirror schema and transport boundary.
- Update `README.md` claims to distinguish implemented vs experimental.
- Add fixture setup instructions for local and CI runs.

## Acceptance criteria

1. With `OpcUa:Enabled=false` (default), startup logs no errors and health stays `Disabled`.
2. With the fixture running and the connector enabled, integration tests prove connect, subscribe, value/quality/timestamp mapping, reconnect after restart, and graceful shutdown.
3. A non-allow-listed write is rejected with a structured diagnostic; an allow-listed write reaches the fixture and is observed.
4. An invalid node id yields a diagnostic and does not crash the server.
5. Certificate/trust failure refuses the connection and reports an actionable error.
6. No OPC UA type or node id appears in Domain entities.
7. `dotnet build`/`dotnet test` pass with the fixture; all frontend gates and contracts check pass.

## Evidence expected for completion

```text
dotnet build Fabrik3D/Fabrik3D.slnx (0 warnings 0 errors)
dotnet test Fabrik3D/Fabrik3D.slnx (N passed, listing the new OPC UA integration tests)
docker fixture startup evidence (image:tag, container logs excerpt)
npm run contracts:check (pass)
simulator/HMI type-check, test, build (pass)
recorded throughput/reconnect measurements
```

## Rollback and failure containment

Keep the connector behind `OpcUa:Enabled`; on failure the default configuration is inert. If the fixture is unavailable in an environment, connector integration tests must skip with an explicit message rather than pretend to pass, and the sprint must not be completed on skipped mandatory tests.

## Follow-up items that must not leak into this sprint

- MQTT transport (S34).
- Modbus TCP (S35).
- Control arbitration and external-controller mode (S36).
- Mapping studio UI and live monitor (S37).
