# S40 - Persistent telemetry and event historian

## Outcome

The server gains bounded, maintainable historical persistence for selected signals and events: telemetry samples, events, alarm events, commands, state transitions, sessions, source, quality, timestamp, and correlation id, with configurable sampling, retention, optional aggregation, session/equipment/signal filtering, indexes, measured query latency, and documented guidance for when a dedicated time-series database becomes necessary.

## Motivation

Replay currently lives in browser memory; training evidence, diagnosis, and time travel need durable history. This sprint builds the smallest architecture that supports S41 without turning Fabrik3D into a time-series platform.

## Current-state assumptions to verify

- MongoDB persistence exists for jobs/tasks/sessions/alarms/messages/machine state/cell templates; no indexes are created today.
- `MachineState` is a single snapshot; `Alarm` has an audit trail; `OperatorMessage` exists; alarms/messages are not raised through the API today.
- The simulator timeline (`src/timeline`) records commands, state transitions, alarms, acknowledgements, telemetry, and fault actions locally.
- Connector values (S33-S35) and signal samples (S31/S32) exist; authority events exist (S36).
- Docker/Testcontainers MongoDB fixtures are established.

## Scope

- Define versioned historian documents:
  - `TelemetrySample`: timestampUtc, sessionId?, equipmentId, signalId, value, valueType, quality, source, origin, correlationId.
  - `HistorizedEvent`: timestampUtc, kind (event/command/state-transition/alarm/authority/fault), sessionId?, equipmentId?, severity, code, payload (bounded), source, correlationId.
  - Session/run metadata references and schema version.
- Implement selective sampling and retention:
  - per-signal sampling policy (interval, on-change vs periodic, deadband for analog values);
  - retention policy by age and/or count with a background pruner;
  - optional aggregation (for example min/max/avg per interval) only where justified and documented.
- Implement ingestion:
  - a validated, bounded, rate-limited server endpoint or internal ingestion path from the simulator bridge (and connectors where enabled);
  - batching to avoid per-sample REST overhead;
  - rejection of malformed/oversized batches with diagnostics.
- Implement queries:
  - filter by session, equipment, signal, kind, time range, severity;
  - paginated, deterministic ordering;
  - indexes created intentionally (session+time, equipment+signal+time, kind+time) and measured.
- Bound storage: document worst-case growth per signal/hour, enforce caps, and never allow unbounded document growth.
- Measure and record query latency for representative queries and storage growth for representative loads.
- Document when a dedicated time-series database becomes necessary (criteria and migration path), without adding one now.

## Non-goals

- No dedicated TSDB, no streaming platform, no message bus.
- No time-travel reconstruction UI (S41).
- No instructor dashboard (S45).
- Do not historize every signal at full rate by default; default policies must be conservative.

## Architecture boundaries

- Historian is server-side Infrastructure/Persistence; the simulator sends bounded batches through the orchestration bridge.
- Domain entities remain clean; historian documents are their own concern.
- Connectors feed the same historian path; no connector-specific storage.
- Read-only history must never be able to issue commands.

## Domain and data model changes

- New versioned documents/entities with schema version, indexes, and retention metadata.
- No breaking change to existing entities; optional `CorrelationId`/references reused where present.

## Backend changes

- Historian repository/service/pruner, ingestion endpoint(s), query endpoints, DTOs, contracts, DI wiring, configuration options with secure conservative defaults.
- Background retention service following the existing hosted-service pattern.

## Simulator changes

- Bridge batches and sends selected telemetry/events according to server-provided or configured policy; offline mode keeps local-only behavior.
- Timeline events map to historian `HistorizedEvent` kinds without changing existing local semantics.

## HMI and UX changes

- No operator HMI changes in S40; engineering timeline uses local data as today.
- Historian status (enabled, sampled rate, storage estimate) may appear in engineering diagnostics if a surface already exists; do not add operator clutter.

## 3D and visual requirements

Not applicable.

## Protocol and security requirements

- Ingestion endpoint validates size, rate, schema, and correlation; authenticated/authorized later in S42 (document interim boundary).
- No secrets in historized payloads; payload size bounded to prevent abuse.
- Retention and deletion are explicit and documented; data privacy documentation updated in S50.

## Backward compatibility

- Existing MongoDB documents remain readable; new collections are additive.
- Existing simulator/HMI flows work with historian disabled (default must be safe).

## Migration requirements

- Schema version on documents with compatibility readers; index creation is idempotent and safe to re-run.
- Migration test against representative existing repository data.

## Failure and degraded-mode behavior

- Historian failure must not break live orchestration or the simulator: ingestion failures are logged/counted and retried in a bounded way, then dropped with a metric.
- Query endpoints degrade gracefully when the historian is empty/disabled.
- Pruner failure must not delete more than policy allows; report health.

## Testing strategy

- Unit tests: sampling/deadband logic, retention math, document mapping, schema validation, query building.
- Integration tests (Testcontainers MongoDB): ingestion batching, query filters/pagination/ordering, index presence, pruner retention, migration from existing data, bounded growth behavior.
- Performance tests: ingestion throughput, query latency on a representative dataset, storage growth per signal/hour; record numbers.
- Contract tests for historian DTOs.

## Performance requirements

- Ingestion sustains the documented sample rate with bounded memory and no API starvation; batching amortizes overhead.
- Query latency target recorded (for example p95 under a documented bound on a representative dataset) rather than an unsupported claim.
- Storage growth documented with caps and pruning windows.

## Security considerations

- Size/rate limits, schema validation, bounded payloads.
- No command path from history; queries are read-only.
- Interim authorization boundary documented until S42.

## Documentation changes

- New `docs/architecture/TELEMETRY_HISTORIAN.md` (schema, sampling/retention, indexes, queries, measured numbers, TSDB threshold guidance).
- Update `DIGITAL_TWIN_TELEMETRY.md`, `ORCHESTRATION.md`, `README.md`, and `docs/development/DEPENDENCY_AUDIT.md` if dependencies change.

## Acceptance criteria

1. Selected signals/events are persisted with source, quality, timestamp, and correlation id, and are queryable by session/equipment/signal/kind/time/severity with deterministic ordering.
2. Retention by age/count works and is covered by tests; storage growth is bounded and documented.
3. Indexes exist for the documented query patterns; measured query latency is recorded.
4. Well-formed batches under the documented limits are accepted; malformed/oversized/rate-abusive input is rejected with diagnostics.
5. Historian disabled or failing does not break live orchestration or the simulator.
6. Migration test from representative existing data passes.
7. Documented criteria state when a dedicated TSDB would be required.
8. All builds/tests/contracts/frontend gates pass.

## Evidence expected for completion

```text
dotnet build/test (N passed, listing historian + pruner + migration tests)
recorded ingestion throughput, query latency, storage growth
index listing from the test database
npm run contracts:check (pass)
frontend gates (pass)
simulator batch ingestion evidence from the reference cell session
```

## Rollback and failure containment

Historian is additive and feature-gated; disabling it leaves S39 behavior and local timelines intact. Pruning defaults are conservative; a faulty pruner can be disabled without data loss beyond policy.

## Follow-up items that must not leak into this sprint

- Time-travel reconstruction UI and determinism guarantees (S41).
- Training session persistence/assessment (S44).
- Observability dashboards/metrics (S49).
