# Performance and load validation

Status: **measurements recorded (S49), extended with honestly-classified acceleration, larger load
and soak tooling (S56)**. This document records measured numbers, the reference hardware/browser and
the methodology. Numbers from earlier sprints are cited with their source; they were not re-measured
in S56. Nothing here is a certification or a capacity guarantee.

S56 adds three things this document now describes:

1. a machine-readable run result that records the **observed renderer identity** and labels every run
   `hardware`, `software` or `unknown` — software/headless numbers are never presented as GPU results;
2. 50-client (and conditional 100-client) SignalR load measurement plus a bounded reconnect storm;
3. a CI short soak that detects resource growth, and a documented 4–8 hour manual reference soak.

The failure/recovery behavior that these measurements exercise is specified in
[RECOVERY_MATRIX.md](./RECOVERY_MATRIX.md).

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

## S56 harnesses, acceleration classification and budgets

### Honest acceleration classification

The simulator reads the WebGL renderer identity (`gl.VENDOR`/`gl.RENDERER` and, when the browser
exposes it, `WEBGL_debug_renderer_info`) and classifies it in
`fabrik3d.client/src/observability/acceleration.ts`:

| Class | Meaning | Examples of markers |
| --- | --- | --- |
| `hardware` | A known GPU vendor or hardware graphics API string | `NVIDIA`, `GeForce`, `Radeon`, `Intel UHD`, `Apple M`, `Direct3D11`, `Metal`, `Vulkan` |
| `software` | A software rasterizer, even when wrapped in ANGLE | `SwiftShader`, `llvmpipe`, `Microsoft Basic Render`, `software rasterizer` |
| `unknown` | No identity, an empty identity or an unrecognised string | anything else — **never** upgraded to `hardware` |

Every run result (`fabrik3d.client/src/observability/performanceBudget.ts`, schema `1.0`) stores
`recordedAt`, runtime, browser, renderer string, raw renderer identity, acceleration class, resolution,
quality profile, hardware class, scene id and deterministic seed. `validatePerformanceRunResult`
rejects a forged `hardware` label that has no renderer identity.

### Load harness at 50 and 100 clients

`Fabrik3D/fabrik3d.client/scripts/signalr-load.mjs` is deterministic (mulberry32 seed) and records
connection latency, delivery-latency percentiles (p50/p95/p99), message loss, a bounded reconnect
storm and process CPU/RSS/heap. It is an evidence script, not an assertion; it writes a JSON result
and exits non-zero on a connection failure.

```powershell
# Start a disposable Development-mode orchestrator + MongoDB first. The harness opens one
# dev-token per client, and the auth rate limiter allows 30/minute/IP by default, so a 50 or
# 100-client run needs the test-only override below (production keeps the default 30):
$env:Authentication__AuthRateLimitPermitLimit = '2000'
# Then, from Fabrik3D/fabrik3d.client:
$env:LOAD_CLIENTS = '50'; node scripts/signalr-load.mjs
$env:LOAD_CLIENTS = '100'; $env:LOAD_JOBS = '50'; $env:LOAD_RECONNECT_CLIENTS = '50'; node scripts/signalr-load.mjs
```

| Run | Clients | Messages received / expected | Loss | mean connect | delivery p95 | delivery p99 | reconnect |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S49 | 25 | 5000 / 5000 | 0 | 82.2 ms | — | — | — |
| S56 | 50 | 5000 / 5000 | 0 | 33.9 ms | 25.0 ms | 41.7 ms | 50 attempted, 0 failed |
| S56 | 100 | 20000 / 20000 | 0 | 29.8 ms | 23.9 ms | 52.5 ms | 50 attempted, 0 failed |

The 100-client run delivered 20,000 of 20,000 messages (seed 1337, 50 jobs, 4 broadcasts each,
~4,595 delivered messages/s) on the recorded reference host. Process CPU stayed below 20 % of one
core for the client harness. This is a single-host measurement; multi-host network effects are out of
scope and the 100-client result is not a capacity guarantee.

### CI short soak

