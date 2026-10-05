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

`Fabrik3D/fabrik3d.client/e2e/soak.spec.ts` repeatedly loads scene presets (the
reference cell and, since S58, the material-flow scenarios, all of which now
render WebGL) and returns to the reference cell, forces GC before each sample and
asserts that `textureBytes` and `drawCalls` do not grow (`ResourceLeakDetector`,
`fabrik3d.client/src/observability/resourceLeak.ts`). It writes
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

## S62 manual hardware GPU benchmark

S56 already records renderer identity, acceleration class and frame percentiles. S62 adds a
**separate, manually runnable** benchmark that measures the full metric set on a real GPU and
classifies the evidence honestly. It is not part of the mandatory visual gate.

```powershell
# Real GPU (headed browser): writes test-results/perf/gpu-benchmark.json
npm --prefix Fabrik3D/fabrik3d.client run benchmark:gpu

# Software upper bound (headless SwiftShader), same schema and profiles
npm --prefix Fabrik3D/fabrik3d.client exec -- playwright test --config=playwright.benchmark.config.ts
```

Profiles map to the simulator quality presets: **Performance** → `low`, **Balanced** → `medium`,
**Quality** → `high`. An unsupported profile falls back to a supported measured profile and records
the fallback. Each run records renderer, resolution, requested/resolved profile, FPS, frame
p50/p95/p99, draw calls, triangles, texture count, estimated GPU texture bytes (WebGL exposes no
total GPU memory), JS heap (`heapUsedBytes` where the browser exposes it), and wall-clock load
duration. The report schema (`fabrik3d.client/src/observability/gpuBenchmark.ts`,
`schemaVersion 1.0`) refuses to label software or unidentified renderers as GPU evidence.

Scenes: the hero CNC cell (`cnc-machine-tending`) and the most complex secondary cell
(`robot-palletizing`, 40 draw calls / 15 equipment per the S59 measurements).

### Recorded S62 result — real GPU (Intel UHD Graphics, headed Chromium)

Renderer: `ANGLE (Intel, Intel(R) UHD Graphics (0x0000A7A8) Direct3D11 vs_5_0 ps_5_0, D3D11)`,
resolution 1920×1080, `acceleration=hardware`, `gpuEvidence=true`.

| Scene | Profile | FPS | p50 | p95 | p99 | draw calls | triangles | textures | JS heap | load |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CNC machine tending | Performance | 154.5 | 6.10 ms | 10.40 ms | 12.00 ms | 414 | 9 528 | 0 | 19.0 MB | 2 260 ms |
| CNC machine tending | Balanced | 135.7 | 6.90 ms | 9.96 ms | 13.08 ms | 466 | 13 500 | 0 | 18.1 MB | 1 243 ms |
| CNC machine tending | Quality | 103.6 | 9.90 ms | 12.60 ms | 14.59 ms | 466 | 13 500 | 0 | 23.8 MB | 1 199 ms |
| Robot palletizing | Performance | 133.7 | 6.20 ms | 13.37 ms | 15.69 ms | 42 | 534 | 0 | 36.6 MB | 960 ms |
| Robot palletizing | Balanced | 145.7 | 6.10 ms | 11.60 ms | 14.98 ms | 42 | 534 | 0 | 43.1 MB | 996 ms |
| Robot palletizing | Quality | 132.1 | 7.30 ms | 9.60 ms | 10.20 ms | 42 | 534 | 0 | 42.0 MB | 1 053 ms |

The same command run headless (SwiftShader) records identical fields with `acceleration=software`
and `gpuEvidence=false`; those numbers are a CI upper bound and are **not** GPU results. A report
whose runs are not all `hardware` with a renderer identity is rejected by
`validateGpuBenchmarkReport`.

### Benchmark non-claims

- The JS heap is **not** GPU memory; WebGL does not expose total GPU memory. `textureBytes` is the
  documented texture estimate and is 0 when the scene uses no textures.
- These are single headed runs on the documented developer-reference host; they are reference
  observations, not an SLA, and no untested hardware class is promised.
