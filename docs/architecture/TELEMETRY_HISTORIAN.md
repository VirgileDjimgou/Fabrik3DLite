# Telemetry and event historian (S40)

The historian is the server-side, bounded persistence layer for *selected* signals and orchestration
events. It makes future replay, diagnosis and training evidence durable (S41 and later consume it)
without turning Fabrik3D into a time-series platform.

Scope and honesty:

- **Implemented now:** historian documents, selective sampling, batching/ingestion, read-only
  queries, intentional indexes, retention/pruning, diagnostics and measured numbers (this page).
  S41 consumes the read-only queries for deterministic time-travel reconstruction
  ([`TIME_TRAVEL.md`](./TIME_TRAVEL.md)).
- **Simulated:** the data comes from the simulator bridge and from the optional connector adapters.
  It is never real machine data.
- **Planned / later:** training session persistence (S44), observability dashboards (S49). No
  dedicated TSDB, streaming platform or message bus is added.

## Architecture boundary

```
Simulator timeline ─┐
Connectors (opt.)  ─┼─► POST /api/historian/telemetry|events (bounded batches)
                    │        │  validate → rate-limit → sample → batch
                    │        ▼
                    │   telemetrySamples / historizedEvents (MongoDB, indexed, pruned)
                    └─► GET /api/historian/telemetry|events|status (read-only)
```

- The historian is Infrastructure/Persistence; domain entities stay clean.
- Documents are their own concern and are additive: existing collections are untouched.
- There is **no command path** from history. Queries can only read; reconstruction in S41 must stay
  read-only.
- All connectors feed this same path; there is no connector-specific storage.
- The historian is **disabled by default** (`Historian:Enabled=false`). Disabling it leaves all S39
  behaviour and the local simulator timeline exactly as before.

## Documents (schema 1.0)

Every document carries `SchemaVersion` (`"1.0"`), so compatible readers/upgrades are explicit.

### `telemetrySamples`

| Field | Notes |
| --- | --- |
| `TimestampUtc` | UTC sample time |
| `SessionId`, `RunId` | optional session/run references |
| `EquipmentId`, `SignalId` | stable signal identity |
| `NumericValue` / `TextValue` | numeric for bool/int/uint/float/enum; text for string |
| `ValueType` | `bool\|int\|uint\|float\|enum\|string` |
| `Quality` | `good\|stale\|bad\|uncertain\|invalid` (never silently upgraded) |
| `Source` | `commanded\|replay\|simulated\|observed` |
| `Origin` | `simulation\|controller\|scenario\|fault-injection\|operator\|import\|replay` |
| `CorrelationId` | end-to-end trace id |

### `historizedEvents`

| Field | Notes |
| --- | --- |
| `TimestampUtc` | UTC event time |
| `Kind` | `event\|command\|state-transition\|alarm\|acknowledgement\|authority\|fault` |
| `SessionId`, `RunId`, `EquipmentId` | optional references |
| `Severity` | `info\|warning\|error\|critical` |
| `Code` | stable diagnostic/alarm code |
| `Payload` | **bounded** JSON object/array (default 4096 characters) |
| `Source`, `Sequence`, `CorrelationId` | provenance |

Simulator `TimelineKind` values map 1:1 to historian kinds
(`command→command`, `state-transition→state-transition`, `alarm→alarm`,
`acknowledgement→acknowledgement`, `fault-action→fault`, `telemetry→event`). Local timeline
semantics are unchanged.

## Sampling (conservative by default)

Selection is per `(EquipmentId, SignalId)` and configured under `Historian`:

- `DefaultSamplingMode` = `on-change` (also `periodic`, `on-change-or-periodic`);
- `DefaultSamplingIntervalMilliseconds` = `1000`;
- `DefaultDeadband` = `0` for analog values;
- `SignalPolicies[]` overrides a specific equipment/signal.

Rules (implemented in the pure, unit-tested `SamplingDecisionEngine`):

- the first sample of a signal is always stored;
- an `OnChange` policy stores a value only when it changes beyond the deadband, or when its quality
  changes (a value never silently keeps `good`);
