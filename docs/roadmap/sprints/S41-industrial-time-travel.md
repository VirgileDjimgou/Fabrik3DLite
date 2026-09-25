# S41 - Deterministic industrial time travel

## Outcome

Building on the existing replay system, the local timeline, and the S40 historian, the user can reconstruct the simulated cell at a selected point in time: robot pose, CNC state, equipment states, material position, signals, alarms, fault state, job/task/session, and control authority. Replay is strictly read-only, can never issue commands through OPC UA, MQTT, or Modbus, visually distinguishes LIVE, SIMULATION, and REPLAY, and provides play, pause, step, jump-to-event, speed, and timeline markers with tested determinism.

## Motivation

Time travel turns historian data into usable diagnosis and teaching evidence: "what happened at the moment of the fault" becomes reconstructable and reviewable.

## Current-state assumptions to verify

- `src/timeline/TimelineRecorder.ts` and `src/timeline/replay.ts` implement a pure reducer over recorded timeline entries.
- `src/twin/replay.ts` holds `TelemetryReplay` emitting state records only, with no command interface.
- `src/faults` records raise/clear actions; `src/learning` consumes recovery evidence.
- S40 historian persists selected telemetry/events server-side with query filters.
- Control authority exists (S36) and replay must never acquire command authority.

## Scope

- Define a deterministic reconstruction model that, given a timeline/historian selection and a target time or event, produces a complete cell state snapshot:
  - robot joint/pose state (from recorded trajectory samples or deterministic re-simulation between samples, documented precisely);
  - CNC sub-state, fixture, spindle, door;
  - equipment states and material/pallet/slot positions;
  - signal values with quality/source;
  - alarms and lifecycle state;
  - active fault overlays;
  - job/task/session identifiers and progress;
  - control authority timeline.
- Implement the time-travel controller:
  - play, pause, step forward/back, jump-to-event, speed control, timeline markers for alarms/faults/commands/phase transitions;
  - deterministic stepping independent of frame rate;
  - read-only enforcement: replay mode must make every command path inert, including connector writes and authority requests; add tests proving OPC UA/MQTT/Modbus writes cannot occur in replay.
- Extend `src/twin` replay so reconstructed state is expressed through the existing normalized model where practical, distinguishing sources.
- Source historian data when a server session is selected; fall back to local timeline in offline mode; document how the two combine without duplication.
- UI: a time-travel surface with clear LIVE / SIMULATION / REPLAY mode indication (text plus non-decorative color consistent with the HMI design system), timeline scrubber, markers, event list, and reconstructed state panels. Engineering/instructor surface; operator HMI unchanged.
- 3D: replay drives the same scene visualization from reconstructed state without issuing commands; pose/material reconstruction must be visually correct and stable.

## Non-goals

- No full physics re-simulation engine; reconstruction may interpolate/replay recorded state but must be honest and documented about what is exact vs interpolated.
- No live editing during replay.
- No new protocols, no historian redesign.
- No training assessment changes (S44).

## Architecture boundaries

- Replay is a read-only consumer of recorded data plus deterministic transforms.
- Connectors and authority are hard-disabled in replay by construction, not by UI convention.
- Reconstruction logic is framework-independent and unit-testable.
- Server history access is through read-only query APIs.

## Domain and data model changes

- Reconstruction snapshot model (versioned) and event-marker model.
- Additive historian fields only if required for reconstruction (for example trajectory samples); document schema version.

## Backend changes

- Read-only historian query support for reconstruction windows (if not already sufficient from S40).
- No command endpoints are involved; document that replay never calls them.

## Simulator changes

- `src/timeline`/`src/twin`: reconstruction engine, mode gate, marker extraction.
- Time-travel UI components and `?view=time-travel` harness.
- Scene host support for replay mode (no command dispatch, stable visuals).
- Local timeline remains source of truth offline.

## HMI and UX changes

