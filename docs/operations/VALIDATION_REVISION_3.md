# Fabrik3D Revision 3 validation evidence

This document is the validation record for **Roadmap Revision 3 (S58–S64)**: the real 3D scenario
runtime, scenario-specific cells, robot/cell visual fidelity, HMI operator polish, deterministic
visual QA and GPU evidence, browser OIDC with public-demo isolation, and the flagship product
surface. It is deliberately separate from, and does not modify, the immutable 1.0 (S50) record or
the post-1.0 (S51–S57) record:

- 1.0 baseline: [VALIDATION_1.0.md](VALIDATION_1.0.md)
- Post-1.0 (S51–S57): [VALIDATION_POST_1.0.md](VALIDATION_POST_1.0.md)
- Flagship runbook: [FLAGSHIP_DEMO.md](FLAGSHIP_DEMO.md)
- Release notes: [RELEASE_NOTES_REVISION_3.md](../releases/RELEASE_NOTES_REVISION_3.md)

Every transcript below is a real command executed on this workstation on **2026-10-02**
(Windows 10.0.26200, .NET SDK 10.0.401 building `net8.0`, Node.js 24.18.0, Docker 28.0.1 with a
MongoDB 7.0 Testcontainer). Nothing is estimated; skipped or deferred items are stated explicitly.

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
  -> passed: 64 sprints, 63 completed, active=S64

dotnet build Fabrik3D/Fabrik3D.slnx
  -> 0 warnings, 0 errors

dotnet test Fabrik3D/Fabrik3D.slnx --no-build
  -> Fabrik3D.Contracts.Tests                  5 passed, 0 failed
     Fabrik3D.Infrastructure.IntegrationTests  16 passed, 0 failed (MongoDB Testcontainer)
     Fabrik3D.Server.Tests                    576 passed, 0 failed
     total 597 passed, 0 failed

npm run contracts:check  (Development server on 127.0.0.1:7249 against a disposable MongoDB
  database, swagger polled, server stopped and port released afterwards)
  -> [contracts] verified from http://127.0.0.1:7249/swagger/v1/swagger.json

npm run docs:check
  -> passed: 26 required documents present, 396 links resolved

npm --prefix Fabrik3D/fabrik3d.client run type-check  -> exit 0
npm --prefix Fabrik3D/fabrik3d.client run test        -> 129 files, 693 passed
npm --prefix Fabrik3D/fabrik3d.client run build       -> exit 0
npm --prefix Fabrik3D/fabrik3d.client run test:visual -> 35 passed

npm --prefix Fabrik3D/fabrik3d.hmi run type-check  -> exit 0
npm --prefix Fabrik3D/fabrik3d.hmi run test        -> 28 files, 120 passed
npm --prefix Fabrik3D/fabrik3d.hmi run build       -> exit 0
npm --prefix Fabrik3D/fabrik3d.hmi run test:e2e    -> 24 passed, 0 failed
  (22 pre-existing + 2 new flagship-demo flows; live Testing orchestrator on 127.0.0.1:7249)

npm run audit              -> simulator 0 vulnerabilities; hmi 0 vulnerabilities;
                              no vulnerable NuGet packages (Contracts, Domain, Infrastructure,
                              ServerTaskManager)
npm run security:scan      -> Security check passed (1182 file(s) checked)
npm run repo:policy        -> passed: 1174 file(s) checked (mode=tracked)
npm run repo:policy:changed-> passed: 173 file(s) checked (mode=changed)
docker compose -f Fabrik3D/compose.production.yaml config --quiet -> exit 0
```

## Automated flagship workflow proof

The deterministic flagship demonstration follows the documented workflow with the server as the
orchestration authority and **no simulator-local Start**:

```text
HMI → New Job → scenario/cell/pallet → Create → Start → server targeted dispatch →
simulator ACK → 3D execution starts automatically → robot/CNC/conveyor → live HMI →
fault/recovery → Job 100 % → Completed → historian/time travel
```

```text
dotnet test Fabrik3D/Fabrik3D.Server.Tests/Fabrik3D.Server.Tests.csproj --no-build `
  --filter "FullyQualifiedName~FlagshipWorkflowIntegrationTests|FullyQualifiedName~FlagshipDemoHistorianTests"
  -> Flagship_workflow_runs_from_composed_job_through_external_control_to_completion [passed]
     Completed_flagship_run_is_recorded_by_the_historian_and_read_back_read_only [passed]
     2 passed, 0 failed

npm --prefix Fabrik3D/fabrik3d.hmi run test:e2e (orchestrator-api project, live Testing server)
  -> flagship demo: HMI composer job → dispatch → simulator ACK → execution → completion [passed]
     flagship demo: execution cannot begin without the assigned simulator acknowledgement [passed]
```

