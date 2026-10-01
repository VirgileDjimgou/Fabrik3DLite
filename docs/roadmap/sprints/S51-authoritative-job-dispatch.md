# S51 - Authoritative job dispatch and remote cell execution

## Outcome

A Job started from the HMI is deterministically assigned to a compatible cell/simulator and begins executing without a second Start action in the simulator. The authoritative path is HMI intent → server dispatch → targeted simulator claim/ACK → local execution → server-owned runtime state → HMI observation.

## Motivation

The current simulator bridge discovers a runnable `Created`/`Ready` Job and initiates `start()` locally. Pause, resume and stop can arrive externally, but Start is not a complete targeted workflow. This permits ambiguous ownership and prevents a credible operator-only execution flow.

## Current-state assumptions to verify

- Inspect `SimulatorOrchestrationBridge`, Job/session endpoints, SignalR hubs, heartbeats and control-authority code before choosing contract names.
- Confirm existing Job, SimulationSession, tenant, concurrency and correlation fields before adding concepts.
- Confirm how a simulator identifies its cell and capabilities and how reconnect/adoption currently behaves.
- Preserve the existing local/offline demonstration path and label it separately from orchestrated execution.

## Scope

- Add explicit cell/simulator identity, execution target, assignment and dispatch state only where existing models do not already cover them.
- Implement a server-authoritative Start command that validates Job state, tenant, authorization, compatibility and target availability; prepares the session; publishes a targeted request; and reports pending, acknowledged, running, failed or timed-out dispatch state.
- Add a typed simulator external-start handler that validates its target, adopts the server session, maps the assigned tasks/workflow, starts automatically and acknowledges with the same correlation id.
- Preserve external pause/resume/stop through the same ownership model.
- Make dispatch, claim and ACK idempotent and recoverable across reconnect/restart.

## Non-goals

- No Job Composer redesign; S52 owns that work.
- No message broker, MQTT-as-application-bus or client-authoritative assignment.
- No arbitrary simulator selection, duplicate production ownership or removal of offline demo mode.

## Architecture boundaries

- The server owns assignment, Job/session lifecycle, authorization, tenancy and command authority.
- The simulator executes only assigned work and never invents or selects production Jobs.
- The HMI issues operator intent and observes state; it does not address Three.js internals.
- Use REST for explicit Start intent and SignalR groups/scoping for targeted live dispatch. Avoid tenant/cell-specific `Clients.All` broadcasts.
- Industrial adapters remain optional boundaries; replay is read-only.

## Domain and data changes

- Prefer additive fields such as `TargetCellId`, `AssignedSimulatorId`, `DispatchState`, `DispatchCorrelationId` and `SimulationSessionId` on existing authoritative records.
- Define legal dispatch transitions, timeout/failure reasons and optimistic-concurrency behavior.
- Add a versioned/idempotent migration for persisted Jobs/sessions if required; old records remain readable.

## Backend changes

- Add or extend `POST /api/jobs/{id}/start` with deterministic target resolution and policy checks.
- Publish a typed targeted execution request only after persisting assignment/session intent.
- Accept claim/ACK/running transitions only from the assigned simulator and matching tenant/correlation/session.
- Reject foreign claims, incompatible targets, stale versions and illegal Job states without leaking cross-tenant existence.
- Reconcile duplicate requests, delayed ACKs, stale heartbeats and already-running sessions deterministically.

## Simulator changes

- Add `onExternalStart` or equivalent typed handling to the orchestration bridge.
- Validate simulator/cell target and session identity, adopt the provided session, select the assigned pallet/workflow, and start without a local button.
- Re-subscribe and reconcile on SignalR reconnect or browser refresh without starting a second workflow.
- Keep `LOCAL DEMO` and `ORCHESTRATED EXECUTION` explicit; offline work must not write false production state.

## HMI changes

- Start reports target, pending dispatch, acknowledgment, running, timeout and failure with actionable detail.
- Pause/resume/stop remain coherent with the assigned target and show permission/authority and pending/success/failure.

## Backward compatibility and migration

- Existing Jobs, sessions, cells, mappings and scenarios remain readable; additive defaults represent unassigned legacy records.
- Existing local demonstration behavior remains available but cannot masquerade as server-orchestrated execution.

## Failure and degraded modes

- Cover simulator refresh, SignalR reconnect, server restart, stale heartbeat, duplicate dispatch/ACK, running-session adoption, target disappearance and foreign claim.
- Timeout produces an explicit non-running state; it never silently assigns another simulator.
- Disconnect/authority loss stops or degrades execution according to existing safety policy and records audit evidence.

## Testing strategy

- Backend dispatch, authorization, tenant isolation, assignment conflict, timeout and duplicate-command tests.
- Simulator bridge targeting, automatic Start, adoption/reconnect and duplicate-event tests.
- Contract generation/check and SignalR group/scoping tests.
- End-to-end: HMI Start → server dispatch → real simulator bridge → Running, followed by HMI pause/resume/stop, with no simulator Start button.
- Run all applicable gates in `QUALITY_GATES.md`.

## Performance and security considerations

- Bound dispatch/ACK timeout and retained correlation state; do not create unbounded waiters.
- Authenticate simulator identity server-side, authorize operator intent, enforce organization scope and audit all ownership transitions.

## Documentation changes

- Update orchestration/session architecture, HMI operator workflow, offline-demo distinctions, troubleshooting and generated contract documentation.

## Acceptance criteria

1. An authorized operator prepares a valid Job and presses Start only in the HMI.
2. The server assigns one compatible target and the target simulator starts automatically.
3. Claim/ACK/running state is correlated, visible and idempotent.
4. Pause/resume/stop and reconnect/recovery remain coherent everywhere.
5. Foreign claims, duplicates, timeouts and cross-tenant access fail deterministically.
6. Applicable build, test, contract, E2E, security and documentation gates pass.

## Evidence expected for completion

Record focused backend/bridge/reconnect/RBAC results, generated-contract check, the no-local-Start E2E transcript, applicable global gates and any measured dispatch timings. Never fabricate connector or runtime evidence.

## Rollback and failure containment

Keep new dispatch fields and handlers additive. A failed dispatch must leave no falsely Running Job; disable the new path only behind an explicit compatibility switch while preserving stored records and audit history.

## Follow-up items

- Rich Job composition and authoritative completion are S52.
- Role-surface and Robot view work are S53.
