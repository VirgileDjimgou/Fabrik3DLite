# Coherent orchestration and traceability

This document describes how job, task, pallet, part, and simulation-session identity stay coherent from the HMI command to simulator execution and persisted state.

## Identity model

- A **job** is created by an HMI operator (`POST /api/jobs`) and may embed **tasks**. Each task references a `palletId` and a pallet slot (`slotRow`/`slotColumn`).
- A **simulation session** is created when a job starts or is claimed. It links `jobId`, the claiming `simulatorId`, and a `correlationId`.
- The **simulator never creates jobs**. It claims an existing runnable job (`Created`/`Ready`) via `POST /api/jobs/{id}/claim`; the server assigns the job and its session to the claiming simulator.
- The HMI reads the same persisted state (`GET /api/jobs`, `GET /api/simulation-sessions/{id}`, `GET /api/jobs/{id}/tasks`), so a displayed task can be traced to its job, pallet slot, session, and runtime events.

## Authoritative dispatch (S51)

The operator-only execution path is **HMI intent → server dispatch → targeted simulator claim/ACK →
local execution → server-owned runtime state → HMI observation**. The simulator never selects a
production job and never starts one locally while orchestrated.

1. The HMI issues `POST /api/jobs/{id}/dispatch` (optionally with `targetCellId`/`simulatorId`).
   The server validates job state, tenant, authorization and target availability, then persists the
   assignment and session intent **before** publishing anything.
2. The server resolves one compatible target deterministically: an explicit simulator must be
   registered for the target cell; otherwise the single live simulator registered for the cell is
   chosen (lexicographically smallest when several are registered). No target → `409 dispatch_no_target`
   and the job is **not** started.
3. The server publishes a typed `ExecutionDispatchRequested` event **only to the assigned
   simulator's SignalR group** (`simulator:{id}`), never `Clients.All`.
4. The assigned simulator validates the target cell and session, adopts the session, maps the
   assigned tasks to pallet slots, starts the workflow automatically and acknowledges with the same
   correlation id (`POST /api/jobs/{id}/dispatch/ack`, state `Acknowledged` then `Running`).
5. The HMI observes `DispatchStateChanged` and `GET /api/jobs/{id}/dispatch`.

Dispatch states: `None` (legacy/local), `Pending`, `Acknowledged`, `Running`, `Failed`, `TimedOut`.
A pending dispatch whose acknowledgement window (`Orchestration:DispatchAckTimeoutSeconds`, default
20 s) elapses becomes `TimedOut`; a late ACK is rejected and the job is never silently reassigned.
Duplicate dispatch and duplicate ACK are idempotent. Foreign claims, mismatched correlation/target/
session and cross-tenant access fail deterministically (`dispatch_foreign_claim`,
`dispatch_correlation_mismatch`, `dispatch_target_mismatch`, `dispatch_session_mismatch`,
`dispatch_timed_out`). The path is additive and can be disabled with
`Orchestration:AuthoritativeDispatchEnabled=false`, which leaves the legacy start/claim path intact.

Simulators register their cell capability through the hub (`RegisterSimulator(simulatorId, cellId)`)
and re-register automatically on reconnect. The registry is in-memory and bounded; a server restart
simply requires the simulator to reconnect.

## Authoritative job lifecycle and composer (S52)

A job is a structured production/simulation work definition. The server owns its lifecycle, its
tasks and every derived value; the HMI composes operator intent and the simulator only reports
execution facts.

**Composer.** The HMI replaces the free-form new-job form with a staged composer
(identity/target → pallet/tasks → review) backed by `GET /api/jobs/composer/options`:

- `GET /api/jobs/composer/options` (read) returns the supported cells with their live availability
  and compatible scenarios, the scenario/recipe catalog, the persisted cell templates, and the
  bounded pallet/task limits.
- `POST /api/jobs/composer/preview` (Operate) validates a definition server-side without
  persisting anything and returns the deterministically generated task preview plus actionable
  errors and informational warnings (for example an unavailable target).
- `POST /api/jobs/composer` (Operate) re-validates and creates the job and its generated tasks.
  The job id is generated up front so tasks are planned deterministically; if task insertion fails
  the job is deleted (explicit compensation), so a partial creation never leaves orphan tasks.