- **Job creation/composition** is server-side (`JobComposerService`); the HMI submits a validated
  definition and the server generates the deterministic pallet-slot tasks.
- **Start/dispatch** is server-authoritative (`DispatchService.StartDispatchAsync`): one compatible
  target, one session, a targeted `ExecutionDispatchRequested` event and correlation id.
- **The simulator ACK is mandatory.** Dispatch state is `Pending` until the assigned simulator
  acknowledges (`Acknowledged → Running`); a foreign simulator is rejected `409`, and dispatching an
  unavailable target fails closed without starting the job.
- **No simulator-local Start.** The S51 ownership boundary is proven by
  `Fabrik3D/fabrik3d.client/src/services/simulatorOrchestrationBridge.test.ts` (`refuses a local
  production start while orchestrated`): in orchestrated mode the local Start function is never
  called and execution is driven only by the server dispatch. The offline local demo remains
  clearly separated and never writes simulated execution state to the server.
- **Execution, fault/recovery and completion** are driven by the deterministic cell/fixture loop and
  the server's task/session reports, ending in `Completed`, `progressPercent = 100`.
- **Historian/time travel.** `FlagshipDemoHistorianTests` records the completed run in a real
  MongoDB-backed historian (telemetry and events with session/source/quality/timestamp/correlation
  preserved, newest-first and read-only) and reads it back. Client historian→time-travel
  reconstruction is covered by the client `timeTravel`/`time-travel*.spec.ts` suites.

## Visual evidence (deterministic)

Revision 3 introduced the shared deterministic visual protocol (reset → seed → scenario → ready →
freeze → screenshot) and representative baselines for the simulator and the HMI.

```text
npm --prefix Fabrik3D/fabrik3d.client run test:visual -> 35 passed
  (CNC cell, vision sorting, palletizing, assembly, safety training, HMI overview,
   Job Composer, robot positions, mapping studio, signal inspector, fault lab, time travel,
   cell editor, robot catalog, soak)
npm --prefix Fabrik3D/fabrik3d.hmi run test:e2e -> 24 passed
  (rendered HMI design-system, accessibility and operator visual baselines)
```

The curated flagship media set — hero CNC cell, four scenario cells, HMI, Job Composer, robot
pendant, fault lab and time travel — is committed under
[`artifacts/demo/flagship/`](../../artifacts/demo/flagship/README.md) with provenance, and the
scenario captures are reproduced by `demo-10-scenario-showcase.spec.ts`. These captures use software
rendering (headless Chromium) and are labelled as such; they are **not** presented as GPU evidence.

## Hardware benchmark evidence (S62)

Recorded with `npm --prefix Fabrik3D/fabrik3d.client run benchmark:gpu` on a real GPU
(`ANGLE (Intel, Intel(R) UHD Graphics, D3D11)`, 1920×1080, `acceleration=hardware`, `gpuEvidence=true`):

| Scene / quality | FPS | p50 ms | p95 ms | p99 ms | draws | tris |
| --- | --- | --- | --- | --- | --- | --- |
| CNC Performance | 154.5 | 6.10 | 10.40 | 12.00 | 414 | 9 528 |
| CNC Balanced | 135.7 | 6.90 | 9.96 | 13.08 | 466 | 13 500 |
| CNC Quality | 103.6 | 9.90 | 12.60 | 14.59 | 466 | 13 500 |
| Palletizing Performance | 133.7 | 6.20 | 13.37 | 15.69 | 42 | 534 |
| Palletizing Balanced | 145.7 | 6.10 | 11.60 | 14.98 | 42 | 534 |
| Palletizing Quality | 132.1 | 7.30 | 9.60 | 10.20 | 42 | 534 |

A headless SwiftShader run records the same fields with `acceleration=software` and
`gpuEvidence=false`, and is never presented as GPU evidence. These numbers are the S62 measurements
and are not re-claimed as new S64 measurements. See [PERFORMANCE.md](PERFORMANCE.md) and
[VISUAL_TESTING.md](VISUAL_TESTING.md).

The S56 SignalR load harness (50 and 100 clients, 0 loss, delivery p95 ≈ 24–25 ms, p99 ≈ 42–53 ms)
and the soak verdict (draw calls flat, bounded heap growth) remain the sustained-load evidence; S64
adds no runtime behaviour and therefore no new performance claim.

