# Fabrik3D Revision 5 validation evidence

This document is the validation record for **Roadmap Revision 5 (S72–S76)**: procedural license-safe
surface textures and equipment grounding, anchor-driven modular assembly with a versioned cell-file
migration, industrial lighting/atmosphere with a quality-gated post-processing fallback, state-driven
equipment motion with instanced scene detail, and the measured release-candidate validation. It is
deliberately separate from, and does not modify, the immutable 1.0 (S50) record, the post-1.0
(S51–S57) record, the Revision 3 (S58–S64) record or the Revision 4 (S65–S71) record:

- 1.0 baseline: [VALIDATION_1.0.md](VALIDATION_1.0.md)
- Post-1.0 (S51–S57): [VALIDATION_POST_1.0.md](VALIDATION_POST_1.0.md)
- Revision 3 (S58–S64): [VALIDATION_REVISION_3.md](VALIDATION_REVISION_3.md)
- Revision 4 (S65–S71): [VALIDATION_REVISION_4.md](VALIDATION_REVISION_4.md)
- Release preparation: [RELEASE_PREPARATION_REVISION_5.md](RELEASE_PREPARATION_REVISION_5.md)
- Release notes: [RELEASE_NOTES_REVISION_5.md](../releases/RELEASE_NOTES_REVISION_5.md)
- Flagship runbook: [FLAGSHIP_DEMO.md](FLAGSHIP_DEMO.md)

Every transcript below is a real command executed on this workstation on **2026-10-03**
(Windows 10.0.26200, .NET SDK building `net8.0`, Node.js, Docker with a local MongoDB on 27017).
Nothing is estimated; skipped or deferred items are stated explicitly.

## Evidence classification

Every claim carries one of these labels. They are never merged:

| Label | Meaning |
| --- | --- |
| **Automated** | Produced by a committed test or gate command that runs unattended. |
| **Visual** | Deterministic screenshot capture / visual-regression comparison. |
| **Hardware benchmark** | Measured on a real GPU with the acceleration class recorded. |
| **Fixture** | Produced by a deterministic in-repository substitute (real transport, simulated peer), never vendor software. |
| **Manual** | A documented human procedure, executed or not as stated. |
| **Deferred real PLC** | Explicitly out of scope until licensed software/hardware is available. |

## Repository baseline (automated)

```text
npm run sprint:validate
  -> [sprint] Roadmap validation passed: 76 sprints, 75 completed, active=S76

dotnet build Fabrik3D/Fabrik3D.slnx
  -> 0 errors (4 pre-existing npm dev-dependency advisories surfaced as warnings)

dotnet test Fabrik3D/Fabrik3D.slnx --no-build
  -> Fabrik3D.Contracts.Tests                  5 passed, 0 failed
     Fabrik3D.Infrastructure.IntegrationTests  16 passed, 0 failed (MongoDB Testcontainer)
     Fabrik3D.Server.Tests                    576 passed, 0 failed
     total 597 passed, 0 failed
  (the first run hit transient Testcontainers/Docker named-pipe timeouts under contention; the rerun
   with no code change passed 597/597 — the same known environment behaviour recorded in S65/S69)

npm run contracts:check
  (the real Fabrik3D.ServerTaskManager host, Development on 127.0.0.1:7249 against a disposable
   MongoDB database Fabrik3D_S76_Contracts, swagger polled, server stopped and port released)
  -> [contracts] verified from http://127.0.0.1:7249/swagger/v1/swagger.json  (exit 0)

npm run docs:check
  -> passed: 32 required documents present, 531 links resolved

npm --prefix Fabrik3D/fabrik3d.client run type-check  -> exit 0
npm --prefix Fabrik3D/fabrik3d.client run test        -> 150 files, 869 passed
npm --prefix Fabrik3D/fabrik3d.client run build       -> exit 0
npm --prefix Fabrik3D/fabrik3d.client run test:visual -> 44 passed (9.6m)

npm --prefix Fabrik3D/fabrik3d.hmi run type-check  -> exit 0
npm --prefix Fabrik3D/fabrik3d.hmi run test        -> 29 files, 123 passed
npm --prefix Fabrik3D/fabrik3d.hmi run build       -> exit 0
npm --prefix Fabrik3D/fabrik3d.hmi run test:e2e    -> 24 passed, 0 failed
  (live Testing orchestrator on 127.0.0.1:7249 with a disposable MongoDB database Fabrik3D_S76_E2E)

npm run audit              -> SIMULATOR: 4 high advisories, all in the dev-only
                              @vue/eslint-config-typescript → fast-glob → micromatch → braces chain
                              (GHSA-vfj7-8cjw-p6xm, no patched version; pre-existing, no dependency file
                              changed by Revision 5)
                              HMI: 0 vulnerabilities
                              NUGET: no vulnerable packages (Contracts, Domain, Infrastructure,
                              ServerTaskManager)
npm run security:scan      -> Security check passed (1416 file(s) checked)
npm run repo:policy        -> passed: 1416 file(s) checked (mode=tracked)
npm run repo:policy:changed-> passed: 113 file(s) checked (mode=changed)
node scripts/lifecycle/verify-config.mjs -> passed for Fabrik3D/compose.production.yaml
docker compose -f Fabrik3D/compose.production.yaml config --quiet -> exit 0
```

