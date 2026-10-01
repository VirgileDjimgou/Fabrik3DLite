# Fabrik3D post-1.0 (S58) validation evidence

This document is the **post-1.0** validation record produced by roadmap sprint **S58 - Real PLC
interoperability proof and post-1.0 validation**. It is deliberately separate from, and does not
modify, the immutable Fabrik3D 1.0 (S50) record:

- 1.0 baseline gates and lifecycle: [VALIDATION_1.0.md](VALIDATION_1.0.md)
- S48 lifecycle transcript: [VALIDATION.md](VALIDATION.md)
- 1.0 release notes: [RELEASE_NOTES_1.0.md](../releases/RELEASE_NOTES_1.0.md)

Every transcript below is a real command executed on 2026-10-01 on this workstation
(Windows 10.0.26200, .NET SDK 10.0.401 building `net8.0`, Node.js 24.18.0, Docker 28.0.1 with a
MongoDB 7.0 Testcontainer). Nothing here is estimated; the one failure observed is reproduced and
explained, not hidden.

## Evidence classification

Every claim in this document carries one of five labels. They are never merged:

| Label | Meaning |
| --- | --- |
| **Automated** | Produced by a committed test or gate command that can run unattended. |
| **Fixture** | Produced by a deterministic, in-repository substitute (real transport, simulated peer) — not by vendor software. |
| **Manual** | A documented human procedure that has not been executed in this environment. |
| **Real external software** | Produced by the actual licensed vendor environment (TIA Portal / PLCSIM Advanced / a real S7-1500). |
| **Unvalidated** | Asserted nowhere; listed so the gap is explicit. |

The Siemens/PLCSIM proof may be labelled **real external software** only when it was executed
against the real licensed environment. That environment is not present here, so this sprint records
an unresolved `HUMAN_REQUIRED` gate instead of a real claim (see below). No screenshot, log,
certificate, GPU, timing or industrial datum was fabricated.

## Repository baseline (automated)

```text
dotnet build Fabrik3D/Fabrik3D.slnx
  -> 0 warnings, 0 errors

dotnet test Fabrik3D/Fabrik3D.slnx --no-build
  -> Fabrik3D.Contracts.Tests               5 passed, 0 failed
     Fabrik3D.Infrastructure.IntegrationTests 16 passed, 0 failed (MongoDB Testcontainer)
     Fabrik3D.Server.Tests                 565 passed, 0 failed
     total 586 passed, 0 failed

npm run contracts:check   (Development API server started non-blocking from
  Fabrik3D/Fabrik3D.Server/bin/Debug/net8.0/Fabrik3D.ServerTaskManager.dll on 127.0.0.1:7249
  against a throwaway MongoDB database, health polled, server stopped afterwards)
  -> [contracts] verified from http://127.0.0.1:7249/swagger/v1/swagger.json

npm --prefix Fabrik3D/fabrik3d.client run type-check  -> exit 0
npm --prefix Fabrik3D/fabrik3d.client run test        -> 115 files, 601 passed
npm --prefix Fabrik3D/fabrik3d.client run build       -> exit 0
npm --prefix Fabrik3D/fabrik3d.client run test:visual -> 27 passed

npm --prefix Fabrik3D/fabrik3d.hmi run type-check  -> exit 0
npm --prefix Fabrik3D/fabrik3d.hmi run test        -> 23 files, 86 passed
npm --prefix Fabrik3D/fabrik3d.hmi run build       -> exit 0
npm --prefix Fabrik3D/fabrik3d.hmi run test:e2e    -> 14 passed, 2 failed
  (the two failures are the pre-existing `hmi-design-system` visual snapshots; see
   "Known pre-existing failure" below. The authoritative orchestration E2E flows passed.)

npm run audit        -> simulator 0 vulnerabilities; hmi 0 vulnerabilities;
                        no vulnerable NuGet packages (Contracts, Domain, Infrastructure, ServerTaskManager)
npm run security:scan -> Security check passed (1295 file(s) checked)
npm run repo:policy         -> passed: 1295 file(s) checked (mode=tracked)
npm run repo:policy:changed -> passed: 180 file(s) checked (mode=changed)
docker compose -f Fabrik3D/compose.production.yaml config --quiet -> exit 0
npm run docs:check   -> passed: 23 required documents present, 358 links resolved
npm run sprint:validate -> see "Roadmap" below
```