- CSV/JSON benchmark output contains only renderer strings and counters; it never includes tokens,
  secrets or machine-identifying personal data.
- Benchmark result schema validation and acceleration classification are covered by unit tests
  (`src/observability/gpuBenchmark.test.ts`).

## S68 PBR material/environment re-measurement

S68 added the shared PBR material vocabulary and the coherent factory
environment. The S62 manual hardware benchmark was re-run on the same documented
reference machine with the same command and the same scenes:

```powershell
npm --prefix Fabrik3D/fabrik3d.client run benchmark:gpu
# -> writes test-results/perf/gpu-benchmark.json
```

Renderer: `ANGLE (Intel, Intel(R) UHD Graphics (0x0000A7A8) Direct3D11 vs_5_0 ps_5_0, D3D11)`,
resolution 1920×1080, `acceleration=hardware`, `gpuEvidence=true`, headed
Chromium, 2026-10-02.

| Scene | Profile | FPS | p50 | p95 | p99 | draw calls | triangles | textures | load |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CNC machine tending | Performance | 128.8 | 7.30 ms | 11.10 ms | 12.12 ms | 435 | 9 780 | 0 | 2 523 ms |
| CNC machine tending | Balanced | 109.9 | 9.20 ms | 11.20 ms | 12.74 ms | 487 | 13 752 | 0 | 1 504 ms |
| CNC machine tending | Quality | 78.3 | 12.50 ms | 16.00 ms | 22.73 ms | 487 | 13 752 | 0 | 1 066 ms |
| Robot palletizing | Performance | 133.5 | 7.30 ms | 9.70 ms | 10.89 ms | 164 | 3 732 | 0 | 1 743 ms |
| Robot palletizing | Balanced | 123.7 | 7.90 ms | 10.40 ms | 11.30 ms | 164 | 3 732 | 0 | 1 620 ms |
| Robot palletizing | Quality | 104.3 | 9.70 ms | 11.53 ms | 12.56 ms | 164 | 3 732 | 0 | 1 440 ms |

The 60 FPS reference target is satisfied on every measured profile; the minimum
measured FPS is **78.3** (CNC, Quality). All runs report **0 textures** and
`gpuEvidence=true`.

Comparison with the S62 (Revision 3) table above:

- The CNC cell moved from 414/466/466 draw calls and 9 528/13 500/13 500
  triangles (S62) to 435/487/487 draw calls and 9 780/13 752/13 752 triangles.
  The delta is the S68 environment/marking layer on top of the same hero asset
  (the S68 builder alone measures 54 meshes / 638 triangles / 54 draw calls /
  0 textures, GPU-free).
- Robot palletizing moved from 42 draw calls / 534 triangles (S62, procedural
  visuals) to 164 / 3 732. That increase is the accumulated Revision 4 visual
  work already in the tree — S65 generated GLB scenario equipment, S66 robot
  motion and S67 process stages — not S68 alone; S68's own contribution is the
  bounded environment above plus material reassignment of the same meshes.
- No measured profile regressed below the reference target, so no throttling,
  LOD or environment rollback was required.

The same benchmark run headless is classified `software`/`gpuEvidence=false` and
is never presented as a GPU result; the CI visual suite (software rendering)
still passes deterministically and the soak reports flat draw calls
(`487`) and texture bytes (`0`) across repeated scene loads. These are the S68
numbers and predate the S72 procedural surfaces below.

## S72 procedural surface and grounding re-measurement

S72 adds deterministic procedural surface maps and equipment grounding. The
renderer configuration, lighting and ACES/sRGB pipeline are unchanged. GPU-free,
deterministic measurements (`measureSceneResources` +
`estimateSceneTextureMemory`, RGBA8 base-level estimate) are recorded by the
client tests:

| Visual | Meshes | Triangles | Draw calls | Textures | Texture bytes |
| --- | --- | --- | --- | --- | --- |
| Factory environment (industrial-hall) | 54 | 638 | 54 | 5 | 1 048 576 |
| Procedural hero CNC visual | 28 | 764 | 28 | 4 | 851 968 |
| Scenario `sorting-normal-cycle` | 89 | 1 208 | 89 | 8 | 1 572 864 |
| Scenario `palletizing-normal-cycle` | 125 | 1 652 | 125 | 8 | 1 441 792 |
| Scenario `assembly-inspection-cycle` | 96 | 1 282 | 96 | 8 | 1 572 864 |
| Scenario `safety-door-recovery` | 55 | 1 008 | 55 | 5 | 851 968 |

The whole 14-surface library estimates to **2 179 072 bytes (2.08 MiB)** and its
documented budget is 256 px maximum, 14 textures and 4 MiB, so every measured
scene stays inside budget. These counts include the per-equipment contact decal
(one shared texture, one mesh per equipment root) and are recorded with the GLB
packages offline, so they describe the procedural fallback path.

The S62/S68 manual hardware benchmark command was re-run for the S72 build on the
same documented reference machine (headed Chromium, 1920×1080,
`acceleration=hardware`, `gpuEvidence=true`, 2026-10-03), writing
`test-results/perf/gpu-benchmark.json`:

| Scene | Profile | FPS | p50 | p95 | p99 | draw calls | triangles | textures | texture bytes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CNC machine tending | Performance | 162.7 | 6.10 ms | 7.40 ms | 9.66 ms | 462 | 10 084 | 8 | 1 376 256 |
| CNC machine tending | Balanced | 114.7 | 8.30 ms | 13.07 ms | 16.75 ms | 514 | 14 056 | 8 | 1 376 256 |
| CNC machine tending | Quality | 108.3 | 9.10 ms | 11.26 ms | 11.97 ms | 514 | 14 056 | 8 | 1 376 256 |
| Robot palletizing | Performance | 136.9 | 6.10 ms | 13.14 ms | 16.66 ms | 185 | 3 834 | 6 | 1 114 112 |
| Robot palletizing | Balanced | 159.6 | 6.00 ms | 7.30 ms | 13.06 ms | 185 | 3 834 | 6 | 1 114 112 |
| Robot palletizing | Quality | 118.3 | 8.35 ms | 10.70 ms | 11.40 ms | 185 | 3 834 | 6 | 1 114 112 |

Compared with the S68 table above, S72 adds the bounded procedural surfaces and
the per-equipment contact decals:

- CNC draw calls moved 435/487/487 → 462/514/514 (+27) and triangles
  9 780/13 752/13 752 → 10 084/14 056/14 056 (+304); textures 0 → 8
  (1 376 256 bytes estimated RGBA8). The delta is the environment surface layer
  plus the equipment contact decals.
- Robot palletizing draw calls moved 164 → 185 (+21) and triangles 3 732 → 3 834
  (+102); textures 0 → 6 (1 114 112 bytes).
- Every measured profile stays above the 60 FPS reference target; the minimum
  measured FPS is **108.3** (was 78.3 in S68). The FPS differences are
  single-run observations and partly run-to-run variance, not a guaranteed
  speed-up.

S72 did not change scenario state, robot kinematics, collision, signalling or the
asset loader fallback contract: textures and contact decals are visual-only.

## S74 industrial environment and post-processing re-measurement

S74 replaces the generic neutral `RoomEnvironment` PMREM with a deterministic
industrial-hall environment (procedural softbox PMREM, gradient background,
subtle fog, bounded local lights) and adds an optional, quality-gated
`EffectComposer` path (cheap depth AO + selective bloom + FXAA). Only the
`low`/`medium`/`high` presets already authoritative for the simulator are used.
The post-processing path is **fail-closed**: `low` quality, a missing/WebGL1
context or any non-`hardware` renderer class falls back to the direct
`renderer.render(scene, camera)` path, so the visual baselines in CI (headless
SwiftShader, classified `software`) never exercise the composer.

