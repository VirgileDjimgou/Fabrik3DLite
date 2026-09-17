# S13 - Fault injection, timeline, and replay

## Outcome

Teach abnormal industrial situations through reproducible fault scenarios and a unified event timeline.

## Scope

- Add typed fault definitions for collision risk, unreachable target, CNC fault, conveyor blockage, missing pallet, stale heartbeat, and communication loss.
- Allow scenario-controlled and instructor-triggered fault injection.
- Record commands, state transitions, alarms, acknowledgements, and key telemetry in an ordered timeline.
- Add pause-on-fault, recovery instructions, and controlled reset/retry paths.
- Implement deterministic replay from recorded events where possible.
- Clearly label simulated faults so they cannot be confused with real equipment data.

## Tests and gates

- Unit tests for each fault trigger, latch, acknowledgement, and recovery rule.
- Timeline ordering and correlation-ID tests.
- Replay determinism tests from fixed event fixtures.
- Network interruption/reconnection integration tests.
- End-to-end learner recovery from at least three fault scenarios.

## Acceptance criteria

- A fault can be reproduced from a scenario file.
- Timeline entries identify source, severity, session, equipment, and timestamp.
- Recovery cannot silently skip mandatory acknowledgement or reset conditions.

## Non-goals

- No high-frequency time-series database yet.