## Automated flagship workflow proof (S58)

Sprint S58 adds one deterministic integration test that binds the S51–S53 building blocks into a
single coherent workflow. It is **automated** for the server/authority/cell chain and uses the S46
**fixture** as the external controller; it is not a real PLC run.

```text
dotnet test Fabrik3D/Fabrik3D.Server.Tests/Fabrik3D.Server.Tests.csproj --no-build \
  --filter "FullyQualifiedName~FlagshipWorkflowIntegrationTests"
  -> Flagship_workflow_runs_from_composed_job_through_external_control_to_completion [1 s]
     1 passed, 0 failed
```

`Fabrik3D/Fabrik3D.Server.Tests/FlagshipWorkflowIntegrationTests.cs` proves, in one run:

1. **Job creation/composition** — the operator request is validated and the job plus its tasks are
   created server-side by `JobComposerService` (no client-generated tasks).
2. **Server-authoritative Start/dispatch** — `DispatchService.StartDispatchAsync` assigns exactly one
   target simulator and session, sets the job `Running` and publishes a **targeted**
   `ExecutionDispatchRequested` event carrying the target, session and correlation id.
3. **Simulator acknowledge/running with no local Start** — the assigned simulator acknowledges and
   reports `Running`; the dispatch state moves `Pending → Acknowledged → Running`. There is no
   simulator-local Start action in the flow, and a foreign simulator cannot claim the dispatch
   (covered by the S51 dispatch suite).
4. **External control authority** — before authority is acquired the fixture cell tick is denied and
   the actuator never moves; after an explicit `ExternalController` handshake the authority audit
   records `authority_acquired`.
5. **Deterministic cell sequence** — the fixture controller (real Modbus TCP transport, committed
   [CODESYS/SoftPLC I/O map](../showcases/codesys-softplc/io-map.json)) drives
   ready → load → robot → CNC → cycle-complete through the same signal map documented for the
   CODESYS/Siemens profiles.
6. **Simulated fault and recovery** — a stop during the cycle latches a fault with no motion, and a
   reset clears it.
7. **Completion** — the simulator's task and session reports cause the server to derive the terminal
   `Completed` job state, `progressPercent = 100` and a completion timestamp, with a
   `JobStateChanged` event.

Historian persistence/reconstruction and time travel are **automated** by the dedicated suites
(`Historian*`, `CrossTenantHistorian*`, `HistorianQueryAndRateLimit*`, `HistorianSampling*` and the
client `time-travel` specs); they are not re-asserted inside the flagship test to keep it focused.

## Fixture interoperability evidence (S46/S47 substitute)

The Siemens/PLCSIM and CODESYS/SoftPLC profiles ship documentation plus automated substitutes that
speak the committed versioned I/O maps over the **real** OPC UA / Modbus adapters against in-process
fixtures. They are labelled **fixture** and never presented as real vendor runs.

```text
dotnet test Fabrik3D/Fabrik3D.Server.Tests/Fabrik3D.Server.Tests.csproj --filter "FullyQualifiedName~SiemensPlcsimProfileTests"
  -> 6 passed, 0 failed
dotnet test Fabrik3D/Fabrik3D.Server.Tests/Fabrik3D.Server.Tests.csproj --filter "FullyQualifiedName~ReferenceCellShowcaseTests"
  -> 3 passed, 0 failed
```

Captured fixture evidence, per-step sequence output, negative cases and the recorded closed-loop
latency remain in the profile packages:

- [Siemens/PLCSIM evidence](../showcases/siemens-plcsim/evidence.md) — automated substitute run,
  recorded timing and the manual real-run checklist with its documented blocker.
- [CODESYS/SoftPLC evidence](../showcases/codesys-softplc/evidence.md) — automated substitute run and
  the manual real-run checklist.

## Real external software evidence (Siemens / PLCSIM)

**None.** This is the honest, primary gap of this sprint and the reason completion is gated.

