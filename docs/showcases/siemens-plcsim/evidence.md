# Profile evidence

Two kinds of evidence are kept strictly separate:

1. **Automated substitute evidence** — produced by the committed CI tests on the real OPC UA adapter
   against the in-process OPC UA fixture. It is captured below and depends on no proprietary
   software.
2. **Manual real-run record** — a human runs TIA Portal + PLCSIM Advanced or a real S7-1500. It is
   **not executed** and the reason is documented as an explicit blocker; no screenshot from a real
   run is committed, so no live-integration claim is implied.

## Automated substitute run

Command:

```powershell
dotnet build Fabrik3D/Fabrik3D.slnx
dotnet test Fabrik3D/Fabrik3D.Server.Tests/Fabrik3D.Server.Tests.csproj --filter "FullyQualifiedName~SiemensPlcsimProfileTests"
```

Result (captured from a real run on 2026-09-26): **6 passed, 0 failed**.

| Test | What it proves |
| --- | --- |
| `Committed_siemens_profile_io_map_is_a_valid_versioned_mapping_document` | The committed `io-map.json` validates against the server mapping rules with zero errors and zero conflicts; 14 points project to 5 read + 9 write OPC UA node-map entries; every node id is a parseable Siemens `ns=3` OPC UA node id. |
| `OpcUa_fixture_plc_drives_the_siemens_profile_sequence_closed_loop` | The full closed loop over real OPC UA, asserted at every documented sequence step. |
| `Siemens_profile_authority_handshake_release_and_controller_loss_follow_s36` | Handshake, exclusivity, controller loss (`authority_lost`, no takeover) and explicit release. |
| `Siemens_profile_failure_handling_covers_bad_quality_and_disconnect` | Bad quality is propagated as bad with the last known value preserved, and PLC loss degrades the connector. |
| `Siemens_profile_wrong_tag_is_reported_and_writes_fail_closed` | A wrong tag is a diagnostics condition (13/14 monitored, no crash); writes fail closed. |
| `Siemens_profile_secure_endpoint_requires_explicit_certificate_trust` | A secure endpoint refuses an untrusted certificate and connects only with explicit development trust. |

Per-step output from `OpcUa_fixture_plc_drives_the_siemens_profile_sequence_closed_loop`:

```text
Step 1 permissives: cell Ready=true written to DB tag Ready.
Step 2 start requested without a pallet: still Ready, no motion.
Step 3 pallet detected: robot running, actuator/sensor=25 (DB tags).
Step 4 robot cycle complete: actuator/sensor=100 mirrored to the DB tags.
Step 5 CNC cycle complete: parts=1; closed-loop latency (DB tag setpoint -> DB tag sensor/count) 36.68 ms.
Step 6 stop during cycle: fault latched at actuator hold 25, no motion.
Step 7 reset: fault cleared, cell idle and ready for the next pallet.
Connector: 14 monitored items, 126 accepted writes, 0 rejected, 12 accepted updates, 29 rejected updates.
```

Authority evidence from
`Siemens_profile_authority_handshake_release_and_controller_loss_follow_s36`:

```text
Authority handshake: held -> local denied (conflict) -> degraded (authority_lost, no takeover) -> released -> local allowed.
```

Failure-handling evidence from
`Siemens_profile_failure_handling_covers_bad_quality_and_disconnect`:

```text
Failure handling: Bad quality preserved value; PLC loss -> connector Degraded (reconnects=1, lastError=-).
```

Negative-case evidence from `Siemens_profile_wrong_tag_is_reported_and_writes_fail_closed`:

```text
Negative tags/policy: missing nodeId rejected; wrong tag -> 13/14 monitored without crash; writes fail closed.
```

Certificate evidence from `Siemens_profile_secure_endpoint_requires_explicit_certificate_trust`:

```text
Untrusted secure endpoint surfaced as: ServiceResultException: [801A0000] (BadCertificateUntrusted) 'Could not verify security on OpenSecureChannel response.'
Certificate handling: untrusted secure endpoint refused; explicit development trust connects.
```

### Recorded performance

| Measurement | Value | Notes |
| --- | --- | --- |
| Closed-loop latency (DB tag setpoint → DB tag sensor/count feedback) | **36.68 ms** | includes the full robot + CNC sequence at a 100 ms sampling / 200 ms publishing interval on the local loopback fixture (Windows, .NET 8). Dominated by the documented phase cadence, not by transport. |
| Accepted connector writes during the run | **126** | 0 rejected |
| Monitored items | **14** | all mapped DB tags subscribed |
| Accepted / rejected mirror updates | **12 / 29** | rejections are the observed echo of a value Fabrik3D just wrote; the older observation is rejected as `stale-timestamp` so the commanded value stays authoritative (`sequence.md`, determinism notes). |

## Manual real-run validation checklist (not executed; blocker documented)

Marking this section **manual** is deliberate: running TIA Portal and PLCSIM Advanced (or a real
S7-1500) requires licensed proprietary software and, for a real CPU, physical hardware. That cannot
be automated safely and is not part of the mandatory CI gates.

**Documented blocker:** this workspace has no licensed TIA Portal / PLCSIM Advanced installation and
no S7-1500 hardware, so the checklist below has not been executed. It is provided with exact evidence
requirements so a training centre can complete it and attach the artifacts. Until those artifacts
exist, only the automated substitute evidence above is claimed, and no live Siemens integration is
implied.

| # | Check | Required artifact |
| --- | --- | --- |
| M1 | CPU OPC UA server enabled, secure endpoint reachable | screenshot of CPU Properties → OPC UA → Server settings and the endpoint URL |
| M2 | `Fabrik3D_Cell_DB` tags exposed and OPC UA-accessible | screenshot/export of the DB attribute table with the 14 tags |
| M3 | Project downloaded and CPU in RUN (or PLCSIM instance running) | screenshot of TIA Portal online/RUN state; exact TIA Portal, PLCSIM Advanced and firmware version strings |
| M4 | Fabrik3D trusts the CPU certificate | `GET /api/connectors/opcua` output showing `Connected` and `monitoredItemCount = 14` |
| M5 | PLC acquires external authority | authority audit showing `authority_acquired` for owner `siemens-plc` |
| M6 | Steps 1–2: ready with no pallet; start refused | screenshot/log of `Ready=1`, `Running=0` |
| M7 | Steps 3–4: load and transfer | log/screenshot of `ActuatorPosition`/`SensorPosition` ramping to 100 and `RobotCycleComplete=1` |
| M8 | Steps 5–6: machining and completion | log/screenshot of `CncCycleComplete=1`, `CycleComplete=1`, `PartsCompleted=1` |
| M9 | Steps 7–8: stop → fault; reset clears | log/screenshot of `Fault=1` then `Fault=0` |
| M10 | Step 9: CPU STOP / link loss degrades safely | log of connector `Degraded` and authority `degraded`; no takeover; bad-quality observation recorded |
| M11 | Step 10: explicit release returns to local simulation | audit showing `authority_released` |
| M12 | Timing | measured round-trip/cycle times from the run, with the reference machine noted |

Store screenshots/logs, the mapping file used, and the observed state-sequence transcript under a
dated `docs/evidence/` folder when a real run is performed. Complete the version strings (M3) so the
record is reproducible.
