# Fabrik3D Revision 4 validation evidence

This document is the validation record for **Roadmap Revision 4 (S65â€“S71)**: scenario-specific
industrial 3D assets, real robot motion inside the scenario cells, deeper deterministic process
flows, a shared texture-free PBR material/environment vocabulary, measured composition and cameras,
product-coherence cleanup and the measured release-candidate validation. It is deliberately separate
from, and does not modify, the immutable 1.0 (S50) record, the post-1.0 (S51â€“S57) record or the
Revision 3 (S58â€“S64) record:

- 1.0 baseline: [VALIDATION_1.0.md](VALIDATION_1.0.md)
- Post-1.0 (S51â€“S57): [VALIDATION_POST_1.0.md](VALIDATION_POST_1.0.md)
- Revision 3 (S58â€“S64): [VALIDATION_REVISION_3.md](VALIDATION_REVISION_3.md)
- Release preparation: [RELEASE_PREPARATION_REVISION_4.md](RELEASE_PREPARATION_REVISION_4.md)
- Release notes: [RELEASE_NOTES_REVISION_4.md](../releases/RELEASE_NOTES_REVISION_4.md)
- Flagship runbook: [FLAGSHIP_DEMO.md](FLAGSHIP_DEMO.md)

Every transcript below is a real command executed on this workstation on **2026-10-02/03**
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
  -> [sprint] Roadmap validation passed: 71 sprints, 70 completed, active=S71

dotnet build Fabrik3D/Fabrik3D.slnx
  -> 0 warnings, 0 errors

dotnet test Fabrik3D/Fabrik3D.slnx --no-build
  -> Fabrik3D.Contracts.Tests                  5 passed, 0 failed
     Fabrik3D.Infrastructure.IntegrationTests  16 passed, 0 failed (MongoDB Testcontainer)
     Fabrik3D.Server.Tests                    576 passed, 0 failed
     total 597 passed, 0 failed

npm run contracts:check
  (the real Fabrik3D.ServerTaskManager host, Development on 127.0.0.1:7249 against a disposable
   MongoDB database Fabrik3D_S71_Contracts, swagger polled, server stopped and port released)
  -> [contracts] verified from http://127.0.0.1:7249/swagger/v1/swagger.json  (exit 0)

npm run docs:check
  -> passed: 29 required documents present, 462 links resolved

npm --prefix Fabrik3D/fabrik3d.client run type-check  -> exit 0
npm --prefix Fabrik3D/fabrik3d.client run test        -> 140 files, 794 passed
npm --prefix Fabrik3D/fabrik3d.client run build       -> exit 0
npm --prefix Fabrik3D/fabrik3d.client run test:visual -> 40 passed

npm --prefix Fabrik3D/fabrik3d.hmi run type-check  -> exit 0
npm --prefix Fabrik3D/fabrik3d.hmi run test        -> 29 files, 123 passed
npm --prefix Fabrik3D/fabrik3d.hmi run build       -> exit 0
npm --prefix Fabrik3D/fabrik3d.hmi run test:e2e    -> 24 passed, 0 failed
  (live Testing orchestrator on 127.0.0.1:7249 with a disposable MongoDB database Fabrik3D_S71_E2E)

npm run audit              -> 0 npm vulnerabilities (simulator and HMI);
                              no vulnerable NuGet packages (Contracts, Domain, Infrastructure,
                              ServerTaskManager)