Environment caveats observed while validating (reported, not attributed to S76):

- The `scripts/tests/autopilot-wiring.test.mjs` autopilot-state assertions and the three
  `scripts/tests/sprint-batch-runner.test.mjs` stdout assertions are **state-dependent when the suite
  runs inside the batch worker**: this session inherits `FABRIK3D_BATCH_CHILD=1`, which makes the
  spawned batch runner quiet, and `docs/roadmap/autopilot/state.json` is still the live running batch
  state until the parent orchestrator finalizes it. With `FABRIK3D_BATCH_CHILD` unset,
  `scripts/tests/sprint-batch-runner.test.mjs` passes **21/21**; the autopilot-wiring assertions
  resolve once the parent orchestrator writes the terminal `roadmap_complete` state. The four-file
  documentation/coherence/policy/security subset used as the S76 gate passes **22/22**.
- The first `dotnet test` run hit transient Testcontainers/Docker named-pipe timeouts under host
  contention (a stale `kairo-release-gate` / `fabrik3d` demo stack was also running); the rerun with no
  code change passed **597/597**.

## Flagship execution captures (visual, S76)

The Revision 5 validation must show **execution, not idle cells**, for all five flagship scenarios with
the S72–S75 visuals active. S76 adds `demo-12-revision5-flagship.spec.ts`, which reuses the authoritative
S67 `?stage=<stageId>` capture hook on `MaterialFlowScenarioHost` and the S62 deterministic visual
protocol but forces the `quality=high` preset so the industrial environment, local lights and the
quality-gated composer path are part of the captured frame. It adds no timeline engine and never mutates
scenario truth outside the authoritative process driver. Output is written to a distinct
`execution-revision5/` directory so the committed Revision 4 stills stay intact. The CNC reference cell
shows its deterministic local execution; its HMI → server → simulator → historian workflow is proven
separately by the automated tests below.

```text
npm --prefix Fabrik3D/fabrik3d.client run build
npm --prefix Fabrik3D/fabrik3d.client run preview -- --host 127.0.0.1 --port 4173 --strictPort
npx playwright test --config=playwright.demo.config.ts demo-12-revision5-flagship.spec.ts --workers=1
  -> 21 passed (10.6m)
```

Each capture resets, seeds the deterministic visual protocol, selects the scenario, waits for the
equipment binding and asserts `data-execution-stage-reached="true"` plus the exact
`data-execution-stage-id` before freezing and capturing, so an unreached stage fails closed instead of
capturing an arbitrary frame. The captures are committed demo media, not byte-compared visual-regression
baselines: re-running the spec reproduces every stage and every assertion, while individual PNG bytes may
vary by a few hundred bytes because the freeze happens after real render frames. They are reproducible,
never fabricated.