## Fixture evidence

The flagship automated proof's external-controller stage uses the committed in-process Modbus
fixture (real transport, simulated peer), not vendor software:

```text
dotnet test Fabrik3D/Fabrik3D.Server.Tests --filter "FullyQualifiedName~FlagshipWorkflowIntegrationTests"
  -> external controller is the CODESYS/SoftPLC substitute fixture; writes accepted, 0 rejected
```

The Siemens/PLCSIM and CODESYS/SoftPLC substitute fixtures and the in-process OPC UA/Modbus fixtures
remain as recorded in [VALIDATION_POST_1.0.md](VALIDATION_POST_1.0.md).

## Manual evidence

- The live public demonstration (Hetzner + Cloudflare Tunnel, documented in the README) is a
  best-effort shared environment; availability and state are not guaranteed and are not a gate.
- Operator accessibility (keyboard/contrast) is checked by the automated `test:a11y` matrix and the
  design-system baselines; any additional human visual review of branding/imagery remains manual.
- The hardware GPU benchmark above was executed manually on the workstation; re-running it requires
  a machine with a GPU.

## Deferred real PLC

**Real PLC/PLCSIM validation remains explicitly deferred.** No Siemens TIA Portal / PLCSIM Advanced /
S7-1500 or CODESYS licensed run was executed for Revision 3, and no certificate-trust decision was
made. The real-run checklists remain manual and unexecuted; the automated substitutes are labelled
**fixture**, never real PLC evidence. Real-device interoperability is therefore **unvalidated**.
Executing it later still requires human interaction for licensed software, certificate trust and any
physical controller, and no credential, private certificate or machine identifier may be committed.

## Documentation

```text
npm run docs:check
  -> passed: 26 required documents present, 396 links resolved
```

Revision 3 adds [FLAGSHIP_DEMO.md](FLAGSHIP_DEMO.md),
[VALIDATION_REVISION_3.md](VALIDATION_REVISION_3.md) and
[RELEASE_NOTES_REVISION_3.md](../releases/RELEASE_NOTES_REVISION_3.md); all three are registered as
required, link-checked documents in `scripts/docs/check-docs.mjs`, linked from the documentation
index, without touching the 1.0 document set.

## Roadmap

Roadmap Revision 3 is complete at **S64**. Revision 2 (S51–S57) and the 1.0 baseline (S50) remain
complete and unchanged. The immutable audit trail for S01–S50 is not modified.

## Evidence index

| Artefact | Location | Class |
| --- | --- | --- |
| Flagship workflow integration test | `Fabrik3D/Fabrik3D.Server.Tests/FlagshipWorkflowIntegrationTests.cs` | Automated / Fixture |
| Flagship historian/time-travel test | `Fabrik3D/Fabrik3D.Server.Tests/FlagshipDemoHistorianTests.cs` | Automated |
| Flagship HMI e2e flow | `Fabrik3D/fabrik3d.hmi/e2e/flagship-demo.spec.ts` | Automated |
| No simulator-local Start | `Fabrik3D/fabrik3d.client/src/services/simulatorOrchestrationBridge.test.ts` | Automated |
| Deterministic visual protocol and baselines | `Fabrik3D/fabrik3d.client/e2e/`, `Fabrik3D/fabrik3d.hmi/e2e/` | Visual |
| GPU benchmark | `Fabrik3D/fabrik3d.client/playwright.benchmark.config.ts` | Hardware benchmark |
| Curated flagship media | [`artifacts/demo/flagship/`](../../artifacts/demo/flagship/README.md) | Visual |
| Fixture profiles | `docs/showcases/codesys-softplc/`, `docs/showcases/siemens-plcsim/` | Fixture / Manual |
| 1.0 baseline (immutable) | [VALIDATION_1.0.md](VALIDATION_1.0.md) | Automated / Manual |
| Post-1.0 (S51–S57) | [VALIDATION_POST_1.0.md](VALIDATION_POST_1.0.md) | Automated / Fixture |

## Unvalidated claims (explicit)

- A real Siemens TIA Portal / PLCSIM Advanced / S7-1500 or CODESYS licensed run, including
  certificate trust and real-PLC end-to-end latency.
- Any safety, certification, OEM-emulation or standards-compliance claim.
- Real JSON/Modbus register behaviour on a physical gateway beyond the documented network
  assumptions.
- GPU performance beyond the recorded S62 reference machine/browser.