npm run security:scan      -> Security check passed (1267 file(s) checked)
npm run repo:policy        -> passed: 1258 file(s) checked (mode=tracked)
npm run repo:policy:changed-> passed: 214 file(s) checked (mode=changed)
docker compose -f Fabrik3D/compose.production.yaml config --quiet -> exit 0
```

## Flagship execution captures (visual, S71)

The Revision 4 validation must show **execution, not idle cells**, for all five flagship scenarios.
S71 adds a pure `scenarioStageCapture.ts` helper that turns a scenario's declared S67
`ScenarioProcessDefinition` into an ordered capture plan, and a `?stage=<stageId>` hook on
`MaterialFlowScenarioHost` that drives the *existing* guided process to that declared stage. It adds
no timeline engine and never mutates scenario truth outside the authoritative process driver. The
CNC reference cell shows its deterministic local execution because its HMI â†’ server â†’ simulator â†’
historian workflow is proven separately by the automated tests below.

```text
npm --prefix Fabrik3D/fabrik3d.client run build
npm --prefix Fabrik3D/fabrik3d.client run preview -- --host 127.0.0.1 --port 4173 --strictPort
npx playwright test --config=playwright.demo.config.ts demo-11-execution-stages.spec.ts --workers=1
  -> 21 passed (6.9m)
```

Each capture resets, seeds the deterministic visual protocol, selects the scenario, waits for the
equipment binding and asserts `data-execution-stage-reached="true"` plus the exact
`data-execution-stage-id` before freezing and capturing, so an unreached stage fails closed instead
of capturing an arbitrary frame. The captures are committed demo media, not byte-compared
visual-regression baselines: re-running the spec reproduces every stage and every assertion, while
individual PNG bytes may vary by a few hundred bytes because the freeze happens after real render
frames. They are reproducible, never fabricated.

| Scenario | Declared stages captured |
| --- | --- |
| Palletizing | `palletizing-robot-approach`, `palletizing-pick`, `palletizing-transfer`, `palletizing-place`, `palletizing-layer-update` |
| Vision sorting | `vision-part-enters`, `vision-inspection-begins`, `vision-classified`, `vision-diverter-actuates`, `vision-part-routes` |
| Assembly / inspection | `assembly-robot-load`, `assembly-fixture-clamp`, `assembly-inspection`, `assembly-decision-accept`, `assembly-unclamp` |
| Safety training | `safety-unsafe-state`, `safety-detection`, `safety-motion-inhibited`, `safety-state-restored`, `safety-operator-acknowledged` |
| CNC | `cnc-cell-running` (deterministic local execution) |

The 21 stills live under
[`artifacts/demo/flagship/execution/`](../../artifacts/demo/flagship/execution/) and are listed in
[`artifacts/demo/flagship/README.md`](../../artifacts/demo/flagship/README.md). The capture hook is
covered at the unit level by `scenarioStageCapture.test.ts` (ordered targets, monotonic step counts,
declared fault/recovery points, fail-closed unknown stage) and by `MaterialFlowScenarioHost.test.ts`
(drives to a requested stage, fails closed for an unknown stage).

## Automated flagship workflow proof (CNC)

The deterministic flagship demonstration follows the documented workflow with the server as the
orchestration authority and **no simulator-local Start**:

```text
HMI â†’ New Job â†’ scenario/cell/pallet â†’ Create â†’ Start â†’ server targeted dispatch â†’
simulator ACK â†’ 3D execution starts automatically â†’ robot/CNC/conveyor â†’ live HMI â†’
fault/recovery â†’ Job 100 % â†’ Completed â†’ historian/time travel
```

```text
dotnet test Fabrik3D/Fabrik3D.slnx --no-build   (includes the flagship tests)
  -> FlagshipWorkflowIntegrationTests  [passed]
     FlagshipDemoHistorianTests        [passed]

npm --prefix Fabrik3D/fabrik3d.hmi run test:e2e   (orchestrator-api project, live Testing server)
  -> flagship demo: HMI composer job â†’ dispatch â†’ simulator ACK â†’ execution â†’ completion [passed]
     flagship demo: execution cannot begin without the assigned simulator acknowledgement [passed]

Fabrik3D/fabrik3d.client/src/services/simulatorOrchestrationBridge.test.ts
  -> refuses a local production start while orchestrated [passed]
