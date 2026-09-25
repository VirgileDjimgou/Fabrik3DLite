# Deterministic industrial time travel (S41)

S41 turns the S40 historian and the in-memory simulator timeline into usable diagnosis and teaching
evidence: the simulated reference cell can be reconstructed at a selected point in time and reviewed
without ever issuing a command.

Scope and honesty:

- **Implemented now:** a framework-independent, deterministic reconstruction engine; a read-only
  replay controller (play/pause/step/jump-to-event/speed/markers); a hard code-level isolation gate
  that blocks connector writes and authority acquisition during replay; read-only historian and local
  timeline sources with de-duplicating combination; an engineering/instructor time-travel surface
  (`?view=time-travel`) with LIVE/SIMULATION/REPLAY mode indication and a deterministic reconstructed
  scene.
- **Simulated:** every record and every reconstruction is simulated data (`simulated: true` on local
  entries; the historian serves simulator/connector samples). No real machine data is used, and no
  reconstruction is ever written back to equipment.
- **Planned / later:** authentication and authorization on historian queries (S42), tenancy (S43),
  training sessions (S44), observability (S49). No physics re-simulation engine, no new protocol and
  no historian redesign are added.

## Architecture boundary

```
Local timeline (in-memory) ─┐
                            ├─► ReconstructionInput (versioned, read-only)
S40 historian (read-only)  ─┘        │
GET /api/historian/telemetry|events  ▼
                              reconstructCell(input, targetTime)
                                     │  pure fold + deterministic interpolation
                                     ▼
                              ReconstructionSnapshot (schema 1.0, readOnly: true)
                                     │
                     ┌───────────────┴────────────────┐
                     ▼                                ▼
        reconstructTwinStates()               TimeTravelController + UI
        (NormalizedEquipmentState, source:    (play/pause/step/jump/speed/markers,
         "replay")                             ReplayIsolationGate)
```

- Reconstruction logic lives in `fabrik3d.client/src/timeTravel/` and is pure and unit-testable; it
  reads no wall clock and performs no I/O.
- Replay is a **read-only consumer** of recorded data plus deterministic transforms.
- Server history access is through the S40 read-only query endpoints only. The historian has no
  command path, and time travel adds none.
- The local timeline remains the source of truth offline.

## Reconstruction snapshot (schema 1.0)

`ReconstructionSnapshot` carries `schemaVersion: "1.0"`, `targetTime`, `source`
(`local-timeline` / `historian` / `combined`), `sessionId`, `readOnly: true` and:

| Field | Contents |
| --- | --- |
| `robot` | joint values (SI radians), optional Cartesian pose, `exactness`, `sampleTimestamp` |
| `cnc` | state, door, fixture clamped, spindle running, part present |
| `equipment[]` | per-equipment execution state, operating mode, measurements |
| `material` | pallet id, slot index, material state |
| `signals[]` | signal id, value, quality, source, timestamp |
| `alarms[]` | alarm id, code, severity, lifecycle state |
| `faults[]` | fault id, severity, active flag, last action |
| `job` | session/job/task ids, phase, progress |
| `authority` | scope, mode, state, owner, timestamp |
| `gaps[]` | explicit missing-evidence entries (`field`, `reason`, `targetTime`) |
| `diagnostics[]` | skipped/corrupt-record diagnostics |

### Record payload conventions

The engine folds records uniformly, whether they come from the local timeline or from the historian.
Documented payload fields:

- `state-transition`: `domain` (`cnc` / `workflow` / `material`), `to`, optional `phase`, `progress`,
  `sessionId`, `jobId`, `taskId`, `measurements`, `operatingMode`; CNC payloads may carry `doorState`,
  `fixtureClamped`, `spindleRunning`, `partPresent`; material payloads carry `palletId`, `slotIndex`,
  `materialState`.
- `command`: `command`, optional `jobId`, `sessionId`, `phase`, `progress`.
- `alarm`: `alarmId` (or `faultId`), `code`, `severity`, `action` (`raise` / `clear`).
- `acknowledgement`: `alarmId`.
- `fault-action`: `faultId`, `action` (`acknowledge` / `reset` / `retry` / `clear`).
- `telemetry`: `signalId`, `value`, `quality`.

Historian events are mapped to these kinds (`command→command`, `state-transition→state-transition`,
`alarm→alarm`, `acknowledgement→acknowledgement`, `fault→fault-action`, `event→telemetry`). Historian
`authority` events feed the read-only authority timeline.

### Robot exactness (exact vs interpolated)

Trajectory is sourced from recorded joint samples. Historian telemetry records a joint array under a
signal id ending in `.jointValues` with a JSON-array `textValue` (one sample per timestamp,
SI radians). Exactness is reported explicitly:

- `exact` — a recorded sample exists exactly at the target time;
- `interpolated` — the joints/pose are linearly interpolated between the two surrounding recorded
  samples. Linear interpolation is exact for constant-velocity motion and an honest approximation
  otherwise;
- `held` — the target is after the last recorded sample and the last sample is held;
- `gap` — no recorded sample exists at or before the target: no state is fabricated.

`reconstructTwinStates` maps `exact` → `good`, `interpolated`/`held` → `stale`, `gap` → `invalid`, so
consumers never mistake an approximation for a recorded sample.

