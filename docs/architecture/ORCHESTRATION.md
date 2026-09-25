# Coherent orchestration and traceability

This document describes how job, task, pallet, part, and simulation-session identity stay coherent from the HMI command to simulator execution and persisted state.

## Identity model

- A **job** is created by an HMI operator (`POST /api/jobs`) and may embed **tasks**. Each task references a `palletId` and a pallet slot (`slotRow`/`slotColumn`).
- A **simulation session** is created when a job starts or is claimed. It links `jobId`, the claiming `simulatorId`, and a `correlationId`.
- The **simulator never creates jobs**. It claims an existing runnable job (`Created`/`Ready`) via `POST /api/jobs/{id}/claim`; the server assigns the job and its session to the claiming simulator.
- The HMI reads the same persisted state (`GET /api/jobs`, `GET /api/simulation-sessions/{id}`, `GET /api/jobs/{id}/tasks`), so a displayed task can be traced to its job, pallet slot, session, and runtime events.

## Claim flow

`POST /api/jobs/{jobId}/claim` with body `{ "simulatorId": "...", "correlationId": "..." }`:

| Job state | Session state | Behavior |
|---|---|---|
| `Created` / `Ready` | none | Create session (`Running`, owned by simulator), mark job `Running`, return `ClaimResultDto` (job + session + tasks) |
| `Running` | no session or unowned session | Adopt the session for the claiming simulator |
| `Running` | owned by the same simulator | Idempotent: refresh heartbeat, return the same session (duplicate claims are safe) |
| `Running` | owned by another simulator, heartbeat fresh | Reject with `409 session_already_claimed` |
| `Running` | owned by another simulator, heartbeat expired | Recovery: reassign ownership (and revive a `Faulted` session) |
| other | – | Reject with `409 job_not_claimable` |

`POST /api/jobs/{id}/start` keeps the HMI-driven start flow; its session is unowned until a simulator claims the running job (adoption).

## Ownership enforcement

Only the session's owning simulator may:

- push session state (`PUT /api/simulation-sessions/{id}/state`),
- send heartbeats (`POST /api/simulation-sessions/{id}/heartbeat`),
- update task status (`PUT /api/tasks/{id}/status`),
- push machine state for that session (`PUT /api/machine-state/current`).

Violations return `409 session_not_owned`. This guarantees offline or foreign simulators cannot overwrite an unrelated server session.

## Task ↔ pallet slot mapping

The claim response contains the job's tasks. The simulator maps each task to the local pallet slot by (`palletId` null/empty or equal to the machined pallet id) and (`slotRow`, `slotColumn`):

- Slot selection → task `Running` (sets `startedAtUtc`)
- Slot completion → task `Completed` (sets `completedAtUtc`)
- The active task id is included in session state and machine state reports.

Task transitions follow `TaskStateTransitionRules` (`Pending`/`Ready` → `Running` → `Completed`/`Failed`, `Cancelled` from open states). Invalid transitions are rejected with `409 invalid_task_transition`, so duplicate commands are rejected consistently.

## Concurrency protection

- Every mutating command is version-guarded: `Job`, `MachiningTask`, and `SimulationSession` documents carry a `Version` field, and updates use an atomic filter (`id` + `version`). Lost writers receive `409 concurrent_modification`.
- Job lifecycle rules (`JobStateTransitionRules`) reject duplicate or out-of-order commands with `409 invalid_job_transition`.

## Heartbeat and faulted state

- The simulator heartbeats every 5 s while a session is active.
- `HeartbeatMonitorService` scans running/paused sessions every `Orchestration:HeartbeatCheckIntervalSeconds` (default 5 s) and marks sessions whose heartbeat is older than `Orchestration:HeartbeatTimeoutSeconds` (default 15 s) as `Faulted`, broadcasting `SimulationStateChanged`.
- The same monitor also expires external control-authority leases (S36); see `CONTROL_AUTHORITY.md`. There is a single heartbeat scanner, not one per concern.
- A heartbeat from the owning simulator revives a faulted session back to `Running` (recovery).
- The HMI displays the session status (including `Faulted`) and the last heartbeat time.

## Control authority (S36)

Sessions describe *what the simulator executes*; `ControlAuthority` describes *who may drive the
actuators* for a scope. They are separate concepts: a simulator can own a session while being denied
actuator control because an external controller holds `external-controller` authority for the cell.

