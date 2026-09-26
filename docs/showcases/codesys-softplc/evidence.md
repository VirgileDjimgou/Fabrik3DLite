# Showcase evidence

Two kinds of evidence are kept strictly separate:

1. **Automated substitute evidence** — produced by the committed CI tests on the real Modbus adapter
   against the in-process fixture. It is captured and stored below and is not dependent on any
   proprietary software.
2. **Manual real-run checklist** — a human runs a real CODESYS/SoftPLC. It is **not executed in CI** and
   no screenshot from a real run is committed here, so no live-integration claim is implied.

## Automated substitute run

Command:

```powershell
dotnet build Fabrik3D/Fabrik3D.slnx
dotnet test Fabrik3D/Fabrik3D.Server.Tests/Fabrik3D.Server.Tests.csproj --filter "FullyQualifiedName~ReferenceCellShowcaseTests"
```

Result (captured from a real run on 2026-09-26): **4 passed, 0 failed** — the committed I/O map
validation, the closed-loop sequence, authority acquire/release/loss, and the fail-closed write policy.

Per-step output from `Fixture_controller_drives_the_showcase_sequence_closed_loop`:

```text
Step 1 permissives: cell Ready=true published to the controller.
Step 2 start requested without a pallet: still Ready, no motion.
Step 3 pallet detected: robot running, actuator/sensor=25.
Step 4 robot cycle complete: actuator/sensor=100 mirrored to the controller.
Step 5 CNC cycle complete: parts=1; closed-loop latency (setpoint -> controller sensor/count feedback) 468,52 ms.
Step 6 stop during cycle: fault latched at actuator hold 25, no motion.
Step 7 reset: fault cleared, cell idle and ready for the next pallet.
Connector: 75 poll cycles, 126 accepted writes, 0 rejected.
```

Authority evidence from
`Showcase_authority_acquisition_release_and_controller_loss_follow_s36` (the closed loop runs through
the authority gate; local simulation is refused; loss degrades without takeover; owner release restores
local simulation):

```text
Authority audit: authority_degraded:external-controller/showcase-plc | authority_released:local-simulation/showcase-plc | authority_acquired:external-controller/showcase-plc | authority_quiesce:external-controller/showcase-plc
```

Write-policy evidence from `Showcase_writes_fail_closed_without_enablement_and_allow_list`: a disabled
connector refuses with `connector-disabled`; writes enabled but not allow-listed refuses with
`not-allow-listed`; a read-only input mapped as writable is refused; only the nine showcase output
signals are writable.

Map validation evidence from `Committed_showcase_io_map_is_a_valid_versioned_mapping_document`: the
committed `io-map.json` validates against the server mapping rules with zero errors and zero
conflicts, projects to 14 Modbus points (5 read, 9 write), and every register point states
`big-endian` explicitly.

### Recorded performance

| Measurement | Value | Notes |
| --- | --- | --- |
| Closed-loop latency (setpoint → controller sensor/count feedback) | **468.52 ms** | includes the full robot + CNC sequence at a 50 ms connector poll interval on the local loopback fixture (Intel i7-13620H, Windows). This is dominated by the documented poll/phase cadence, not by transport. |
| Accepted connector writes during the run | **126** | 0 rejected |
| Connector poll cycles during the run | **75** | 50 ms interval |

The closed-loop cycle stays within a sub-second documented bound for the fixture (poll 50 ms; robot
ramp 4 ticks; CNC 3 ticks).

## Manual real-run validation checklist (not executed in CI)

Marking this section **manual** is deliberate: running CODESYS (or another proprietary SoftPLC) cannot
be automated safely and is not part of the mandatory CI gates. Complete it to validate a real run and
store the artifacts; do not claim the run until the artifacts exist.

| # | Check | Expected artifact |
| --- | --- | --- |
| M1 | Modbus TCP server (slave) running with unit id 1 and the register bank bound | screenshot of the CODESYS device configuration |
| M2 | Reference program downloaded and running | screenshot of the project online/run state |
| M3 | Connector connected (no `Degraded`/`Error`) | `GET /api/connectors/modbus` output showing `Connected` |
| M4 | PLC acquires external authority | authority indicator / audit showing `authority_acquired` |
| M5 | Step 1–2: ready with no pallet; start refused | screenshot of `Ready=1`, `Running=0` |
| M6 | Step 3–4: pallet detected, robot cycle | screenshot/log of `ActuatorPosition`/`SensorPosition` ramping to 100 and `RobotCycleComplete=1` |
| M7 | Step 5–6: CNC cycle and completion | screenshot/log of `CncCycleComplete=1`, `CycleComplete=1`, `PartsCompleted=1` |
| M8 | Step 7–8: stop → fault, reset clears | screenshot/log of `Fault=1` then `Fault=0` |
| M9 | Step 9: controller loss degrades safely | log of connector `Degraded` and authority `degraded`, no takeover |
| M10 | Step 10: explicit release returns to local simulation | audit showing `authority_released` |

Store screenshots/logs under a dated `docs/evidence/` folder when a real run is performed. Until then,
only the automated substitute evidence above is claimed.