| Scenario | Declared stages captured |
| --- | --- |
| Palletizing | `palletizing-robot-approach`, `palletizing-pick`, `palletizing-transfer`, `palletizing-place`, `palletizing-layer-update` |
| Vision sorting | `vision-part-enters`, `vision-inspection-begins`, `vision-classified`, `vision-diverter-actuates`, `vision-part-routes` |
| Assembly / inspection | `assembly-robot-load`, `assembly-fixture-clamp`, `assembly-inspection`, `assembly-decision-accept`, `assembly-unclamp` |
| Safety training | `safety-unsafe-state`, `safety-detection`, `safety-motion-inhibited`, `safety-state-restored`, `safety-operator-acknowledged` |
| CNC | `cnc-cell-running` (deterministic local execution, `quality=high`) |

The 21 stills live under
[`artifacts/demo/flagship/execution-revision5/`](../../artifacts/demo/flagship/execution-revision5/) and
are listed in [`artifacts/demo/flagship/README.md`](../../artifacts/demo/flagship/README.md). The capture
hook remains covered at the unit level by `scenarioStageCapture.test.ts` (ordered targets, monotonic step
counts, declared fault/recovery points, fail-closed unknown stage) and by `MaterialFlowScenarioHost.test.ts`
(drives to a requested stage, fails closed for an unknown stage).

## Automated flagship workflow proof (CNC)

The deterministic flagship demonstration follows the documented workflow with the server as the
orchestration authority and **no simulator-local Start**:

```text
HMI → New Job → scenario/cell/pallet → Create → Start → server targeted dispatch →
simulator ACK → 3D execution starts automatically → robot/CNC/conveyor → live HMI →
fault/recovery → Job 100 % → Completed → historian/time travel
```

```text
dotnet test Fabrik3D/Fabrik3D.slnx --no-build   (includes the flagship tests)
  -> FlagshipWorkflowIntegrationTests  [passed]
     FlagshipDemoHistorianTests        [passed]

npm --prefix Fabrik3D/fabrik3d.hmi run test:e2e   (orchestrator-api project, live Testing server)
  -> flagship demo: HMI composer job → dispatch → simulator ACK → execution → completion [passed]
     flagship demo: execution cannot begin without the assigned simulator acknowledgement [passed]

Fabrik3D/fabrik3d.client/src/services/simulatorOrchestrationBridge.test.ts
  -> refuses a local production start while orchestrated [passed]
```

- **Job creation/composition** is server-side (`JobComposerService`); the HMI submits a validated
  definition and the server generates the deterministic pallet-slot tasks.
- **Start/dispatch** is server-authoritative (`DispatchService.StartDispatchAsync`): one compatible
  target, one session, a targeted `ExecutionDispatchRequested` event and correlation id.
- **The simulator ACK is mandatory.** Dispatch state is `Pending` until the assigned simulator
  acknowledges (`Acknowledged → Running`); a foreign simulator is rejected `409`, and dispatching an
  unavailable target fails closed without starting the job.
- **No simulator-local Start.** In orchestrated mode the local Start function is never called and
  execution is driven only by the server dispatch; the offline local demo remains clearly separated and
  never writes simulated execution state to the server.
- **Execution, fault/recovery and completion** are driven by the deterministic cell/fixture loop and the
  server's task/session reports, ending in `Completed`, `progressPercent = 100`.
- **Historian/time travel.** `FlagshipDemoHistorianTests` records the completed run in a real
  MongoDB-backed historian (telemetry and events with session/source/quality/timestamp/correlation
  preserved, newest-first and read-only) and reads it back. Client historian → time-travel
  reconstruction is covered by the client `time-travel*` suites.

## Visual evidence (deterministic)

```text
npm --prefix Fabrik3D/fabrik3d.client run test:visual -> 44 passed
  (CNC cell overview/operator/workcell, vision sorting, palletizing overview/operator/workcell,
   assembly, safety training, CNC/palletizing low+high quality, mapping studio, signal inspector,
   fault lab, time travel, cell editor, robot catalog, soak)
npm --prefix Fabrik3D/fabrik3d.hmi run test:e2e -> 24 passed
  (rendered HMI design-system, accessibility and operator visual baselines)
```

The curated Revision 3/4 flagship media set — hero CNC cell, four scenario cells, HMI surfaces, fault
lab, time travel, the 21 Revision 4 execution-stage stills and the new 21 Revision 5 `quality=high`
execution-stage stills — is committed under
[`artifacts/demo/flagship/`](../../artifacts/demo/flagship/README.md) with provenance. Still-image
captures use software or captured rendering and are **not** presented as GPU evidence.