- Engineering/instructor surface only. If a mode indicator is appropriate for operators, show the current mode clearly without adding replay controls to the operator HMI.
- EN/FR/DE; keyboard scrubbing; accessible markers/events.

## 3D and visual requirements

- LIVE/SIMULATION/REPLAY must be unmistakable in the 3D context (for example a persistent mode banner and muted replay palette) without hiding the scene.
- Reconstructed poses must match recorded state within documented tolerances; visual regression captures representative replay frames.
- Performance: replay must not degrade normal live rendering after exit; no leaked listeners/resources.

## Protocol and security requirements

- Replay mode disables all connector write paths and authority acquisition; tests prove no OPC UA/MQTT/Modbus write can be emitted while replaying.
- Historian queries are read-only, filtered, paginated, and bounded.
- No secrets in reconstructed payloads.

## Backward compatibility

- Existing local timeline and fault recovery flows keep working.
- Existing twin replay API remains available; extensions are additive.
- Operator HMI and live workflows unchanged.

## Migration requirements

- Reconstruction snapshot version with compatibility readers; old timelines replay under documented approximations.
- Historian schema migration reused from S40.

## Failure and degraded-mode behavior

- Missing history: reconstruction reports gaps explicitly and keeps UI read-only; never fabricates samples.
- Corrupt/partial data: skip with diagnostics; no crash.
- Exit replay: return to LIVE/SIMULATION with re-synced current state; if synchronization is unsafe, require explicit operator confirmation.

## Testing strategy

- Deterministic reconstruction tests: same input + target time reproduces identical snapshots; stepping is frame-rate independent.
- Command-isolation tests: assert zero connector/authority calls in replay mode (spy fixtures).
- Jump-to-event tests for alarms/faults/commands/phase transitions.
- Component tests for scrubber, markers, mode indicator, and event list.
- 3D replay visual tests and resource-cleanup checks after exit.
- Integration test: historian session → reconstruction → expected state sequence.

## Performance requirements

- Reconstruction of a documented window completes below a recorded bound; scrubbing stays responsive (target recorded).
- Memory bounded for long timelines; windowed loading.
- No frame-time regression after exiting replay.

## Security considerations

- Read-only guarantees enforced in code, not UI.
- Historian access bounded; interim authorization documented until S42.

## Documentation changes

- Extend `docs/architecture/FAULTS_TIMELINE_REPLAY.md` with reconstruction exactness/limits and mode semantics; add `docs/architecture/TIME_TRAVEL.md`.
- Update `DIGITAL_TWIN_TELEMETRY.md`, `TELEMETRY_HISTORIAN.md`, `README.md`, and the architecture ADR index.

## Acceptance criteria

1. A user can select a session/event and reconstruct robot, CNC, equipment, material, signals, alarms, faults, job/session, and authority state at that point.
2. Play/pause/step/jump/speed/markers work deterministically and are frame-rate independent.
3. Replay cannot emit any OPC UA, MQTT, or Modbus write and cannot acquire authority; automated tests prove it.
4. LIVE/SIMULATION/REPLAY are visually and semantically distinguished in the UI and 3D context.
5. Missing history produces explicit gaps, never fabricated state.
6. Exiting replay restores live/simulation behavior safely.
7. All builds/tests/visual/contracts gates pass.

## Evidence expected for completion

```text
simulator type-check/test/build (N passed, listing reconstruction + isolation tests)
connector-isolation evidence (zero write calls)
visual regression replay frames + mode indication
historian→reconstruction integration evidence
recorded reconstruction timing
dotnet build/test (pass)
npm run contracts:check (pass)
```

## Rollback and failure containment

Time travel is additive and mode-gated; removing the UI and reconstruction engine restores S40 behavior. If isolation cannot be proven, fail the sprint rather than allow a replay write path.

## Follow-up items that must not leak into this sprint

- Authentication/RBAC (S42), tenancy (S43), training sessions (S44), instructor dashboard (S45).
- Release packaging/observability (S48/S49).