- a `Periodic` policy stores at most one sample per interval;
- `OnChangeOrPeriodic` stores on change or when the interval elapses.

**Nothing is historized at full rate by default.** A signal without an override and with no deadband
still keeps only changes, and every store is additionally bounded by the rate limiter.

## Ingestion (validated, bounded, rate-limited)

`POST /api/historian/telemetry` and `POST /api/historian/events` accept bounded batches. Batching
amortizes per-request overhead; the simulator bridge defaults to 100 documents per request.

- **Validation:** required identity, known value type/quality/source/origin/kind/severity, plausible
  UTC timestamps, valid bounded JSON payload. Invalid items are rejected with a diagnostic while
  valid items in the same batch may still be stored.
- **Limits:** `MaxBatchSize` / `MaxEventBatchSize` (default 500) → HTTP 400 with a diagnostic;
  `MaxPayloadLength` (default 4096).
- **Rate limiting:** fixed one-minute window per `SourceId` (`MaxSamplesPerMinutePerSource`,
  `MaxBatchesPerMinutePerSource`) → HTTP 429 with a diagnostic.
- **Failure containment:** a storage failure is retried once, then logged, counted and dropped with
  `degraded=true`. Ingestion never throws into live orchestration.
- The producer identity is used for rate limiting and diagnostics only. Real
  authentication/authorization is S42; the current boundary is explicitly unauthenticated and
  documented as interim.

## Simulator bridge

The simulator forwards the reference-cell timeline through a bounded bridge
(`fabrik3d.client/src/historian/HistorianBridge.ts`), wired into the local `TimelineRecorder` as a
non-critical sink. It is **disabled by default**: enable it with `VITE_HISTORIAN_ENABLED=true`
(optionally `VITE_HISTORIAN_BATCH_SIZE`). When disabled — or when the historian is unreachable — the
bridge is a no-op, drops bounded batches, counts them, and the local timeline remains the only
record, so offline mode is unchanged. The bridge maps `TimelineKind` to historian kinds and never
issues commands.

## Queries (read-only)

- `GET /api/historian/telemetry` — filter by `sessionId`, `equipmentId`, `signalId`, `fromUtc`,
  `toUtc`, `quality`, `source`, `correlationId`, `skip`, `limit`.
- `GET /api/historian/events` — filter by `sessionId`, `equipmentId`, `kind`, `severity`, `code`,
  `fromUtc`, `toUtc`, `correlationId`, `skip`, `limit`.
- Ordering is deterministic: `TimestampUtc` descending, then `_id` descending. Pages are bounded by
  `MaxQueryPageSize` (default 500).
- `GET /api/historian/status` — enabled state, retention policy, document counts, storage estimate
  and effective sampling policies.
- Empty or disabled historian returns an empty page (degrade gracefully), never an error.
- `fabrik3d.client/src/services/orchestratorApi.ts` exposes `queryHistorianTelemetry` /
  `queryHistorianEvents` as GET-only calls; `services/historianApi.ts` adapts them to the time-travel
  `HistorianQueryClient`. There is no write/mutate path from the historian client.

### Time-travel consumer (S41)

`loadHistorianInput` (in `fabrik3d.client/src/timeTravel/historianSource.ts`) loads a bounded window
with pagination up to a documented cap and maps it to `ReconstructionInput`:

- historized events map to timeline kinds (`command→command`, `state-transition→state-transition`,
  `alarm→alarm`, `acknowledgement→acknowledgement`, `fault→fault-action`, `event→telemetry`);
- `authority` events feed the read-only authority timeline;
- telemetry samples whose signal id ends in `.jointValues` and whose `textValue` is a JSON array are
  trajectory samples (SI radians); other samples are signal readings.

When the historian is empty or disabled, the simulator falls back to its local timeline, and the two
are combined without duplication (historian wins on collision). Reconstruction is strictly read-only
and never calls an ingestion endpoint.

## Indexes

Created idempotently at startup by `HistorianRetentionService` (and asserted by tests):