## Read-only enforcement

The isolation gate (`timeTravel/isolation.ts`) is a hard, code-level barrier:

- While replay is active, `guardProtocolWrite` / `guardAuthorityAcquire` return a blocked result
  **before** the wrapped function runs. `GuardedProtocolWriter` is the only object callers hold, so
  OPC UA, MQTT and Modbus writes are impossible by construction.
- Every blocked attempt is recorded with protocol, target, code (`authority_replay_read_only`) and
  timestamp.
- `TimeTravelModeGate` activates the gate on `enterReplay()` and always deactivates it on
  `exitReplay()`, restoring the previous `live`/`simulation` mode. Exiting replay therefore resyncs to
  live/simulation behavior without leaving a read-only barrier (or a live write path) behind.
- The `replay` authority mode already fails closed in the shared domain/twin rules
  (`authority_replay_read_only`); the gate adds the simulator-side protocol barrier.

Automated tests (`isolation.test.ts`) assert the writers are never called while replaying for all
three protocols, that authority acquisition is refused, and that both are permitted again after exit.

## Sources: historian, local timeline, offline fallback

- When a server session is selected, `loadHistorianInput` queries the S40 read-only endpoints
  (`GET /api/historian/events` and `GET /api/historian/telemetry`) with `sessionId`/`fromUtc`/`toUtc`
  filters, bounded `limit` and pagination up to a documented cap.
- Offline (historian disabled or unreachable) the local in-memory timeline is the only source.
- `combineReconstructionInputs` combines the two **without duplication**: records are keyed by
  correlation id + sequence + kind (or timestamp + sequence + kind + source when no correlation id
  exists), trajectory samples by timestamp, authority events by timestamp + scope. The historian wins
  on collision; local-only records are appended. The result is labelled `combined`.

## Controller semantics

`TimeTravelController` owns a logical cursor in epoch milliseconds:

- `play` / `pause`; `stepForward` / `stepBackward` use a fixed logical `stepMs` (default 500 ms) and
  pause playback; `seekMs` / `seekTo`; `jumpToMarker`; `setSpeed` (0.25×–8×).
- `advance(logicalDeltaMs)` is **frame-rate independent**: the cursor depends only on the accumulated
  logical delta and the current speed, so the same total delta reaches the same cursor and snapshot
  whether it arrives as one or many frames.
- Markers are derived deterministically from the window for alarms, fault actions, commands and phase
  transitions (`extractMarkers`).
- The controller exposes no command, connector or authority method; its only output is a snapshot with
  `readOnly: true`.

Missing evidence is reported as a `ReconstructionGap` (`no-history`, `no-trajectory-samples`,
`no-sample-before-target`, `no-authority-timeline`, `invalid-target-time`); corrupt records are skipped
with a diagnostic and never crash reconstruction.

## UI and 3D

`?view=time-travel` opens the engineering/instructor surface (`TimeTravelPage.vue`):

- An unmistakable LIVE / SIMULATION / REPLAY indicator (text plus non-decorative color) and a banner
  that states the read-only guarantee while replaying.
- Play/pause, step forward/back, speed, a keyboard-accessible scrubber and clickable event markers
  (with an accessible title carrying timestamp, kind and label).
- Reconstructed panels for robot, CNC, material, signals, alarms, faults, job/session, authority,
  normalized twin states and explicit evidence gaps.
- A deterministic reconstructed scene (`TimeTravelScene.vue`) driven only by reconstructed joint,
  material and exactness values; it never dispatches a command. The operator HMI is unchanged.

## Failure and degraded-mode behavior

- Missing history → explicit gaps, read-only UI, never fabricated samples.
- Corrupt/partial data → skipped with diagnostics, no crash.
- Exit replay → the controller pauses, the isolation gate is released and the mode returns to the
  previous live/simulation value.
- The historian being disabled or unreachable does not break live orchestration; time travel simply
  falls back to the local timeline.

## Recorded performance

`reconstruction.performance.test.ts` rebuilds a documented finite window (5,000 records + 1,000
trajectory samples) and reconstructs it at 200 target times. Measured on the sprint development
workstation: **200 reconstructions in ≈1,392 ms (≈7.0 ms/reconstruction)**, with a regression bound of
4,000 ms. Memory is bounded by the caller: historian windows are loaded with a bounded page size and a
documented maximum, and the local timeline is bounded by its recorder.

These numbers are methodology-bound and machine-specific; they replace an unsupported claim rather
than guarantee a fixed latency.

## Determinism and test coverage

- Reconstruction is deterministic for identical inputs and independent of record order
  (`reconstruction.test.ts`).
- Stepping is frame-rate independent and deterministic at every speed (`controller.test.ts`).
- Protocol isolation is proven with spy fixtures for OPC UA/MQTT/Modbus writes (`isolation.test.ts`).
- Historian → reconstruction mapping, pagination and de-duplicating combination
  (`historianSource.test.ts`).
- Normalized twin expression and quality mapping (`twin/replay.test.ts`).
- Component behavior of the surface (`TimeTravelPage.test.ts`) and end-to-end replay workflow plus
  visual regression (`e2e/time-travel.spec.ts`, `e2e/time-travel-visual.spec.ts`).