## GPU-free per-cell scenario metrics (automated)

`src/scenarios/scenarioRuntimeMetrics.test.ts` records the per-cell geometry budget on the four
material-flow flagship cells (`test-results/perf/scenario-runtime-metrics.json`, recorded after the S75
instancing work, unchanged by S76):

| Cell | meshes | triangles | draw calls | textures | texture bytes | load ms |
| --- | --- | --- | --- | --- | --- | --- |
| Vision sorting | 82 | 2 396 | 82 | 8 | 1 572 864 | 61.6 |
| Palletizing | 108 | 2 824 | 108 | 8 | 1 441 792 | 8.8 |
| Assembly / inspection | 87 | 2 498 | 87 | 8 | 1 572 864 | 5.9 |
| Safety training | 76 | 2 584 | 76 | 5 | 851 968 | 11.2 |

Every cell stays under the documented 200 draw-call budget. These are GPU-free harness numbers and are
never presented as a hardware FPS claim.

## Hardware benchmark evidence (S76, Revision 5)

Re-run after the final Revision 5 visuals and validated on real hardware:

```text
npm --prefix Fabrik3D/fabrik3d.client run benchmark:gpu
  -> 6 run(s) acceleration=hardware gpuEvidence=true
     renderer: ANGLE (Intel, Intel(R) UHD Graphics (0x0000A7A8) Direct3D11 vs_5_0 ps_5_0, D3D11)
     resolution: 1920x1080
     artifact: Fabrik3D/fabrik3d.client/test-results/perf/gpu-benchmark.json
```

Revision 5 measurements (recorded 2026-10-03T09:51Z):

| Scene / quality | FPS | p50 ms | p95 ms | p99 ms | draws | tris | textures | texture bytes | load ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CNC Performance | 157.4 | 6.10 | 8.73 | 10.35 | 435 | 11 610 | 9 | 1 638 400 | 3 526 |
| CNC Balanced | 63.8 | 15.50 | 18.60 | 20.51 | 487 | 15 582 | 9 | 1 638 400 | 2 956 |
| CNC Quality | 58.1 | 17.20 | 19.46 | 20.77 | 487 | 15 582 | 9 | 1 638 400 | 3 540 |
| Palletizing Performance | 150.5 | 6.20 | 10.00 | 13.00 | 166 | 5 348 | 7 | 1 376 256 | 5 022 |
| Palletizing Balanced | 77.6 | 12.70 | 15.63 | 17.83 | 166 | 5 348 | 7 | 1 376 256 | 1 732 |
| Palletizing Quality | 63.7 | 15.60 | 18.30 | 19.35 | 166 | 5 348 | 7 | 1 376 256 | 3 507 |

Revision 4 baseline (recorded by S71, same reference machine and browser — see
[VALIDATION_REVISION_4.md](VALIDATION_REVISION_4.md)) and the measured Revision 4 → Revision 5
comparison:

| Scene / quality | FPS R4 → R5 | p50 R4 → R5 | p95 R4 → R5 | p99 R4 → R5 | draws R4 → R5 | tris R4 → R5 | textures R4 → R5 | load R4 → R5 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CNC Performance | 148.5 → 157.4 | 6.20 → 6.10 | 10.90 → 8.73 | 13.56 → 10.35 | 460 → 435 | 10 080 → 11 610 | 0 → 9 | 2 375 → 3 526 |
| CNC Balanced | 153.5 → 63.8 | 6.40 → 15.50 | 8.20 → 18.60 | 9.47 → 20.51 | 512 → 487 | 14 052 → 15 582 | 0 → 9 | 1 806 → 2 956 |
| CNC Quality | 110.6 → 58.1 | 8.70 → 17.20 | 12.31 → 19.46 | 14.52 → 20.77 | 512 → 487 | 14 052 → 15 582 | 0 → 9 | 1 266 → 3 540 |
| Palletizing Performance | 143.4 → 150.5 | 6.10 → 6.20 | 12.80 → 10.00 | 15.82 → 13.00 | 170 → 166 | 3 804 → 5 348 | 0 → 7 | 1 748 → 5 022 |
| Palletizing Balanced | 162.2 → 77.6 | 6.10 → 12.70 | 7.30 → 15.63 | 12.11 → 17.83 | 170 → 166 | 3 804 → 5 348 | 0 → 7 | 1 479 → 1 732 |
| Palletizing Quality | 119.9 → 63.7 | 7.80 → 15.60 | 13.19 → 18.30 | 17.12 → 19.35 | 170 → 166 | 3 804 → 5 348 | 0 → 7 | 1 331 → 3 507 |

