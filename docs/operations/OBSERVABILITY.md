# Observability

Status: **implemented (S49)**. Instrumentation is additive, off-network by default and never changes
domain semantics. This document records what is emitted, how to configure it and how it was verified.

Fabrik3D depends only on the framework-provided `System.Diagnostics.DiagnosticSource` primitives
(`ActivitySource` and `Meter`). These are the same primitives the OpenTelemetry .NET SDK consumes, so
a deployment that wants OTLP export wires the standard exporter to the source/meter names below
without any change to domain code. **No external collector is required for an on-prem install.**

## What is emitted

### Traces (OpenTelemetry-compatible activities)

Source name: `Fabrik3D.Server`. A listener that is not attached costs nothing: `StartActivity`
returns `null` and instrumentation becomes a no-op.

| Span | Kind | Carries | Where |
| --- | --- | --- | --- |
| `fabrik3d.http.request` | Server | `http.request.method`, `url.path`, `http.response.status_code`, `fabrik3d.correlation_id` | `ObservabilityMiddleware` |
| `fabrik3d.signalr.send` | Producer | `signalr.event`, `fabrik3d.correlation_id` | `HubNotificationService` |
| `fabrik3d.historian.write` | Internal | `historian.kind`, `historian.count`, `historian.records` | `HistorianService` |
| `fabrik3d.connector.operation` | Client | `connector.protocol`, `connector.operation`, `signal.id` / `mqtt.topic`, `mqtt.retain` | OPC UA / MQTT / Modbus write paths |

### Metrics

Meter name: `Fabrik3D.Server`. Every instrument records both on the OTel meter (for an external
listener) and in a bounded in-process aggregate used by the authenticated diagnostics endpoint.

| Instrument | Type | Unit | Meaning |
| --- | --- | --- | --- |
| `fabrik3d.api.requests` | Counter | requests | HTTP requests by method/route template/status |
| `fabrik3d.api.request.duration` | Histogram | ms | HTTP request duration |
| `fabrik3d.signalr.connections.active` | UpDownCounter | connections | Active SignalR connections |
| `fabrik3d.signalr.messages` | Counter | messages | SignalR messages pushed, by event |
| `fabrik3d.connector.reconnects` | Counter | reconnects | Connector reconnect attempts, by protocol |
| `fabrik3d.connector.updates` | Counter | updates | Connector signal updates, by protocol/outcome |
| `fabrik3d.connector.write.attempts` | Counter | writes | Fail-closed aware write attempts, by protocol/outcome |
| `fabrik3d.signal.updates` | Counter | updates | Accepted signal-mirror updates |
| `fabrik3d.historian.writes` | Counter | writes | Historian documents written, by kind |
| `fabrik3d.historian.write.duration` | Histogram | ms | Historian write duration |
| `fabrik3d.authority.transitions` | Counter | transitions | Control-authority transitions, by scope/mode |
| `fabrik3d.simulator.frame.duration` | Histogram | ms | Simulator-reported frame duration |
| `fabrik3d.simulator.draw.calls` | Histogram | drawcalls | Simulator-reported draw calls per frame |
| `fabrik3d.simulator.triangles` | Gauge | triangles | Last reported scene triangles |
| `fabrik3d.simulator.texture.bytes` | Gauge | bytes | Last reported estimated texture bytes |
| `fabrik3d.simulator.heap.bytes` | Gauge | bytes | Last reported JS heap bytes |

The connector snapshot additionally projects the adapters' existing health counters as read-only
gauges (`fabrik3d.connector.enabled`, `...connected`, `...reconnects`, `...updates`,
`...writes`) at scrape time; it never connects, writes or mutates connector state.

### Structured logs

Logs are standard ASP.NET Core structured logs. The following scopes add consistent fields:

- request scope — `CorrelationId`, `Method`, `TraceId`, `SpanId`, `Subject` (authenticated `sub` only);
- tenant scope — `OrganizationId`, `TenantScope`;
- connector and historian logs already carry `CorrelationId`, session and protocol context.

Secrets, tokens, credentials, certificate material and raw protocol payloads are never logged.
Correlation ids are accepted from, and echoed back in, the `X-Correlation-Id` header.

## Configuration

`appsettings.json` section `Observability`:

```json
{
  "Observability": {
    "Enabled": true,
    "MetricsEndpointEnabled": true,
    "Exporter": "None",
    "OtlpEndpoint": null,
    "ConsoleExportIntervalSeconds": 60,
    "MaxSeries": 500,
    "SimulatorMetricsRateLimitPerMinute": 120
  }
}
```

- `Enabled` — master switch for traces, metrics and log enrichment. Set to `false` for a hard no-op.
- `MetricsEndpointEnabled` — exposes `GET /api/diagnostics/metrics`. Set to `false` to remove it.
- `Exporter` — `None` (default), `Console` (periodic local snapshot through the logger) or `Otlp`
  (standard OpenTelemetry OTLP gRPC export of the Fabrik3D activity source and meter). Unknown values
  resolve to `None`.
