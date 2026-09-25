# S36 - External controller mode and control arbitration

## Outcome

Fabrik3D gains an explicit machine-control authority model with the modes `LocalSimulation`, `ExternalController`, `ObservedTwin`, and `Replay`. Two authorities can never concurrently control the same actuator. Mode changes are explicit and fail closed, control authority is continuously visible in the UI, and a virtual machine can be driven by an external controller through an industrial adapter with end-to-end evidence.

## Motivation

S33-S35 delivered connectors. Without an authority model, a connector could silently fight the simulation or another connector, which is both technically unsound and educationally misleading. Virtual commissioning requires safe, explicit handover.

## Current-state assumptions to verify

- S33-S35 merged: OPC UA, MQTT, Modbus connectors exist with health and write policies, all disabled by default.
- The simulator workflow (`PalletMachiningWorkflow`, `RobotController`, `LargeCNCMachine`) currently executes autonomously; the server owns jobs/sessions but not actuator authority.
- `SimulatorOrchestrationBridge` is the only backend boundary and reports session/machine state.
- `src/twin` defines commanded/simulated/observed/replay sources with priority `{ commanded: 0, replay: 1, simulated: 2, observed: 3 }`.
- No mode/authority concept exists server-side.

## Scope

- Define a server-side `ControlAuthority` model: authority id (`local-simulation`, `external-controller`, `observed-twin`, `replay`), owner identity (simulator id or connector id), equipment/actuator scope, acquisition timestamp, lease/heartbeat, and state.
- Enforce exclusivity: acquiring authority requires the current authority to be free or explicitly released; concurrent acquisition returns a structured conflict. Takeover requires an explicit request and, where configured, a confirmation token/operator action.
- Implement safe handover:
  - preconditions (connector connected/healthy, mapping validated, no running cycle unless explicitly stopped);
  - quiesce outputs on handover (documented output state per equipment);
  - only then transfer authority;
  - audit events for acquire/release/takeover/failure.
- Implement external-controller heartbeats and degraded mode:
  - loss of heartbeat or connector health beyond a timeout degrades authority to a documented safe state; it must never silently revert to another authority while a machine cycle is running;
  - deterministic fallback policy (for example hold-last-commanded with outputs de-energized and alarms raised, or pause cycle and require explicit operator resume), documented per mode.
- Wire the simulator to observe authority: it may only drive actuators when holding `LocalSimulation` (or `Replay` in read-only visualization); it visually and semantically indicates the current authority at all times.
- Wire connectors to route external commands/values into the signal mirror with source `observed`/`commanded` depending on direction, gated by authority.
- Add a server API and SignalR event for authority state; regenerate TypeScript contracts.
- UI: a continuously visible authority/connection indicator with pending/success/failure feedback on handover actions; critical action identifies the target cell/equipment.
- Add E2E evidence where a virtual machine is controlled by an external test controller through a real adapter:
  - use the deterministic fixture controller from S33-S35 (not a proprietary PLC) to drive the reference cell: fixture output → Fabrik3D actuator → virtual sensor → fixture input, closed loop;
  - prove exclusivity and handover: local simulation and external control cannot run actuators simultaneously; loss of the fixture produces the documented degraded behavior, not implicit takeover.

## Non-goals

- No proprietary PLC emulation or OEM controller claim.
- No mapping studio UI (S37).
- No production safety claim; the model is a training/VC mechanism, not a certified safety authority.
- Do not allow remote takeover without authentication forever; S42 strengthens identity, but S36 must not introduce insecure "any client can take over" behavior in production defaults.

## Architecture boundaries

- Authority is a server-domain concept; activation happens at the server and is mirrored to simulator/HMI through contracts.
- Connectors never decide authority themselves; they request/observe it.
- Actuator ownership remains with the simulator runtime; authority only grants or denies the right to drive it.
- Replay is strictly read-only and can never acquire command authority.

## Domain and data model changes

- New `ControlAuthority`/`ControlAuthorityEvent` domain entities with optimistic concurrency, scope, owner, state, heartbeat, and audit trail.
- Persistence versioned and indexed; compatibility readers for existing documents.
- Signal samples carry both `source` and authority context where relevant.

## Backend changes

- `ControlAuthorityService` with rules, persistence, hub events, REST endpoints, and audit.
- Heartbeat monitor extension for controller leases (reuse the existing heartbeat pattern; do not duplicate monitors).
- Endpoint error codes: `authority_conflict`, `authority_not_acquired`, `authority_handover_rejected`, `authority_lost`.
- Contracts + generated TS.