```

- **Job creation/composition** is server-side (`JobComposerService`); the HMI submits a validated
  definition and the server generates the deterministic pallet-slot tasks.
- **Start/dispatch** is server-authoritative (`DispatchService.StartDispatchAsync`): one compatible
  target, one session, a targeted `ExecutionDispatchRequested` event and correlation id.
- **The simulator ACK is mandatory.** Dispatch state is `Pending` until the assigned simulator
  acknowledges (`Acknowledged â†’ Running`); a foreign simulator is rejected `409`, and dispatching an
  unavailable target fails closed without starting the job.
- **No simulator-local Start.** In orchestrated mode the local Start function is never called and
  execution is driven only by the server dispatch; the offline local demo remains clearly separated
  and never writes simulated execution state to the server.
- **Execution, fault/recovery and completion** are driven by the deterministic cell/fixture loop and
  the server's task/session reports, ending in `Completed`, `progressPercent = 100`.
- **Historian/time travel.** `FlagshipDemoHistorianTests` records the completed run in a real
  MongoDB-backed historian (telemetry and events with session/source/quality/timestamp/correlation
  preserved, newest-first and read-only) and reads it back. Client historian â†’ time-travel
  reconstruction is covered by the client `time-travel*` suites.

## Visual evidence (deterministic)

```text
npm --prefix Fabrik3D/fabrik3d.client run test:visual -> 40 passed
  (CNC cell overview/operator/workcell, vision sorting, palletizing overview/operator/workcell,
   assembly, safety training, mapping studio, signal inspector, fault lab, time travel, cell editor,
   robot catalog, soak)
npm --prefix Fabrik3D/fabrik3d.hmi run test:e2e -> 24 passed
  (rendered HMI design-system, accessibility and operator visual baselines)
```

The curated Revision 3 â†’ Revision 4 media set â€” hero CNC cell, four scenario cells, HMI surfaces,
fault lab, time travel and the 21 S71 execution-stage captures â€” is committed under
[`artifacts/demo/flagship/`](../../artifacts/demo/flagship/README.md) with provenance. Still-image
captures use software or captured rendering and are **not** presented as GPU evidence.

## Hardware benchmark evidence (S71, Revision 4)

Re-run after the final Revision 4 assets and validated on real hardware:

```text
npm --prefix Fabrik3D/fabrik3d.client run benchmark:gpu
  -> 6 run(s) acceleration=hardware gpuEvidence=true
     renderer: ANGLE (Intel, Intel(R) UHD Graphics (0x0000A7A8) Direct3D11 vs_5_0 ps_5_0, D3D11)
     resolution: 1920x1080, textures: 0   artifact: Fabrik3D/fabrik3d.client/test-results/perf/gpu-benchmark.json
