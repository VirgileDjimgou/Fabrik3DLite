# S04 - Coherent orchestration and traceability

## Outcome

Make job, task, pallet, part, and simulation-session identity coherent from HMI command to simulator execution and persisted state.

## Scope

- Stop creating an unrelated implicit job whenever the simulator starts a pallet.
- Introduce an explicit claim/assignment flow for an existing runnable job and simulation session.
- Map pallet slots to backend tasks and update task status during execution.
- Add correlation identifiers to commands, state updates, logs, and events.
- Add optimistic or explicit transition protection against concurrent operator commands.
- Detect stale simulator heartbeats and expose a disconnected/faulted state.
- Keep an offline demonstration mode, clearly identified as local-only.

## Tests and gates

- Unit tests for all job/task/session transitions.
- Integration tests for claim, heartbeat expiry, concurrent commands, and recovery.
- End-to-end test proving that one selected HMI job drives the same simulator session and pallet.
- Verify that duplicate commands are safe or rejected consistently.

## Acceptance criteria

- A displayed task can be traced to its job, pallet slot, session, and runtime events.
- HMI and simulator cannot silently operate on different active jobs.
- Offline mode cannot overwrite an unrelated server session.

## Non-goals

- No multi-cell scheduler yet.