The preferred real target is a Siemens S7-1500 (or PLCSIM Advanced) exposing its OPC UA server, per
the S47 profile. Executing it requires a licensed TIA Portal / PLCSIM Advanced installation, an
explicit certificate-trust decision, and (for a real CPU) physical hardware — none of which can be
automated safely and none of which is present in this environment. Acceptance criterion 2 therefore
requires an unresolved `HUMAN_REQUIRED` gate rather than a completed sprint:

- **Gate reason:** real TIA Portal / PLCSIM Advanced access, license acceptance and certificate trust
  are required to perform the real interoperability proof. The batch records
  `docs/roadmap/autopilot/HUMAN_REQUIRED.json` with `reasonCode`
  `EXTERNAL_SOFTWARE_INTERACTION` and the exact human actions below.
- **Do not mark S58 complete** while the gate is unresolved. This document deliberately does not
  claim a live Siemens integration.

Required human actions (also in the gate file):

1. Install/confirm a licensed TIA Portal + PLCSIM Advanced (or connect a real S7-1500) on an isolated
   training network and record the exact TIA Portal, PLCSIM Advanced and CPU firmware versions.
2. Export the CPU/PLCSIM OPC UA server certificate and make the explicit trust decision to place it in
   the Fabrik3D trust store; never enable `AutoAcceptUntrustedCertificates` outside development.