```

Revision 4 measurements (recorded 2026-10-02T22:55Z):

| Scene / quality | FPS | p50 ms | p95 ms | p99 ms | draws | tris | load ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CNC Performance | 148.5 | 6.20 | 10.90 | 13.56 | 460 | 10 080 | 2 375 |
| CNC Balanced | 153.5 | 6.40 | 8.20 | 9.47 | 512 | 14 052 | 1 806 |
| CNC Quality | 110.6 | 8.70 | 12.31 | 14.52 | 512 | 14 052 | 1 266 |
| Palletizing Performance | 143.4 | 6.10 | 12.80 | 15.82 | 170 | 3 804 | 1 748 |
| Palletizing Balanced | 162.2 | 6.10 | 7.30 | 12.11 | 170 | 3 804 | 1 479 |
| Palletizing Quality | 119.9 | 7.80 | 13.19 | 17.12 | 170 | 3 804 | 1 331 |

Revision 3 baseline (recorded by S62, same reference machine and browser â€” see
[VALIDATION_REVISION_3.md](VALIDATION_REVISION_3.md)) and the measured Revision 3 â†’ Revision 4
comparison:

| Scene / quality | FPS R3 â†’ R4 | p50 R3 â†’ R4 | p95 R3 â†’ R4 | p99 R3 â†’ R4 | draws R3 â†’ R4 | tris R3 â†’ R4 | load R3 â†’ R4 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CNC Performance | 154.5 â†’ 148.5 | 6.10 â†’ 6.20 | 10.40 â†’ 10.90 | 12.00 â†’ 13.56 | 414 â†’ 460 | 9 528 â†’ 10 080 | 2 260 â†’ 2 375 |
| CNC Balanced | 135.7 â†’ 153.5 | 6.90 â†’ 6.40 | 9.96 â†’ 8.20 | 13.08 â†’ 9.47 | 466 â†’ 512 | 13 500 â†’ 14 052 | 1 243 â†’ 1 806 |
| CNC Quality | 103.6 â†’ 110.6 | 9.90 â†’ 8.70 | 12.60 â†’ 12.31 | 14.59 â†’ 14.52 | 466 â†’ 512 | 13 500 â†’ 14 052 | 1 199 â†’ 1 266 |
| Palletizing Performance | 133.7 â†’ 143.4 | 6.20 â†’ 6.10 | 13.37 â†’ 12.80 | 15.69 â†’ 15.82 | 42 â†’ 170 | 534 â†’ 3 804 | 960 â†’ 1 748 |
| Palletizing Balanced | 145.7 â†’ 162.2 | 6.10 â†’ 6.10 | 11.60 â†’ 7.30 | 14.98 â†’ 12.11 | 42 â†’ 170 | 534 â†’ 3 804 | 996 â†’ 1 479 |
| Palletizing Quality | 132.1 â†’ 119.9 | 7.30 â†’ 7.80 | 9.60 â†’ 13.19 | 10.20 â†’ 17.12 | 42 â†’ 170 | 534 â†’ 3 804 | 1 053 â†’ 1 331 |

Interpretation, stated honestly:

- **No blanket improvement is claimed.** Revision 4 is not a performance release: five of six
  profiles stay within a few percent of the Revision 3 FPS and one (palletizing Quality) is lower.
- **Draw calls and triangles increased by design**, because the palletizing cell now renders the
  animated six-axis robot plus the S65 scenario-specific GLB equipment (42 â†’ 170 draw calls,
  534 â†’ 3 804 triangles) and the CNC cell gained the S68 material/environment detail
  (414/466 â†’ 460/512 draw calls). This is a fidelity change, not an optimization.
- **Texture memory remains zero** (0 textures, 0 texture bytes) in both revisions.
- **All profiles remain well above 60 FPS** on the documented reference machine, so the visual
  fidelity increase did not regress the interaction budget on that host.
- The benchmark is a manual, hardware-dependent procedure: it requires a machine with a GPU and a
  headed browser. A headless SwiftShader run records the same fields with `acceleration=software`
  and `gpuEvidence=false` and is never presented as GPU evidence.

## Fixture evidence

The flagship automated proof's external-controller stage uses the committed in-process Modbus
fixture (real transport, simulated peer), not vendor software. The Siemens/PLCSIM and
CODESYS/SoftPLC substitute fixtures and the in-process OPC UA/Modbus fixtures remain as recorded in
[VALIDATION_POST_1.0.md](VALIDATION_POST_1.0.md) and
[VALIDATION_REVISION_3.md](VALIDATION_REVISION_3.md); Rev4 adds no connector change.

## Manual evidence

- The live public demonstration (documented in the README) is a best-effort shared environment;
  availability and state are not guaranteed and are not a gate.
- Operator accessibility (keyboard/contrast/target-size) is checked by the automated HMI
  accessibility specs and the design-system baselines; any additional human visual review of
  branding/imagery remains manual.
- The hardware GPU benchmark above was executed manually on the workstation; re-running it requires
  a machine with a GPU.
- The execution-stage captures are generated by the committed Playwright demo spec; reviewing the
  21 stills for presentation quality remains a manual editorial step.

## Deferred real PLC

**Real PLC/PLCSIM validation remains explicitly deferred.** No Siemens TIA Portal / PLCSIM Advanced /
S7-1500 or CODESYS licensed run was executed for Revision 4, and no certificate-trust decision was
made. The real-run checklists remain manual and unexecuted; the automated substitutes are labelled
**fixture**, never real PLC evidence. Real-device interoperability is therefore **unvalidated**.
Executing it later still requires human interaction for licensed software, certificate trust and any
physical controller, and no credential, private certificate or machine identifier may be committed.

## Documentation

```text
npm run docs:check
  -> passed: 29 required documents present, 462 links resolved
