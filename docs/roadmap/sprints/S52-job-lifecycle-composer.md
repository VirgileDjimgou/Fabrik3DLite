# S52 - Authoritative job lifecycle and production job composer

## Outcome

Jobs become structured production/simulation work definitions. The server owns lifecycle and derived progress while the HMI provides a validated Job Composer for cell, scenario, pallet and deterministic tasks.

## Motivation

The current new-Job UI captures little beyond name, description and machine mode although the backend already models tasks, pallets, slots, sessions, cells and scenarios. Completion and progress must be derived from authoritative facts rather than divergent client calculations.

## Current-state assumptions to verify

- Inspect current Job/Task/Session schemas, repositories, status transitions, concurrency tokens and migrations.
- Verify pallet/slot coordinate conventions and existing scenario/cell-template compatibility metadata.
- Identify every client/server location computing progress or completion before centralizing policy.

## Scope

- Replace the simple New Job view with a structured composer covering identity, target cell, machine mode, priority, scenario/recipe, optional cell template, pallet layout, occupied slots, workpiece count and task preview.
- Generate tasks deterministically from occupied row/column slots with stable ordering and identifiers.
- Centralize legal lifecycle transitions and authoritative completion/failure semantics in a domain service/coordinator.
- Derive current task, progress and completion timestamps from persisted tasks plus execution session facts.
- Show the submitted cell, pallet, tasks, priority, scenario, progress, session and assigned simulator.

## Non-goals

- No full MES, scheduling optimizer, inventory system or arbitrary workflow language.
- No client-authoritative completion or duplicate lifecycle model.
- No redesign of S51 dispatch ownership.

## Architecture boundaries

- The server owns Job lifecycle, task truth, tenancy, authorization and concurrency.
- The HMI builds and validates operator intent, previews it and submits versioned contracts.
- The simulator reports execution facts for assigned work; it does not declare a Job complete independently.

## Domain and data changes

- Add compatible, versioned fields for target cell, priority, scenario/recipe, pallet layout and task-generation metadata where absent.
- Implement a `JobCompletionPolicy`/`JobLifecycleCoordinator` consistent with existing patterns.
- Completion rule: all required tasks Completed and execution session Completed → Job Completed with `CompletedAtUtc`.
- Define Task Failed, Session Faulted, Stopped and Cancelled behavior without conflating them.
- Derive `CurrentTaskIndex` and `ProgressPercent` from authoritative records using a documented denominator and rounding rule.

## Backend changes

- Validate no tasks, invalid pallet dimensions/slots, unsupported scenario, incompatible cell and unavailable/unauthorized target.
- Create the Job and its tasks atomically or with explicit compensation; preserve correlation and optimistic concurrency.
- Make duplicate task/session completion events idempotent.
- Expose read models required for composer options, preview validation and post-submit details without duplicating generated contracts.

## Simulator changes

- Consume the richer assigned definition through S51 contracts without recomputing task order or Job progress.
- Report task/session facts idempotently; preserve existing workflow/pallet compatibility.

## HMI changes

- Provide staged composition, validation summary and final review before submission.
- Make occupied slots and generated task mapping clear and keyboard/touch accessible.
- Show loading, empty, incompatible, unavailable, offline and submission-error states in EN/FR/DE.
- After creation, link directly to authoritative Job/session progress and target details.

## Backward compatibility and migration

- Existing Jobs and tasks remain readable and receive deterministic defaults; prefer additive fields and an idempotent migration.
- Preserve legacy API readers where needed and document schema/version behavior.

## Failure and degraded modes

- Partial creation cannot leave orphan tasks; retries use correlation/idempotency.
- A stale composer submission returns a clear conflict and refresh path.
- Partial task completion or session completion alone never marks the Job complete.
- Fault/stopped/cancelled paths retain evidence and do not overwrite previous terminal timestamps.

## Testing strategy

- Mandatory domain cases: zero tasks invalid; partial tasks not complete; all tasks with active session not complete; completed session with open tasks not complete; all tasks plus session complete; duplicate completion idempotent; failure propagation; optimistic concurrency.
- Validate deterministic row/column task generation and invalid/duplicate slots.
- HTTP/RBAC/tenant-isolation tests and generated contract checks.
- HMI component/E2E/accessibility/i18n tests for composition, review, submission and error states.
- End-to-end integration with S51 dispatch and applicable gates in `QUALITY_GATES.md`.

## Performance and security considerations

- Bound pallet/task counts and validate payload sizes server-side.
- Avoid N+1 progress queries; measure representative composer creation and Job detail retrieval.
- Enforce organization and policy checks on option discovery, creation and all lifecycle commands.

## Documentation changes

- Document Job schema/lifecycle, progress formula, failure semantics, composer workflow, migrations and operator guidance; regenerate contracts.

## Acceptance criteria

1. The composer creates a valid cell/scenario/pallet/task definition after a clear review step.
2. Invalid or incompatible definitions fail before execution with actionable errors.
3. Only the server derives progress and terminal Job state.
4. Completion requires all required tasks and the session to complete; duplicates are harmless.
5. Existing Jobs remain readable and concurrency/tenant/RBAC guarantees hold.
6. Applicable gates pass.

## Evidence expected for completion

Record lifecycle-policy tests, task-generation fixtures, migration/backward-compatibility tests, contract diff/check, HMI/E2E/a11y results and applicable global gates.

## Rollback and failure containment

Keep schema changes additive. If composer rollout is disabled, existing Job creation/read paths remain available while the server lifecycle coordinator continues to protect state.

## Follow-up items

- Persona navigation, Robot positions and manual jog are S53.
