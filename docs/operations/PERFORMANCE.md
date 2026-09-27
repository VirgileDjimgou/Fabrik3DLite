# Performance and load validation

Status: **measurements recorded (S49)**. This document records measured numbers, the reference
hardware/browser and the methodology. Numbers from earlier sprints are cited with their source; they
were not re-measured in S49. Nothing here is a certification or a capacity guarantee.

## Reference environment

| Item | Value |
| --- | --- |
| CPU | 13th Gen Intel Core i7-13620H (10 cores / 16 logical) |
| RAM | 63.7 GB |
| OS | Windows |
| .NET SDK | 10.0.401 building `net8.0` targets |
| Node.js | 24.18.0 |
| Browser (automated) | Playwright Chromium (headless, software rendering) and WebKit |

Mobile, ARM, GPU-accelerated and large-scale (hundreds of concurrent clients) numbers are **not**
measured here and must not be inferred from these results.

## S49 measurements

### Concurrent SignalR clients and broadcast fan-out

Harness: `Fabrik3D/fabrik3d.client/scripts/signalr-load.mjs` (`npm --prefix Fabrik3D/fabrik3d.client run load:signalr`),
run against a disposable Testing-mode orchestrator with MongoDB.

```text
clients=25           connectMs=2056.0   meanConnectMs=82.24
broadcasts=200       messagesReceived=5000   messageWindowMs=4870.8
messagesPerSecond=1027
```

25 concurrent clients connected with a mean of 82 ms each; the server delivered every one of the
5,000 expected messages (200 `JobStateChanged` broadcasts × 25 clients, no loss) over a 4.87 s window
at ~1,027 delivered messages/s.

### Instrumentation overhead

| Measurement | Result | Source |
| --- | --- | --- |
| Metric recording — 200,000 API records | 618.2 ms, **323,510 records/s** | `ObservabilityPerformanceTests` |
| Metric recording — 200,000 signal updates | 29.5 ms, **6,775,183 updates/s** | `ObservabilityPerformanceTests` |
| Client frame sampling — 100,000 frames | 9.7 ms, **~10.3M frames/s** | `frameMetrics.performance.test.ts` |

### WebGL frame time (headless browsers, software rendering)

`Fabrik3D/fabrik3d.client/e2e/perf.spec.ts` records real `requestAnimationFrame` intervals while the
reference scene renders:

```text
Chromium:  frames=11   mean=278.77ms  p50=283.30ms  p95=316.60ms  max=316.60ms   (~3.6 fps)
WebKit:    frames=103  mean=29.17ms   p50=27.00ms   p95=40.00ms   max=50.00ms     (~34 fps)
Firefox:   render + measurement passed (page console line not forwarded by the runner)
```

These are **software-rendering upper bounds for CI**, not GPU results; they are the worst case for the
documented reference scene and will be far faster on hardware-accelerated browsers. The scenario only
requires the scene to keep rendering; it is not a latency budget. The per-engine accessibility matrix
and versions are in [BROWSER_SUPPORT.md](./BROWSER_SUPPORT.md).

## Measurements recorded by earlier sprints

| Dimension | Measured result | Source sprint |
| --- | --- | --- |
| Signal update throughput | 20,000 deterministic updates in 15 ms → **1,298,853 updates/s** | S33 |
| Telemetry rate (MQTT, real fixture) | 100 messages in 114 ms → **~876 accepted/s** | S34 |
| Historian writes | 20,000 samples in 839 ms → **23,842 samples/s** | S40 |
| Historian query latency | p95 **18.2 ms** (p50 9.1 ms, max 106 ms), bound p95 < 500 ms | S40 |
| Time-travel reconstruction | 200 reconstructions of a 5,000-record + 1,000-trajectory window in **6.09 ms each** | S41 (re-run S49) |
| Mapping validation/serialization | 500 mappings validated + serialized in **8.9 ms** | S37 (re-run S49) |
| Instructor metrics query | mean **219.2 ms**, p95 **344.8 ms**, max 471.4 ms (100 sessions × 5 actions) | S45 |
| CNC visual geometry budget | meshes **28**, triangles **764**, draw calls **28**, textures **0** | S39 |
| Repeated scene load | 25 build/dispose cycles produced identical resource counts | S39 |
| Closed loop — Modbus showcase | end-to-end latency **468.52 ms** | S46 |
| Closed loop — OPC UA showcase | end-to-end latency **36.68 ms** | S47 |
| Idle stack memory (Docker, healthy) | orchestrator **68.09 MiB** / 0.46% CPU, simulator 12.36 MiB, HMI 12.43 MiB, MongoDB 205.3 MiB | S48 |

## Budgets and deviations

- Historian query p95 budget is `< 500 ms` (recorded p95 18.2 ms; instructor aggregation p95 344.8 ms
  within budget). Both are measured, and the SQL/Mongo indexes backing them are asserted by tests.
- Validator and geometry budgets are regression guards with generous bounds; no regression introduced
  by S49 instrumentation was observed (all measured values unchanged or within the recorded bounds).
- No registered budget is exceeded. There is no throughput SLA for the product; the numbers above are
  reference observations for a training-center demonstration size, not capacity planning input.

## Reproduce

```powershell
# Instrumentation micro-benchmarks (no Docker)
dotnet test Fabrik3D/Fabrik3D.Server.Tests/Fabrik3D.Server.Tests.csproj --filter "FullyQualifiedName~ObservabilityPerformanceTests" --logger "console;verbosity=detailed"

# Client micro-benchmarks
npm --prefix Fabrik3D/fabrik3d.client run test -- src/observability/performance --reporter=verbose --disable-console-intercept

# Browser frame time (headless Chromium)
npm --prefix Fabrik3D/fabrik3d.client run build
npm --prefix Fabrik3D/fabrik3d.client exec -- playwright test e2e/perf.spec.ts

# Concurrent SignalR clients (start a Testing-mode orchestrator + MongoDB first)
npm --prefix Fabrik3D/fabrik3d.client run load:signalr
```

## Limitations

- No long-duration soak (>1 hour) was run in this environment; the client sampler is bounded and the
  collector cardinality is bounded, so sustained runs cannot grow memory without limit, but a
  dedicated soak is recommended before any production claim.
- Browser frame time was measured headless (software rendering); GPU vendor numbers are not recorded.
- The SignalR harness runs on a single host; multi-host network effects are not measured.