```

Revision 4 adds [VALIDATION_REVISION_4.md](VALIDATION_REVISION_4.md),
[RELEASE_PREPARATION_REVISION_4.md](RELEASE_PREPARATION_REVISION_4.md) and
[RELEASE_NOTES_REVISION_4.md](../releases/RELEASE_NOTES_REVISION_4.md); all three are registered as
required, link-checked documents in `scripts/docs/check-docs.mjs`, linked from the documentation
index, without touching the 1.0 document set. `docs:check` now additionally verifies that the
Revision 4 release notes are final (not draft), link this validation record, and that this record
carries the measured benchmark, the Revision 3 â†’ Revision 4 comparison and the non-claims.

## Roadmap

Roadmap Revision 4 is complete at **S71**. Revision 3 (S58â€“S64), Revision 2 (S51â€“S57) and the 1.0
baseline (S50) remain complete and unchanged. The immutable audit trail for S01â€“S50 is not modified.

## Evidence index

| Artefact | Location | Class |
| --- | --- | --- |
| Execution-stage capture spec | `Fabrik3D/fabrik3d.client/e2e-demo/demo-11-execution-stages.spec.ts` | Visual |
| Stage-capture plan helper + test | `Fabrik3D/fabrik3d.client/src/scenarios/scenarioStageCapture.ts` | Automated |
| Host stage-capture hook test | `Fabrik3D/fabrik3d.client/src/components/MaterialFlowScenarioHost.test.ts` | Automated |
| Flagship workflow integration test | `Fabrik3D/Fabrik3D.Server.Tests/FlagshipWorkflowIntegrationTests.cs` | Automated / Fixture |
| Flagship historian/time-travel test | `Fabrik3D/Fabrik3D.Server.Tests/FlagshipDemoHistorianTests.cs` | Automated |
| Flagship HMI e2e flow | `Fabrik3D/fabrik3d.hmi/e2e/flagship-demo.spec.ts` | Automated |
| No simulator-local Start | `Fabrik3D/fabrik3d.client/src/services/simulatorOrchestrationBridge.test.ts` | Automated |
| Deterministic visual baselines | `Fabrik3D/fabrik3d.client/e2e/`, `Fabrik3D/fabrik3d.hmi/e2e/` | Visual |
| GPU benchmark + artifact | `Fabrik3D/fabrik3d.client/playwright.benchmark.config.ts`, `test-results/perf/gpu-benchmark.json` | Hardware benchmark |
| Curated flagship media | [`artifacts/demo/flagship/`](../../artifacts/demo/flagship/README.md) | Visual |
| 1.0 baseline (immutable) | [VALIDATION_1.0.md](VALIDATION_1.0.md) | Automated / Manual |
| Post-1.0 (S51â€“S57) | [VALIDATION_POST_1.0.md](VALIDATION_POST_1.0.md) | Automated / Fixture |
| Revision 3 (S58â€“S64) | [VALIDATION_REVISION_3.md](VALIDATION_REVISION_3.md) | Automated / Visual / Hardware |

## Unvalidated claims (explicit)

- A real Siemens TIA Portal / PLCSIM Advanced / S7-1500 or CODESYS licensed run, including
  certificate trust and real-PLC end-to-end latency.
- Any safety, certification, OEM-emulation or standards-compliance claim.
- Real JSON/Modbus register behaviour on a physical gateway beyond the documented network
  assumptions.
- GPU performance beyond the recorded S71 reference machine/browser, and any blanket "Revision 4 is
  faster" claim: the measured comparison is mixed and is reported as such.