- `telemetrySamples`: `session_timestamp` (`SessionId`,`TimestampUtc`),
  `equipment_signal_timestamp` (`EquipmentId`,`SignalId`,`TimestampUtc`), `timestamp`
  (`TimestampUtc`), `correlation`.
- `historizedEvents`: `kind_timestamp` (`Kind`,`TimestampUtc`), `session_timestamp`,
  `equipment_timestamp`, `severity_timestamp`, `timestamp`.

## Retention and bounded storage

Configured under `Historian` and applied by the background pruner:

- `RetentionMaxAgeDays` (default 7) — deletes documents older than the cutoff.
- `RetentionMaxSamplesPerSignal` (default 200,000) — keeps the newest N samples per
  equipment+signal.
- `RetentionMaxEventDocuments` (default 500,000) — keeps the newest N events.
- `RetentionCheckIntervalMinutes` (default 15); the pruner only ever deletes within policy, and a
  pruner failure is logged and reported without deleting beyond the bounds.

Worst-case growth per signal/hour (pure `RetentionMath`):

- periodic / on-change-or-periodic at 1 s: `3,600,000 / intervalMs` → **3,600 docs/hour**;
- on-change: bounded only by the documented per-source rate limit (e.g. 3,600/hour at 60/min);
- disabled: 0.

Documented fixed estimates: ~220 bytes/sample, ~360 bytes/event (measured ≈270 bytes/sample for the
small numeric dataset below).

## Measured numbers

Measured on the sprint development workstation with the isolated `mongo:7.0` Testcontainer, using the
representative 20-signal dataset in `HistorianIntegrationTests.Performance_records_ingestion_throughput_and_query_latency_on_a_representative_dataset`:

| Metric | Result |
| --- | --- |
| Ingestion (batches of 500) | 20,000 samples in **839 ms** ≈ **23,800 samples/s** |
| Query latency (50 representative queries, limit 100) | p50 **9.1 ms**, p95 **18.2 ms**, max 106 ms |
| Documented query bound | p95 < 500 ms (test asserts it) |
| Logical storage | 20,000 samples ≈ **5.4 MB** (≈270 bytes/sample) |

These numbers are methodology-bound and machine-specific; they are recorded to replace an
unsupported claim, not as a guarantee.

## When a dedicated time-series database becomes necessary

MongoDB + these policies is right while all of the following hold. Move to a TSDB when several stop
being true:

- **Retention window** can be expressed in days with a per-signal count cap that fits on one node.
- **Ingestion** stays under roughly the documented tens-of-thousands of samples/second on the target
  host, and batch writes do not starve the orchestration API.
- **Query patterns** remain session/equipment/signal/kind/time/severity lookups and simple ranges —
  no continuous aggregates or downsampling at read time.
- **Cardinality** stays bounded (tens to low hundreds of signals per cell, not millions).
- **Operational cost** of the combined MongoDB workload stays acceptable.

Indicators that a TSDB is now warranted: sustained query p95 above the documented bound, ingestion
backpressure that cannot be absorbed by larger batches, retention requiring rollups, or cardinality
growth making per-signal count pruning dominant. Migration path: keep the same wire DTOs and historian
service contract; add a TSDB-backed `HistorianRepository` behind the existing interface, dual-write
during a bounded transition, verify query parity, then retire the MongoDB collections. This sprint
deliberately does **not** add a TSDB.

## Configuration reference (`appsettings.json` → `Historian`)

```jsonc
{
  "Historian": {
    "Enabled": false,
    "MaxBatchSize": 500,
    "MaxEventBatchSize": 500,
    "MaxPayloadLength": 4096,
    "MaxSamplesPerMinutePerSource": 6000,
    "MaxBatchesPerMinutePerSource": 120,
    "DefaultSamplingMode": "on-change",
    "DefaultSamplingIntervalMilliseconds": 1000,
    "DefaultDeadband": 0,
    "SignalPolicies": [],
    "RetentionEnabled": true,
    "RetentionCheckIntervalMinutes": 15,
    "RetentionMaxAgeDays": 7,
    "RetentionMaxSamplesPerSignal": 200000,
    "RetentionMaxEventDocuments": 500000,
    "MaxQueryPageSize": 500
  }
}
```