Interpretation, stated honestly:

- **No blanket improvement is claimed.** Revision 5 is a visual-credibility revision, not a
  performance release.
- **The Performance (`low`) profiles stay within a few percent of Revision 4 or improve slightly**:
  CNC Performance rises 148.5 → 157.4 FPS with better p95/p99, and palletizing Performance rises
  143.4 → 150.5 FPS with better p95/p99.
- **The Balanced/Quality (`medium`/`high`) profiles are measurably slower** (CNC Balanced 153.5 → 63.8,
  CNC Quality 110.6 → 58.1, palletizing Balanced 162.2 → 77.6, palletizing Quality 119.9 → 63.7). This
  is the intended cost of the S74 quality-gated composer path (depth AO + selective bloom + FXAA), which
  is active only at medium/high quality; it is a fidelity change, not an optimization regression. On this
  run the per-profile variance puts CNC Quality at 58.1 FPS, marginally below the 60 FPS target, so the
  target is stated as **met on five of six profiles**, not on all six (the S75 run of the same code
  recorded CNC Quality at 60.3 FPS, so the border is within run-to-run variance and is reported as such).
- **Draw calls decrease slightly** (CNC 460→435 low, 512→487 medium/high; palletizing 170→166) because
  S75 instances repeated factory-environment elements into one `InstancedMesh` per family.
- **Triangle counts increase by design** (CNC low 10 080 → 11 610, medium/high 14 052 → 15 582;
  palletizing 3 804 → 5 348) with the S72 surface detail, S73 assembled modules and S75 instancing/motion
  detail.
- **Texture memory is no longer zero**: S72 adds in-code procedural surface maps, so the benchmark
  records 9 textures / 1 638 400 bytes (CNC) and 7 textures / 1 376 256 bytes (palletizing), versus
  0 textures in Revision 4. No image file or external texture license is introduced.
- The benchmark is a manual, hardware-dependent procedure: it requires a machine with a GPU and a
  headed browser. A headless SwiftShader run records the same fields with `acceleration=software` and
  `gpuEvidence=false` and is never presented as GPU evidence.

## Fixture evidence

The flagship automated proof's external-controller stage uses the committed in-process Modbus fixture
(real transport, simulated peer), not vendor software. The Siemens/PLCSIM and CODESYS/SoftPLC substitute
fixtures and the in-process OPC UA/Modbus fixtures remain as recorded in
[VALIDATION_POST_1.0.md](VALIDATION_POST_1.0.md) and
[VALIDATION_REVISION_3.md](VALIDATION_REVISION_3.md); Revision 5 adds no connector change.

## Manual evidence

- The live public demonstration (documented in the README) is a best-effort shared environment;
  availability and state are not guaranteed and are not a gate.
- Operator accessibility (keyboard/contrast/target-size) is checked by the automated HMI accessibility
  specs and the design-system baselines; any additional human visual review of branding/imagery remains
  manual.
- The hardware GPU benchmark above was executed manually on the workstation; re-running it requires a
  machine with a GPU.
- The execution-stage captures are generated by the committed Playwright demo spec; reviewing the 21
  Revision 5 stills for presentation quality remains a manual editorial step.

## Deferred real PLC

**Real PLC/PLCSIM validation remains explicitly deferred.** No Siemens TIA Portal / PLCSIM Advanced /
S7-1500 or CODESYS licensed run was executed for Revision 5, and no certificate-trust decision was made.
The real-run checklists remain manual and unexecuted; the automated substitutes are labelled **fixture**,
never real PLC evidence. Real-device interoperability is therefore **unvalidated**. Executing it later
still requires human interaction for licensed software, certificate trust and any physical controller,
and no credential, private certificate or machine identifier may be committed.