## Simulator changes

- Gate actuator-driving code paths by authority; when not holding authority, the simulator continues rendering and observing but cannot command.
- Visualize current authority in existing status surfaces and expose it to the UI.
- Handle loss-of-authority deterministically and report it to the server.

## HMI and UX changes

- Authority and connector health are first-class, continuously visible status (not a tooltip).
- Handover actions are explicit, confirm the target, and show pending/success/failure.
- EN/FR/DE labels; accessible semantics; no color-only communication.

## 3D and visual requirements

- Actuator motion reflects authority: no actuator may visibly respond to a denied command.
- Mode/authority is also indicated in the 3D scene context (for example a non-decorative authority banner), without confusing it with safety state.

## Protocol and security requirements

- Connectors must present an identity (client id/simulator id) that the server validates for authority requests.
- Writes remain disabled by default; authority does not bypass the write allow-list.
- All authority transitions are audited with correlation ids.
- Fail-closed on ambiguous or concurrent acquisition.

## Backward compatibility

- Existing single-simulator job claim flow keeps working; local simulation implicitly holds authority when no external authority exists.
- Existing endpoints and contracts remain backward compatible; additions are additive.
- HMI and simulator continue to function with connectors disabled.

## Migration requirements

- Existing sessions without authority documents are treated as `local-simulation` with a diagnostic, not an error.
- Documented migration for authority collections and indexes.

## Failure and degraded-mode behavior

- Connector loss mid-cycle: documented degraded state; no silent authority switch; alarm/audit event raised.
- Server restart: authority state persisted and restored conservatively (never auto-grant external authority); document exact behavior.
- Duplicate/conflicting acquisition: rejected with structured conflict.
- Replay never issues commands even if the same UI is used.

## Testing strategy

- Domain unit tests for exclusivity, handover preconditions, lease expiry, and rules.
- Integration tests with MongoDB for persistence/concurrency and audit.
- Connector E2E test: fixture-based closed-loop external control of the reference cell, proving actuator response and sensor feedback.
- Negative tests: concurrent acquisition, takeover without release, loss of controller heartbeat, attempted command without authority, replay command rejection.
- Contract tests for new DTOs/events.
- Simulator UI tests for authority visibility and failed handover feedback.

## Performance requirements

- Authority heartbeat and checks must not add measurable latency to API or SignalR under the documented load (record measurements).
- Handover completes within a documented bounded time after preconditions are met.

## Security considerations

- Production defaults must not allow anonymous authority takeover; until S42 lands, require a configured identity/token and document the interim boundary.
- Audit events are immutable.
- No secret in authority payloads.

## Documentation changes

- New `docs/architecture/CONTROL_AUTHORITY.md` (modes, rules, handover sequence diagram, degraded behavior, audit, limitations).
- ADR for authority semantics and source arbitration.
- Update `README.md`, `docs/architecture/ORCHESTRATION.md`, and connector docs.

## Acceptance criteria

1. Two authorities cannot concurrently drive the same actuator; concurrent acquisition is rejected and audited.
2. Handover is explicit, precondition-checked, quiesces outputs, and records an audit trail.
3. Loss of the external controller produces the documented degraded state; a running cycle never silently reverts to another authority.
4. E2E fixture test demonstrates a closed loop: external controller → Fabrik3D actuator → virtual sensor → external controller input.
5. Simulator cannot command actuators without authority; replay commands are rejected.
6. Authority state is continuously visible in the UI with EN/FR/DE labels.
7. All builds, tests, contracts, E2E, and visual gates pass.

## Evidence expected for completion

```text
dotnet build/test (N passed, authority + connector integration tests)
E2E closed-loop evidence (test name, fixture, observed signal sequence)
simulator/HMI type-check/test/build (pass)
npm run contracts:check (pass)
authority handover timing measurement
audit event excerpt proving exclusivity and loss-of-controller behavior
```

## Rollback and failure containment

The authority service is additive; disabling external connectors leaves implicit local-simulation behavior. If a handover path is unsafe, fail the sprint rather than shipping ambiguous takeover. Rollback removes authority wiring and restores the S35 state.

## Follow-up items that must not leak into this sprint

- Mapping studio (S37).
- Real authentication/RBAC (S42) and tenant boundaries (S43).
- Historian/time travel (S40/S41).