Task generation is deterministic: occupied row/column slots are ordered by row then column
(ascending) and each task receives a stable `slotKey` (`palletId:R{row}:C{col}`), name and
`sequenceOrder`. The server bounds pallet dimensions (max 32×32), task count (max 256) and rejects
duplicate or out-of-bounds slots. Submitted compatibility metadata is validated against the
server-side catalog (`unsupported_target_cell`, `unsupported_scenario`, `incompatible_scenario`,
`unknown_cell_template`); the client never supplies the catalog.

**Lifecycle.** `JobLifecycleCoordinator` is the only writer of `ProgressPercent`,
`CurrentTaskIndex`, `TaskCount`, `CompletedTaskCount` and terminal job state. It is invoked after
every persisted task or session fact and derives an outcome from `JobLifecyclePolicy`:

- Completion requires **at least one required task**, **every required task `Completed`** and the
  execution session `Completed`; only then does the job become `Completed` with `CompletedAtUtc`.
- A failed required task or a `Faulted` session fails the job (`FailedAtUtc`); all required tasks
  `Cancelled` cancels it (`CancelledAtUtc`). `Stopped` is a distinct terminal job state and is not
  conflated with failure or cancellation.
- Terminal jobs never transition again and terminal timestamps are never overwritten, so duplicate
  task/session completion events are harmless.
- `ProgressPercent` is `floor(completedRequired * 100 / requiredTaskCount)` clamped to 0..100
  (0 when there are no required tasks). `CurrentTaskIndex` is the zero-based index of the first
  non-`Completed`/non-`Cancelled` task in sequence order (past-end sentinel when all are terminal).

**Schema and migration.** Composer fields (`Priority`, `ScenarioId`, `CellTemplateId`, `PalletId`,
`PalletRows`, `PalletColumns`, `TaskCount`, `CompletedTaskCount`, `FailedAtUtc`, `CancelledAtUtc`)
and task fields (`SlotKey`, `IsRequired`) are additive; `SchemaVersion` is `1` on legacy documents
and `2` on composer-created jobs. Legacy jobs and tasks remain readable and receive deterministic
defaults. Progress is server-derived only — the simulator does not recompute task order or job
progress and only reports task/session facts (idempotently).

## Claim flow (legacy / compatibility)

`POST /api/jobs/{jobId}/claim` with body `{ "simulatorId": "...", "correlationId": "..." }`:

| Job state | Session state | Behavior |
|---|---|---|
| `Created` / `Ready` | none | Create session (`Running`, owned by simulator), mark job `Running`, return `ClaimResultDto` (job + session + tasks) |
| `Running` | no session or unowned session | Adopt the session for the claiming simulator |
| `Running` | owned by the same simulator | Idempotent: refresh heartbeat, return the same session (duplicate claims are safe) |
| `Running` | owned by another simulator, heartbeat fresh | Reject with `409 session_already_claimed` |
| `Running` | owned by another simulator, heartbeat expired | Recovery: reassign ownership (and revive a `Faulted` session) |
| other | – | Reject with `409 job_not_claimable` |

`POST /api/jobs/{id}/start` keeps the legacy HMI-driven start flow; its session is unowned until a
simulator claims the running job (adoption). New operator workflows use the authoritative dispatch
path above; the legacy path remains for compatibility and offline demonstrations.

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

## Organizations and tenancy (S43)

Jobs, tasks, simulation sessions, alarms, messages, cell templates and historian records carry an
explicit `OrganizationId`. The server resolves the active organization from the authenticated
principal and an active membership (`X-Organization-Id` is accepted only after server-side
membership validation), and every tenant-scoped repository query filters by that organization.
Cross-organization identifiers resolve to `404` without leaking existence and a forged selection
returns a structured `403`. Pre-S43 documents are deterministically migrated to the default
organization; a missing `OrganizationId` is read as the default organization and backfilled on
write. Single-organization on-premise installs and the clearly-labelled public demo need no
configuration. See [`ORGANIZATIONS_AND_TENANCY.md`](./ORGANIZATIONS_AND_TENANCY.md) and
[ADR 0004](../adr/0004-organizations-and-tenancy.md).

