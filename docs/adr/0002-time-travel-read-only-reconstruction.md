# ADR 0002 — Time-travel read-only reconstruction and mode isolation

- Status: accepted (S41)
- Context sprint: S41 — Deterministic industrial time travel
- Related: [ADR 0001](./0001-control-authority-and-source-arbitration.md), [TIME_TRAVEL.md](../architecture/TIME_TRAVEL.md)

## Context

S40 added a bounded, read-only historian and `replayTimeline` reconstructs fault/overlay state from
the local timeline. Diagnosis and teaching need more: a complete cell snapshot at a selected point in
time (robot, CNC, equipment, material, signals, alarms, faults, job/session, authority) with
deterministic playback. The safety-critical constraint is that reconstruction and replay must never
become a command path: no OPC UA/MQTT/Modbus write and no control-authority acquisition may happen
while replaying, and this must hold in code, not by UI convention.

## Decision

1. **One pure reconstruction engine.** `reconstructCell(input, targetTime)` folds a normalized,
   versioned `ReconstructionInput` into a versioned `ReconstructionSnapshot` with `readOnly: true`. It
   performs no I/O and reads no wall clock, so identical inputs yield identical snapshots regardless
   of record order.
2. **Explicit exactness.** Robot joints/pose are `exact`, `interpolated` (linear between two recorded
   samples), `held` (after the last sample) or `gap` (no sample at/before the target). Missing
   evidence is reported as a `ReconstructionGap`, never fabricated. Interpolation is documented and
   mapped to `stale` quality in the normalized twin model.
3. **Sources are read-only and de-duplicated.** Historian access uses the S40 GET queries only;
   `combineReconstructionInputs` merges historian and local data keyed by correlation id + sequence +
   kind (timestamp + sequence + kind + source otherwise), with the historian winning on collision.
   Offline, the local timeline is the sole source.
4. **Hard isolation by construction.** `ReplayIsolationGate` wraps every connector write
   (`GuardedProtocolWriter`) and every authority acquisition behind `guardProtocolWrite` /
   `guardAuthorityAcquire`, which return a blocked result before running the wrapped function while
   replay is active. Attempts are recorded with protocol/target/code.
5. **Mode gate.** `TimeTravelModeGate` activates the isolation gate on `enterReplay()` and always
   releases it on `exitReplay()`, restoring the previous `live`/`simulation` mode. The `replay`
   authority mode remains fail-closed in the shared domain rules.
6. **One controller.** `TimeTravelController` provides play/pause/step/jump/speed/markers with a
   logical cursor, so stepping is frame-rate independent. It exposes no command, connector or
   authority method.

## Consequences

- Existing `replayTimeline`, `TelemetryReplay` and offline/local behavior are unchanged; the time
  travel surface is additive and mode-gated, and removing it restores S40 behavior.
- If isolation cannot be proven, the sprint fails rather than allow a replay write path (the brief's
  explicit rollback rule).
- Historian authorization is still interim and unauthenticated until S42; time travel inherits that
  documented boundary and adds no new exposure beyond read-only queries.
