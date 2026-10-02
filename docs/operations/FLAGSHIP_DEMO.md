# Flagship demonstration runbook

This runbook is the single deterministic demonstration of the Fabrik3D Revision 3 platform. It
follows one operator job through the real orchestration flow — there is no scripted UI mock and no
simulator-local Start action. The server stays the orchestration authority; the simulator executes
only after a targeted dispatch is acknowledged.

**Scope:** all robots, CNC machines, conveyors, signals and faults below are simulated. No claim of
safety certification, OEM emulation or real-PLC interoperability is made. Real PLC/PLCSIM remains
explicitly deferred (see [VALIDATION_REVISION_3.md](VALIDATION_REVISION_3.md)).

## The workflow

```text
HMI
 ↓
New Job
 ↓
select scenario/cell/pallet
 ↓
Create
 ↓
Start
 ↓
server targeted dispatch
 ↓
simulator ACK
 ↓
3D execution begins automatically
 ↓
robot / CNC / conveyor
 ↓
live HMI
 ↓
fault / recovery
 ↓
Job 100 %
 ↓
Completed
 ↓
historian / time travel
```

**No simulator-local Start.** The simulator never invents, selects or starts a production job. In
orchestrated mode the simulator's local Start is refused and execution is driven only by the
server-authoritative dispatch path (`ExecutionDispatchRequested` → `onExternalStart`). The local
Start button runs only the clearly-labelled offline demonstration when no server is reachable.

## Automated proof

The workflow is proven deterministically; nothing below is hand-recorded.

```powershell
# 1. Server/orchestration spine, external-control loop, fault/recovery and completion
dotnet test Fabrik3D/Fabrik3D.Server.Tests/Fabrik3D.Server.Tests.csproj --no-build `
  --filter "FullyQualifiedName~FlagshipWorkflowIntegrationTests"

# 2. Historian/time-travel stage of the same completed run (real MongoDB, read-only read-back)
dotnet test Fabrik3D/Fabrik3D.Server.Tests/Fabrik3D.Server.Tests.csproj --no-build `
  --filter "FullyQualifiedName~FlagshipDemoHistorianTests"

# 3. HMI HTTP contract: composer Create → dispatch → mandatory simulator ACK → execution → 100 %
#    (requires the Testing orchestrator on 127.0.0.1:7249; see docs/TESTING.md)
npm --prefix Fabrik3D/fabrik3d.hmi run test:e2e -- --project=orchestrator-api --grep "flagship demo"
```

| Stage | Automated proof | Class |
| --- | --- | --- |
| HMI New Job / composer → Create | `job-composer.spec.ts`, `flagship-demo.spec.ts` | Automated |
| Start → server targeted dispatch | `FlagshipWorkflowIntegrationTests`, `flagship-demo.spec.ts` | Automated |
| Simulator ACK → Running (no local Start) | `FlagshipWorkflowIntegrationTests`, `simulatorOrchestrationBridge.test.ts`, `flagship-demo.spec.ts` | Automated |
| 3D execution (robot/CNC/conveyor) | `FlagshipWorkflowIntegrationTests` (fixture cell), `scenario-3d-runtime.spec.ts` | Automated / Fixture |
| Live HMI | `orchestration-*`, `flagship-demo.spec.ts` | Automated |
| Fault / recovery | `FlagshipWorkflowIntegrationTests`, `fault-lab*.spec.ts` | Automated / Fixture |
| Job 100 % → Completed | `FlagshipWorkflowIntegrationTests`, `flagship-demo.spec.ts` | Automated |
| Historian read-back | `FlagshipDemoHistorianTests`, `Historian*` | Automated |
| Historian → time travel | client `time-travel*.spec.ts`, client `timeTravel/*` | Automated |

## Scenario showcase

The four scenario-specific 3D cells are captured deterministically (reset → scene → stable render →
freeze → capture) and committed as visual-regression baselines:

| Scenario | Capture |
| --- | --- |
| Vision sorting | [scenario-vision-sorting.png](../../Fabrik3D/fabrik3d.client/e2e/scenario-visual.spec.ts-snapshots/scenario-vision-sorting-win32.png) |
| Palletizing | [scenario-palletizing.png](../../Fabrik3D/fabrik3d.client/e2e/scenario-visual.spec.ts-snapshots/scenario-palletizing-win32.png) |
| Assembly / inspection | [scenario-assembly.png](../../Fabrik3D/fabrik3d.client/e2e/scenario-visual.spec.ts-snapshots/scenario-assembly-win32.png) |
| Safety training | [scenario-safety-training.png](../../Fabrik3D/fabrik3d.client/e2e/scenario-visual.spec.ts-snapshots/scenario-safety-training-win32.png) |
| Hero CNC reference cell | [scenario-cnc-cell.png](../../Fabrik3D/fabrik3d.client/e2e/scenario-visual.spec.ts-snapshots/scenario-cnc-cell-win32.png) |

Each capture visibly shows the scenario-specific equipment assembled by the S58 scene runtime
(vision gantry and bin, palletizing station, assembly/inspection station, safety-training guarding).
Reproduce with:

```powershell
npm --prefix Fabrik3D/fabrik3d.client run test:visual -- --grep "deterministic visual"
```

A curated copy of these captures, with captions and provenance, is kept in
[`artifacts/demo/flagship/`](../../artifacts/demo/flagship/README.md).

## Reproducing the live demonstration

1. Start the orchestrator, simulator and HMI as described in [TESTING.md](../TESTING.md) or run the
   packaged stack with `docker compose -f Fabrik3D/compose.production.yaml up --build`.
2. Sign in to the HMI as an Operator (Test identity in a demo profile; OIDC in a customer install).
3. **New Job** → choose the reference cell, the `pallet-processing` scenario and a pallet, mark the
   occupied slots and **Create**.
4. Open the created job and press **Start**. The server assigns one compatible simulator and emits a
   targeted dispatch; the simulator acknowledges and begins the 3D execution automatically.
5. Watch the robot, CNC and conveyor execute; the HMI shows the live phase, pallet, task and progress.
6. Inject a simulated fault through the fault lab, then acknowledge/reset and confirm recovery.
7. Let the job reach **100 %**; the server derives the terminal **Completed** state.
8. Open the historian/time-travel surface and reconstruct the run read-only.

## Boundaries

- All equipment, signals, faults and training data are simulated; the demonstration is not a
  certified safety function.
- The external-controller step of the automated proof uses the committed in-process Modbus fixture,
  not vendor software; real PLC/PLCSIM remains deferred.
- No secret, token or personal datum appears in any capture.