## Correlation ids

- Every REST command carries an `X-Correlation-Id` header (generated client-side, or assigned by `CorrelationIdMiddleware` when absent).
- The server echoes it on the response, attaches it to every log line via the logger scope, and includes it in `JobStateChanged`, `SimulationStateChanged`, and `TaskStateChanged` SignalR events.
- Commands, persisted state, logs, and events can therefore be correlated end to end.

## Offline demonstration mode

- When the simulator cannot reach the server it runs a **local-only demo**, clearly labelled
  `LOCAL MODE — NO SERVER JOB CLAIMED` in the dashboard.
- While orchestrated (connected), the simulator's local Start action is disabled: it never invents
  or selects a production job. Execution begins only from a server-authoritative dispatch.
- In offline mode the simulator never creates jobs and never pushes session, task, machine state, or
  heartbeat data — it cannot overwrite a server session or masquerade as orchestrated execution.

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
| `dispatch_disabled` | Authoritative dispatch is disabled by configuration |
| `dispatch_no_target` | No simulator is available for the target cell; the job was not started |
| `dispatch_target_incompatible` | Requested cell/simulator is not compatible with the job target |
| `dispatch_not_requested` | Job has no active dispatch to acknowledge |
| `dispatch_foreign_claim` | Claim/ACK came from a simulator other than the assigned one |
| `dispatch_correlation_mismatch` | Claim/ACK correlation id does not match the dispatch |
| `dispatch_target_mismatch` | Claim/ACK target cell does not match the assignment |
| `dispatch_session_mismatch` | Claim/ACK session does not match the job's session |
| `dispatch_invalid_state` | Claim/ACK state is not a valid simulator acknowledgement |
| `dispatch_timed_out` | Dispatch timed out; a late ACK is rejected and the job is not running |
| `no_tasks` | Composer definition has no task and no occupied pallet slot |
| `duplicate_slot` | The same pallet slot is declared more than once |
| `slot_out_of_bounds` | A slot is outside the declared pallet dimensions |
| `invalid_pallet_rows` / `invalid_pallet_columns` | Pallet dimensions are outside 1..32 |
| `invalid_pallet_id` / `invalid_machine_mode` / `invalid_priority` | Malformed composer field |
| `too_many_tasks` | Composer definition exceeds the task bound |
| `unsupported_target_cell` | Target cell is not in the server catalog |
| `unsupported_scenario` | Scenario/recipe is not in the server catalog |
| `incompatible_scenario` | Scenario is not compatible with the selected cell |
| `unknown_cell_template` | Selected cell template does not exist for this tenant |
| `target_unavailable` | Warning: no simulator is currently registered for the target cell |
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
## Authoritative robot positions and jog (S53)

The server owns a bounded in-memory robot-position store keyed by `(cellId, robotId)`:

| Method | Route | Policy | Purpose |
|---|---|---|---|
| `GET` | `/api/robots/{cellId}/{robotId}/positions` | Read | Current authoritative snapshot, with the live authority overlaid and staleness computed at read time |
| `PUT` | `/api/robots/{cellId}/{robotId}/positions` | Operate | Assigned simulator publishes the state it executed (six joints, TCP pose, frames, status, mode) |
| `POST` | `/api/robots/{cellId}/{robotId}/jog` | Operate | Authorized dead-man press/release; published to the assigned simulator group only |
| `GET` | `/api/robots/{cellId}/{robotId}/jog/audit` | Read | Bounded jog audit trail (actor, action, outcome, correlation id) |

A report older than `Orchestration:RobotTelemetryStaleAfterSeconds` (default 3 s, matching the 2 Hz
publication cadence) is marked `isStale` and disables jog. The store is intentionally not persisted:
the simulator re-publishes every 500 ms, so a server restart only requires the simulator to reconnect.

Jog error codes: `robot_unavailable`, `robot_telemetry_stale`, `mode_not_compatible`,
`simulator_offline`, `dead_man_required`, `invalid_joint`, `invalid_direction`,
`invalid_robot_state` and `authority_replay_read_only`.