## Documentation

```text
npm run docs:check
  -> passed: 32 required documents present, 531 links resolved
```

Revision 5 adds [VALIDATION_REVISION_5.md](VALIDATION_REVISION_5.md),
[RELEASE_PREPARATION_REVISION_5.md](RELEASE_PREPARATION_REVISION_5.md) and
[RELEASE_NOTES_REVISION_5.md](../releases/RELEASE_NOTES_REVISION_5.md); all three are registered as
required, link-checked documents in `scripts/docs/check-docs.mjs`, linked from the documentation index,
without touching the 1.0 document set or the Revision 4 artifacts. `docs:check` now additionally verifies
that the five release eras (1.0, Revision 2, Revision 3, Revision 4, Revision 5) are distinguished,
that the Revision 5 release notes are final (not draft), link this validation record, and that this
record carries the measured benchmark, the Revision 4 → Revision 5 comparison and the non-claims.

## Roadmap

Roadmap Revision 5 is complete at **S76**. Revision 4 (S65–S71), Revision 3 (S58–S64), Revision 2
(S51–S57) and the 1.0 baseline (S50) remain complete and unchanged. The immutable audit trail for
S01–S76 is not modified.

## Evidence index

| Artefact | Location | Class |
| --- | --- | --- |
| Revision 5 execution-stage capture spec | `Fabrik3D/fabrik3d.client/e2e-demo/demo-12-revision5-flagship.spec.ts` | Visual |
| Revision 4 execution-stage capture spec (retained) | `Fabrik3D/fabrik3d.client/e2e-demo/demo-11-execution-stages.spec.ts` | Visual |
| Stage-capture plan helper + test | `Fabrik3D/fabrik3d.client/src/scenarios/scenarioStageCapture.ts` | Automated |
| Flagship workflow integration test | `Fabrik3D/Fabrik3D.Server.Tests/FlagshipWorkflowIntegrationTests.cs` | Automated / Fixture |
| Flagship historian/time-travel test | `Fabrik3D/Fabrik3D.Server.Tests/FlagshipDemoHistorianTests.cs` | Automated |
| Flagship HMI e2e flow | `Fabrik3D/fabrik3d.hmi/e2e/flagship-demo.spec.ts` | Automated |
| No simulator-local Start | `Fabrik3D/fabrik3d.client/src/services/simulatorOrchestrationBridge.test.ts` | Automated |
| Deterministic visual baselines | `Fabrik3D/fabrik3d.client/e2e/`, `Fabrik3D/fabrik3d.hmi/e2e/` | Visual |
| GPU benchmark + artifact | `Fabrik3D/fabrik3d.client/playwright.benchmark.config.ts`, `test-results/perf/gpu-benchmark.json` | Hardware benchmark |
| GPU-free per-cell metrics | `Fabrik3D/fabrik3d.client/src/scenarios/scenarioRuntimeMetrics.test.ts` | Automated |
| Curated flagship media | [`artifacts/demo/flagship/`](../../artifacts/demo/flagship/README.md) | Visual |
| 1.0 baseline (immutable) | [VALIDATION_1.0.md](VALIDATION_1.0.md) | Automated / Manual |
| Post-1.0 (S51–S57) | [VALIDATION_POST_1.0.md](VALIDATION_POST_1.0.md) | Automated / Fixture |
| Revision 3 (S58–S64) | [VALIDATION_REVISION_3.md](VALIDATION_REVISION_3.md) | Automated / Visual / Hardware |
| Revision 4 (S65–S71) | [VALIDATION_REVISION_4.md](VALIDATION_REVISION_4.md) | Automated / Visual / Hardware |

## Unvalidated claims (explicit)

- A real Siemens TIA Portal / PLCSIM Advanced / S7-1500 or CODESYS licensed run, including
  certificate trust and real-PLC end-to-end latency.
- Any safety, certification, OEM-emulation or standards-compliance claim.
- Real JSON/Modbus register behaviour on a physical gateway beyond the documented network assumptions.
- GPU performance beyond the recorded S76 reference machine/browser, and any blanket "Revision 5 is
  faster" claim: the measured comparison is mixed (faster low-quality profiles, slower composer profiles)
  and is reported as such.
