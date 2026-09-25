# Fabrik3D sprint autopilot state directory

This directory holds the operational state of the bounded autonomous sprint batch. It is **not** roadmap truth: the authoritative roadmap remains `docs/roadmap/roadmap.json` and `docs/roadmap/state.json`, owned exclusively by the existing `scripts/sprint-runner.mjs`. Deleting this directory never invalidates a completed product sprint.

## Files

| File | Committed | Purpose |
|---|---|---|
| `state.json` | yes | Persistent bounded batch state machine (batch id, status, completed count, current sprint, stop reason). Initial committed value is `idle`. |
| `HUMAN_REQUIRED.json` | yes, only when present | Machine-readable human gate. While it exists, no following sprint may start. Created by the orchestrator; cleared only by `sprint:batch:resolve-gate`. |
| `GATE_HISTORY.json` | yes, created on first resolution | Audit trail of resolved human gates with the human resolution note. |
| `WORKER_PROMPT.md` | yes | The single authoritative atomic worker prompt delivered to each child OpenCode session. |
| `STOP` | no (ignored) | Graceful manual stop request written by `sprint:batch:stop`. |
| `batch.lock` | no (ignored) | Single-batch lock (`batchId`, `pid`, `host`, `createdAt`). |
| `worker-result.json` | no (ignored) | Last structured child-worker result, re-read and independently verified by the orchestrator. |
| `logs/` | no (ignored) | Orchestrator log and per-sprint worker logs, bounded in size. |
| `test-scenario.json`, `test-invocations.log` | no (ignored) | Deterministic test fixtures for the orchestrator test suite only. |

## Design choices

- `state.json`, the human gate and the gate history are committed because they are the durable audit and handoff record: a new developer or agent can determine what ran, what stopped it and what a human must do from the repository alone.
- Locks, stop requests, raw worker logs and transient worker results are ignored because they are process-local operational artifacts and must never produce merge noise.
- The autopilot never rewrites `docs/roadmap/state.json` or `docs/roadmap/roadmap.json`; it calls the existing `scripts/sprint-runner.mjs` for every activation and completion.

See `../AUTOPILOT.md` for the full operating contract.