- Modes `local-simulation`, `external-controller`, `observed-twin`, `replay`; exactly one authority per
  equipment/actuator scope.
- Handover is explicit, precondition-checked and audited; concurrent acquisition fails closed with
  `authority_conflict`.
- Loss of an external controller degrades its authority (`authority_lost`) and never silently reverts to
  another authority.
- REST endpoints under `/api/control-authority` and the `ControlAuthorityChanged` SignalR event expose
  the state; the full model is documented in [`CONTROL_AUTHORITY.md`](./CONTROL_AUTHORITY.md).

## Telemetry and event historian (S40)

Live orchestration and durable history are separate concerns. The historian persists *selected*
telemetry samples and orchestration events (commands, state transitions, alarms, acknowledgements,
authority changes, fault actions) with source, quality, timestamp and correlation id.

- Ingestion is batched, validated, rate-limited and bounded: `POST /api/historian/telemetry` and
  `POST /api/historian/events`.
- Queries are read-only and deterministic: `GET /api/historian/telemetry|events|status`, filterable by
  session/equipment/signal/kind/time/severity.
- Retention is bounded by age and document count with a background pruner; sampling is conservative
  and never full-rate by default.
- The historian is disabled by default and additive. A disabled or failing historian never breaks live
  orchestration or the simulator; storage failures are logged, counted, retried once and dropped.
- The schema, indexes, measured numbers and the criteria for adopting a dedicated time-series database
  are documented in [`TELEMETRY_HISTORIAN.md`](./TELEMETRY_HISTORIAN.md).

## Authentication and authorization (S42)

Every orchestration endpoint and hub method is authenticated and authorized server-side; hidden UI is
not a control. The server validates JWT bearer tokens (external OIDC in production, a guarded
dev/test mode for CI/local) and maps roles to named policies (`Read`, `Operate`, `Engineer`,
`Instruct`, `Admin`). Mutating command, state, task, heartbeat, cell-template, mapping-apply and
control-authority operations require the appropriate policy; violations return a structured `401`
(`unauthorized`) or `403` (`forbidden`). The hub accepts an `access_token` query parameter during
negotiation and uses the same policies as REST. Audit records (authority, alarms, templates, mapping)
carry the authenticated subject and role. See [`IDENTITY_AND_RBAC.md`](./IDENTITY_AND_RBAC.md) and
[ADR 0003](../adr/0003-identity-and-rbac.md).

## Correlation ids

- Every REST command carries an `X-Correlation-Id` header (generated client-side, or assigned by `CorrelationIdMiddleware` when absent).
- The server echoes it on the response, attaches it to every log line via the logger scope, and includes it in `JobStateChanged`, `SimulationStateChanged`, and `TaskStateChanged` SignalR events.
- Commands, persisted state, logs, and events can therefore be correlated end to end.

## Offline demonstration mode

- When the simulator cannot reach the server, or when no runnable job exists, it runs a **local-only demo**, clearly labelled `LOCAL DEMO — offline` in the dashboard.
- In offline mode the simulator never creates jobs and never pushes session, task, machine state, or heartbeat data — it cannot overwrite a server session.

## Error codes

| Code | Meaning |
|---|---|
| `validation_failed` | Invalid request payload |
| `invalid_job_transition` | Job command not allowed in the current state |
| `invalid_task_transition` | Task status change not allowed in the current state |
| `concurrent_modification` | Version guard lost against another writer |
| `session_not_owned` | Caller is not the claiming simulator of the session |
| `session_already_claimed` | Job session is owned by another live simulator |
| `job_not_claimable` | Job state does not allow claiming |
| `task_not_runnable` | Task's job has no active session |
| `authority_conflict` | Another owner holds the control authority for the scope |
| `authority_not_acquired` | Caller does not hold the authority it needs to command |
| `authority_handover_rejected` | A handover precondition failed (unhealthy connector, unconfirmed takeover, bad token) |
| `authority_lost` | External controller lease expired / owner unhealthy; commands fail closed |
| `authority_replay_read_only` | Replay tried to acquire authority or command |
| `authority_not_owner` | Caller is not the holder of the authority |
| `unauthorized` | Authentication is required (missing/invalid/expired token) |
| `forbidden` | Authenticated principal lacks the required role/policy |
| `invalid_role` | Requested dev/test identity role is not one this server can issue |