3. Run the [manual real-run checklist](../showcases/siemens-plcsim/evidence.md#manual-real-run-validation-checklist-not-executed-blocker-documented)
   (M1–M12) and capture the required artefacts (redacted): connector status with
   `monitoredItemCount = 14`, authority audit, the state-sequence transcript, fault/reset log, and
   measured round-trip/cycle latency with the reference machine noted.
4. Store the redacted artefacts under a dated `docs/evidence/` folder, then resolve the gate with
   `npm run sprint:batch:resolve-gate -- --reason "..."` so the real validation can be appended here
   as **real external software**.

No credential, token, private certificate, tenant datum or machine identifier may be committed.

## Manual real-run checklists (not executed)

The following remain **manual** and unexecuted in this environment:

- Siemens/PLCSIM OPC UA checklist: [evidence.md](../showcases/siemens-plcsim/evidence.md).
- CODESYS/SoftPLC checklist: [codesys-softplc/evidence.md](../showcases/codesys-softplc/evidence.md).
- Any performance recording on real reference hardware: [PERFORMANCE.md](PERFORMANCE.md) states the
  documented reference workstation; real-PLC latency is unvalidated.

## Release-level gates and known pre-existing failure

`npm --prefix Fabrik3D/fabrik3d.hmi run test:e2e` currently reports **14 passed, 2 failed**. The two
failures are `e2e/hmi-design-system.spec.ts` (`panel preserves neutral navigation hierarchy`,
`laptop preserves neutral navigation hierarchy`). They are **pre-existing and unrelated to S58**:

- S58 changed no HMI source, component, style or snapshot.
- The screenshot baseline (`e2e/hmi-design-system.spec.ts-snapshots/hmi-home-*-win32.png`) is an
  uncommitted working-tree file (modified during an earlier sprint) that encodes a **running**
  machine status panel (`Tempo 50%`, `Robot State MOVING`, `CNC State IDLE`, `Phase LIFT FROM PALLET`).
- Against a clean database the HMI status panel renders no machine state (`Tempo 0%`, `-`), so the
  snapshot differs by ~1% of pixels in the right-hand status panel only. The orchestration API flows
  (smoke, claim, dispatch, job-composer, cell-templates, tenancy, training, instructor) all pass.
- The snapshot was **not** updated, and the assertion was **not** weakened or skipped, as required by
  the quality gates. Fixing the baseline determinism (freezing or seeding the demo machine state
  before capture) is recorded as follow-up work, not silently patched here.

All other release-level gates listed above passed.

One further repository-level suite is **not** part of the `QUALITY_GATES.md` baseline and is
reported here only for honesty: `node --test "scripts/tests/*.test.mjs"`. The `repository-policy`
and `security-scan` script tests pass. `scripts/tests/autopilot-wiring.test.mjs` still asserts the
frozen S50-era autopilot state (`status = roadmap_complete`, `lastCompletedSprint = S50`,
`activeSprint = null`, S51–S58 `planned`); it is a stale pre-1.0-Revision-2 guard that conflicts
with Revision 2 having been activated in S51, so it fails independently of S58. The three
`scripts/tests/sprint-batch-runner.test.mjs` cases that assert orchestrator stdout also fail only
when `FABRIK3D_BATCH_CHILD=1` is inherited from the parent batch process (which silences the
orchestrator's console output by design); with that variable unset they pass. None of these
script-level results is a `QUALITY_GATES.md` mandatory gate, and none is caused by S58.

## Documentation

```text
npm run docs:check
  -> passed: 23 required documents present, 358 links resolved
```

`VALIDATION_POST_1.0.md` is registered as a required, link-checked document in
`scripts/docs/check-docs.mjs` and linked from `docs/DOCUMENTATION_INDEX.md`, without touching the
S50 1.0 document set.

## Roadmap

```text
npm run sprint:validate
  -> Roadmap validation passed: 58 sprints, 57 completed, active=S58
```

There is no S59 in Roadmap Revision 2. S01–S58 history is preserved; S50 history is untouched.

## Evidence index

| Artefact | Location | Class |
| --- | --- | --- |
| S58 flagship workflow test | `Fabrik3D/Fabrik3D.Server.Tests/FlagshipWorkflowIntegrationTests.cs` | Automated |
| S46 CODESYS/SoftPLC substitute | `Fabrik3D/Fabrik3D.Server.Tests/Showcase/ReferenceCellShowcaseTests.cs` | Fixture |
| S47 Siemens/PLCSIM substitute | `Fabrik3D/Fabrik3D.Server.Tests/Showcase/SiemensPlcsimProfileTests.cs` | Fixture |
| S47 captured substitute + manual checklist | [showcases/siemens-plcsim/evidence.md](../showcases/siemens-plcsim/evidence.md) | Fixture / Manual |
| S46 captured substitute + manual checklist | [showcases/codesys-softplc/evidence.md](../showcases/codesys-softplc/evidence.md) | Fixture / Manual |
| Historian and time travel | `Fabrik3D/Fabrik3D.Server.Tests/Historian*`, `Fabrik3D/fabrik3d.client/e2e/time-travel*.spec.ts` | Automated |
| 1.0 baseline (immutable) | [VALIDATION_1.0.md](VALIDATION_1.0.md) | Automated / Manual |
| 1.0 limitations | [LIMITATIONS.md](LIMITATIONS.md) | Reference |
| Failure/recovery matrix | [RECOVERY_MATRIX.md](RECOVERY_MATRIX.md) | Reference |

## Unvalidated claims (explicit)

- A real Siemens TIA Portal / PLCSIM Advanced / S7-1500 run, including certificate trust against a
  real CPU and real-PLC end-to-end latency.
- Real CODESYS/SoftPLC operation on licensed vendor software (the substitute is fixture-only).
- Any safety, certification, OEM-emulation or standards-compliance claim.
- Real JSON/Modbus register behaviour on a physical gateway beyond the documented network assumptions.
- HMI visual baseline determinism in a clean database (known failure above).

## Troubleshooting

- **Connect/authority issues with a real PLC:** see
  [siemens-plcsim/diagnostics.md](../showcases/siemens-plcsim/diagnostics.md) and
  [siemens-plcsim/setup.md](../showcases/siemens-plcsim/setup.md); the connector degrades visibly and
  writes fail closed.
- **Failure and degraded modes:** [RECOVERY_MATRIX.md](RECOVERY_MATRIX.md).
- **General development issues:** [TROUBLESHOOTING.md](../development/TROUBLESHOOTING.md).

## Rollback and failure containment

- Real-integration configuration stays optional and disabled by default; loss of PLC/authority fails
  closed and never causes an implicit takeover. Fixture workflows remain available and labelled.
- This document is additive and changes no S50 release note, completion evidence or
  [VALIDATION_1.0.md](VALIDATION_1.0.md).