The S62/S68/S72 manual hardware benchmark command was re-run for the S74 build on
the same documented reference machine (headed Chromium, 1920×1080,
`acceleration=hardware`, `gpuEvidence=true`, 2026-10-03), writing
`test-results/perf/gpu-benchmark.json`:

```powershell
npm --prefix Fabrik3D/fabrik3d.client run benchmark:gpu
```

| Scene | Profile | FPS | p50 | p95 | p99 | draw calls | triangles | textures | texture bytes | load |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CNC machine tending | Performance | 156.1 | 6.10 ms | 10.08 ms | 13.80 ms | 463 | 10 086 | 8 | 1 376 256 | 2 294 ms |
| CNC machine tending | Balanced | 72.9 | 13.60 ms | 15.50 ms | 16.20 ms | 515 | 14 058 | 8 | 1 376 256 | 2 669 ms |
| CNC machine tending | Quality | 63.8 | 15.60 ms | 17.74 ms | 18.64 ms | 515 | 14 058 | 8 | 1 376 256 | 5 477 ms |
| Robot palletizing | Performance | 143.1 | 6.20 ms | 12.55 ms | 14.48 ms | 186 | 3 836 | 6 | 1 114 112 | 4 574 ms |
| Robot palletizing | Balanced | 84.8 | 11.90 ms | 13.91 ms | 14.77 ms | 186 | 3 836 | 6 | 1 114 112 | 1 873 ms |
| Robot palletizing | Quality | 68.7 | 14.50 ms | 16.66 ms | 17.69 ms | 186 | 3 836 | 6 | 1 114 112 | 2 534 ms |

Every measured profile stays above the 60 FPS reference target; the minimum
measured FPS is **63.8** (CNC, Quality). Compared with the S72 table above:

- The geometry is unchanged. The scene beauty pass moved by exactly +1 draw call
  and +2 triangles per run (CNC 462/514/514 → 463/515/515 and
  10 084/14 056/14 056 → 10 086/14 058/14 058; palletizing 185 → 186 and
  3 834 → 3 836): the added count is the single full-screen gradient-background
  quad. The local lights add per-fragment shading cost but no draw calls, so the
  GPU-free geometry tables in [3D_ASSETS.md](../architecture/3D_ASSETS.md) are
  unchanged.
- The composer path costs frame time at Balanced/Quality: CNC FPS moved
  114.7 → 72.9 and 108.3 → 63.8, and palletizing 159.6 → 84.8 and 118.3 → 68.7.
  The Performance (direct-render) path is essentially unchanged (162.7 → 156.1
  and 136.9 → 143.1, i.e. run-to-run variance). The cost is the depth-AO,
  selective-bloom and FXAA passes plus the composer's half-float targets.
- The AO and bloom internal targets run at `renderScale` of the drawing buffer
  (0.45 for both medium and high) while the scene beauty pass and the final
  anti-aliasing stay at full resolution, which is what keeps the cost bounded.
  An earlier `SSAOPass` attempt re-rendered the scene and measured below the
  target, so it was replaced by the depth-buffer AO pass.

These are single-run observations on the documented developer-reference host, not
an SLA. The FPS differences partly reflect run-to-run and thermal variance; only
the classification (`hardware`, `gpuEvidence=true`) and the above-target result
are claims. Headless runs stay `software`/`gpuEvidence=false` and are never
presented as GPU results.

## S75 state-driven motion and instanced detail re-measurement

S75 adds state-driven secondary motion (gripper fingers, belt marker/rollers,
robot-base beacon, bounded dress-pack flex) and raises scene detail through
`InstancedMesh` for repeated static elements plus human-scale dressing props. It
changes no scenario state, robot kinematics, collision, signalling or the
orchestration path.

The S62/S68/S72/S74 manual hardware benchmark command was re-run for the S75
build on the same documented reference machine (headed Chromium, 1920×1080,
`acceleration=hardware`, `gpuEvidence=true`, 2026-10-03), writing
`test-results/perf/gpu-benchmark.json`:

```powershell
npm --prefix Fabrik3D/fabrik3d.client run benchmark:gpu
```

| Scene | Profile | FPS | p50 | p95 | p99 | draw calls | triangles | textures | texture bytes | load |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CNC machine tending | Performance | 164.8 | 6.10 ms | 7.20 ms | 7.80 ms | 435 | 11 610 | 9 | 1 638 400 | 2 607 ms |
| CNC machine tending | Balanced | 71.5 | 14.10 ms | 15.82 ms | 16.38 ms | 487 | 15 582 | 9 | 1 638 400 | 3 231 ms |
| CNC machine tending | Quality | 60.3 | 16.60 ms | 18.19 ms | 18.62 ms | 487 | 15 582 | 9 | 1 638 400 | 5 486 ms |
| Robot palletizing | Performance | 140.2 | 6.20 ms | 12.80 ms | 16.00 ms | 166 | 5 348 | 7 | 1 376 256 | 4 408 ms |
| Robot palletizing | Balanced | 83.5 | 12.10 ms | 14.00 ms | 14.70 ms | 166 | 5 348 | 7 | 1 376 256 | 1 879 ms |
| Robot palletizing | Quality | 68.5 | 14.60 ms | 17.04 ms | 17.59 ms | 166 | 5 348 | 7 | 1 376 256 | 4 039 ms |

Every measured profile stays above the 60 FPS reference target; the minimum
measured FPS is **60.3** (CNC, Quality). Compared with the S74 table above:

- The CNC reference cell gains the human-scale dressing and the instanced
  environment families; the palletizing cell gains the same environment detail.
  The repeated expansion joints, access-lane ticks and cable-tray rungs are one
  `InstancedMesh` per family, so the added dressing does not multiply draw calls.
- The GPU-free per-cell geometry is recorded in
  [SCENARIO_3D_RUNTIME.md](../architecture/SCENARIO_3D_RUNTIME.md): 76–108 meshes /
  2 396–2 824 triangles / 76–108 draw calls per material-flow cell, inside the
  documented `< 200` draw-call budget.
- The state-driven motion is applied on the deterministic simulation clock, not
  per render frame, so it adds no per-frame allocation.

These are single-run observations on the documented developer-reference host, not
an SLA. Only the classification (`hardware`, `gpuEvidence=true`) and the
above-target result are claims. Headless runs stay `software`/`gpuEvidence=false`
and are never presented as GPU results.

## S76 Revision 5 validation re-measurement

S76 adds no rendering code: it re-runs the S62/S68/S72/S74/S75 manual hardware
benchmark on the final Revision 5 build so the release validation records a fresh,
reproducible Revision 4 → Revision 5 comparison. Command and host are unchanged
(headed Chromium, 1920×1080, `acceleration=hardware`, `gpuEvidence=true`,
2026-10-03), writing `test-results/perf/gpu-benchmark.json`:

```powershell
npm --prefix Fabrik3D/fabrik3d.client run benchmark:gpu
```

| Scene | Profile | FPS | p50 | p95 | p99 | draw calls | triangles | textures | texture bytes | load |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CNC machine tending | Performance | 157.4 | 6.10 ms | 8.73 ms | 10.35 ms | 435 | 11 610 | 9 | 1 638 400 | 3 526 ms |
| CNC machine tending | Balanced | 63.8 | 15.50 ms | 18.60 ms | 20.51 ms | 487 | 15 582 | 9 | 1 638 400 | 2 956 ms |
| CNC machine tending | Quality | 58.1 | 17.20 ms | 19.46 ms | 20.77 ms | 487 | 15 582 | 9 | 1 638 400 | 3 540 ms |
| Robot palletizing | Performance | 150.5 | 6.20 ms | 10.00 ms | 13.00 ms | 166 | 5 348 | 7 | 1 376 256 | 5 022 ms |
| Robot palletizing | Balanced | 77.6 | 12.70 ms | 15.63 ms | 17.83 ms | 166 | 5 348 | 7 | 1 376 256 | 1 732 ms |
| Robot palletizing | Quality | 63.7 | 15.60 ms | 18.30 ms | 19.35 ms | 166 | 5 348 | 7 | 1 376 256 | 3 507 ms |