- `OtlpEndpoint` — absolute gRPC endpoint (for example `http://localhost:4317`). Required when
  `Exporter` is `Otlp`; if it is missing or invalid, the server logs a warning and OTLP export stays
  disabled instead of failing startup.
- `MaxSeries` — bounded cardinality. Beyond it, new series are dropped and counted
  (`fabrik3d.metrics.dropped_series`) instead of growing without limit.
- `SimulatorMetricsRateLimitPerMinute` — per-client bound on the simulator report endpoint.

External export is **disabled by default**. To export, set `Observability:Exporter` to `Otlp` and
`Observability:OtlpEndpoint` to your collector's absolute gRPC URI; the server then wires the standard
OpenTelemetry SDK to the source `Fabrik3D.Server` and meter `Fabrik3D.Server`. The same values are
visible on the status endpoint.

## Endpoints

All diagnostics endpoints require authentication (`Read` policy) except the simulator report which
requires `Operate`. They never expose secrets, endpoints with credentials or raw paths.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/diagnostics/status` | resolved configuration and series counts |
| `GET /api/diagnostics/metrics` | Prometheus text (`format=text`) snapshot |
| `GET /api/diagnostics/metrics?format=json` | JSON series snapshot |
| `POST /api/diagnostics/simulator` | optional simulator frame/render report (rate limited) |

The simulator client is instrumented with a bounded frame sampler (`fabrik3d.client/src/observability/frameMetrics.ts`)
and reports only when `VITE_OBSERVABILITY_ENABLED=true`; otherwise it records locally and stays
silent. A reporter failure is always a silent no-op (`Observability disabled: the simulator must not
treat this as a failure`).

S56 extends the sampler with p99 frame time and an honest acceleration classification
(`fabrik3d.client/src/observability/acceleration.ts`): the observed WebGL renderer identity is recorded
and labelled `hardware`, `software` or `unknown`, never upgraded above the evidence. The same
diagnostics surface (`__fabrik3dDiagnostics`, enabled only in dev or with `?diagnostics=1`) feeds the
performance, soak and leak-detection harnesses; it exposes no secrets and is removed on unmount. Regression
budgets and the soak procedure are in [PERFORMANCE.md](./PERFORMANCE.md), and the failure/recovery
contract is in [RECOVERY_MATRIX.md](./RECOVERY_MATRIX.md).

## Degraded modes

- Collector/exporter unavailable — the application continues; no request path depends on it.
- Series limit reached — new series are dropped and counted; existing series keep updating.
- Metrics endpoint disabled — returns `404`; the simulator report returns `202` and is ignored.
- Mixed model and route cardinality is bounded by using route templates, never raw ids.

## Verification

```powershell
dotnet test Fabrik3D/Fabrik3D.Server.Tests/Fabrik3D.Server.Tests.csproj --filter "FullyQualifiedName~Observability"
dotnet test Fabrik3D/Fabrik3D.Server.Tests/Fabrik3D.Server.Tests.csproj --filter "FullyQualifiedName~SecurityHardeningTests"
npm --prefix Fabrik3D/fabrik3d.client run test -- src/observability
```

Covered: aggregator arithmetic, deterministic ordering and Prometheus rendering, bounded cardinality,
disabled no-op, exporter resolution, authenticated status/metrics endpoints, Prometheus and JSON
formats, correlation echo and generation, simulator report authorization/validation/rate limiting,
and disabled-observability behavior.

## Recorded measurements

Reference host: 13th Gen Intel Core i7-13620H (10 cores / 16 logical), 63.7 GB RAM, Windows,
Node.js 24.18.0, .NET 10.0.401 SDK building .NET 8 targets (`dotnet test`, `vitest`).

| Measurement | Result | Source |
| --- | --- | --- |
| Metric recording — API records (200,000) | 618.2 ms, **323,510 records/s** | `ObservabilityPerformanceTests.Recording_200k_api_requests_stays_within_the_budget` |
| Metric recording — signal updates (200,000) | 29.5 ms, **6,775,183 updates/s** | `ObservabilityPerformanceTests.Recording_200k_signal_updates_stays_within_the_budget` |
| Client frame sampling (100,000 frames) | 9.7 ms, **~10.3M frames/s** | `frameMetrics.performance.test.ts` |

These are instrumentation-overhead measurements, not end-to-end throughput claims. End-to-end
performance measurements are recorded in [PERFORMANCE.md](./PERFORMANCE.md).

## Limitations

- The OTLP exporter package is referenced but never activated unless `Exporter=Otlp` with a valid
  endpoint, so on-prem installs have no external collector dependency by default.
- Traces and metrics are only exported when OTLP is explicitly enabled; otherwise the spans and
  instruments remain available to any in-process OTel listener but are not sent anywhere.
- The in-process aggregate is a diagnostic convenience, not a durable metrics store; use an external
  Prometheus/OTLP backend for retention and alerting.