`Fabrik3D/fabrik3d.client/e2e/soak.spec.ts` repeatedly loads scene presets in the reference cell,
forces GC before each sample and asserts that `textureBytes` and `drawCalls` do not grow
(`ResourceLeakDetector`, `fabrik3d.client/src/observability/resourceLeak.ts`). It writes
`test-results/perf/soak.json` (bounded CI artifact) and fails on a `leak` verdict or a JS heap above
300 MB. It is a seconds-long CI guard, not the hours-long reference soak.

### Manual reference soak (4–8 hours)

Prerequisites: a hardware-accelerated browser (verified with
`__fabrik3dDiagnostics.getRendererIdentity()` showing a `hardware` classification), the server and
MongoDB running, and a machine that can stay awake for the run.

1. Start the simulator with diagnostics enabled (`/?diagnostics=1`) and leave the reference cell
   rendering.
2. Sample `__fabrik3dDiagnostics.getSummary()` (heap, texture bytes, draw calls, p95/p99 frame time)
   every 30–60 s for at least 4 hours; force GC before each heap sample.
3. Simultaneously run `npm --prefix Fabrik3D/fabrik3d.client run load:signalr` with
   `LOAD_RECONNECT=true` for the same window.
4. Feed the counter series to `ResourceLeakDetector` and record the verdict.

Acceptance: no `leak` verdict for texture bytes or draw calls; heap stable within the recorded JVM/JS
budget; no unbounded growth in server connections or MongoDB documents. A soak that cannot be
performed on hardware is an explicit HUMAN_REQUIRED evidence item, not a pass.

### Derived regression budgets

The CI budgets are deliberately coarse because CI is software-rendered (headless SwiftShader) and can
run in parallel with other visual tests. Recorded headless means range from 227 ms (S55) to ~1140 ms
(S56, loaded runner); the budget therefore guards against a catastrophic regression (a near-hang), not
against GPU variance:

| Budget | Bound | Rationale |
| --- | --- | --- |
| `meanFrameMs` | ≤ 5000 ms | ~4× the worst recorded software-rendered mean |
| `p95FrameMs` | ≤ 5000 ms | Same order as the mean on a loaded software rasterizer |
| `p99FrameMs` | ≤ 6000 ms | Covers tail jitter in a loaded CI runner |
| soak `textureBytes` / `drawCalls` | no growth verdict | Scene disposal must return to steady state |
| soak JS heap | < 300 MB | Bounded CI runner ceiling |

Hardware-class budgets are only adopted after repeat runs on the documented developer/reference and
mid-range-laptop classes; no untested hardware class is promised. `HARDWARE_CLASSES` in
`performanceBudget.ts` keeps `unknown` as the safe default.

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
| Hero CNC GLB (primary) | meshes **37**, triangles **1 004**, draw calls **37**, textures **0**, **102 676 B** | S55 |
| Hero CNC GLB (lod1) | meshes **25**, triangles **656**, draw calls **25**, **69 200 B** | S55 |
| Hero cell dressing GLB (primary) | meshes **38**, triangles **676**, draw calls **38**, textures **0**, **85 160 B** | S55 |
| Hero cell dressing GLB (lod1) | meshes **30**, triangles **460**, draw calls **30**, **63 752 B** | S55 |
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

# Browser frame time + machine-readable result (headless Chromium)
npm --prefix Fabrik3D/fabrik3d.client run build
npm --prefix Fabrik3D/fabrik3d.client exec -- playwright test e2e/perf.spec.ts

# CI short soak (resource-growth guard; writes test-results/perf/soak.json)
npm --prefix Fabrik3D/fabrik3d.client exec -- playwright test e2e/soak.spec.ts

# Concurrent SignalR clients (start a Testing-mode orchestrator + MongoDB first)
npm --prefix Fabrik3D/fabrik3d.client run load:signalr
```

## Limitations

- No 4–8 hour soak was executed in this repository environment; the CI short soak is only a
  seconds-long guard. The long soak is a documented manual procedure (above) and its result is a
  human-required evidence item until performed.
- Browser frame time in CI is measured headless (software rendering). It is labelled `software` or
  `unknown`, never `hardware`; GPU vendor numbers are not recorded here and must not be inferred.
- The SignalR harness runs on a single host; multi-host network effects are not measured, and the
  100-client point is conditional on the host.
- Budgets are soft regression guards for CI, not an SLA or a capacity-planning input.