Compared with the Revision 4 baseline (S71 table in
[VALIDATION_REVISION_4.md](VALIDATION_REVISION_4.md), same host/browser):

- **No blanket improvement is claimed.** The `Performance` (direct-render) profiles
  stay within a few percent of Revision 4 or improve slightly: CNC 148.5 → 157.4
  FPS with better p95/p99, palletizing 143.4 → 150.5 FPS with better p95/p99.
- The `Balanced`/`Quality` profiles are measurably slower (CNC 153.5 → 63.8 and
  110.6 → 58.1; palletizing 162.2 → 77.6 and 119.9 → 63.7) because the S74
  quality-gated composer path is active there. This is the intended fidelity cost
  documented in the S74 section above, not an optimization regression.
- **On this run five of six profiles meet the 60 FPS reference target; CNC Quality
  is 58.1 FPS, marginally below it.** The S75 run of the same code recorded CNC
  Quality at 60.3 FPS, so the border is within run-to-run/thermal variance and is
  reported as such rather than rounded up.
- Draw calls decrease slightly (CNC 460 → 435 low, 512 → 487 medium/high;
  palletizing 170 → 166) because S75 instances repeated environment elements.
- Triangles increase by design (CNC low 10 080 → 11 610, medium/high
  14 052 → 15 582; palletizing 3 804 → 5 348) with the S72 surface detail, S73
  assembled modules and S75 instancing/motion detail.
- Texture memory is no longer zero: S72's in-code procedural surface maps record
  9 textures / 1 638 400 bytes (CNC) and 7 / 1 376 256 bytes (palletizing) versus
  0 textures in Revision 4. No image file or external texture license is
  introduced.

These remain single-run observations on the documented developer-reference host,
not an SLA. Headless runs stay `software`/`gpuEvidence=false` and are never
presented as GPU results.

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
| S59 scenario cells (procedural, GPU-free) | sorting 11 equipment / 480 tri / 27 calls; palletizing 15 / 532 / 40; assembly 12 / 476 / 31; safety 11 / 660 / 29; textures 0 | S59 |
| S60 robot GLB (primary, all three sizes) | meshes **58**, triangles **4 640**, draw calls **58**, textures **0**, ≈**259 200 B** | S60 |
| S60 robot GLB (lod1) | meshes **42**, triangles **1 656**, draw calls **42**, ≈**132 000 B** | S60 |
| S60 hero CNC GLB (primary) | meshes **69**, triangles **1 608**, draw calls **69**, textures **0**, **174 700 B** | S60 |
| S60 hero CNC GLB (lod1) | meshes **33**, triangles **620**, draw calls **33**, **77 164 B** | S60 |
| S60 hero cell dressing GLB (primary) | meshes **62**, triangles **1 064**, draw calls **62**, textures **0**, **136 032 B** | S60 |
| S60 hero cell dressing GLB (lod1) | meshes **30**, triangles **460**, draw calls **30**, **63 752 B** | S60 |
| Hero CNC/dressing GLB (S55 baseline) | CNC 37 / 1 004 / 37 / 102 676 B and lod1 25 / 656 / 25 / 69 200 B; dressing 38 / 676 / 38 / 85 160 B and lod1 30 / 460 / 30 / 63 752 B | S55 |
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
- CI browser frame time is measured headless (software rendering) and is labelled `software` or
  `unknown`, never `hardware`. Hardware GPU numbers are recorded here only from the explicit headed
  benchmark runs on the documented reference host (S62/S68/S72/S74/S75/S76) and apply to that host only; they
  must not be inferred for other hardware or from geometry counts.
- The SignalR harness runs on a single host; multi-host network effects are not measured, and the
  100-client point is conditional on the host.
- Budgets are soft regression guards for CI, not an SLA or a capacity-planning input.
