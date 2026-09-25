# ADR 0001 — Control authority and source arbitration

- Status: accepted (S36)
- Context sprint: S36 — External controller mode and control arbitration

## Context

S33–S35 added OPC UA, MQTT and Modbus connectors. Without an explicit authority model, a connector
could silently fight the simulator or another connector. The existing twin signal store already ranks
value sources (`commanded: 0`, `replay: 1`, `simulated: 2`, `observed: 3`) when timestamps tie, but
source ranking alone cannot express *who is allowed to drive an actuator*. Virtual commissioning
requires safe, explicit handover and a continuously visible authority.

## Decision

1. **Authority is a server-domain concept.** A single `ControlAuthority` document per equipment/
   actuator **scope** (id = scope) records mode, state, owner identity/kind, acquisition time, lease/
   heartbeat and version. The server is the source of truth; the simulator and HMI mirror it through
   contracts and SignalR.
2. **Exactly one authority per scope.** Exclusivity is enforced by the document id (a unique `_id`),
   plus optimistic concurrency (`Version`) for transitions. Concurrent acquisition fails closed with
   `authority_conflict` and is audited.
3. **Modes are explicit and fail closed.** `local-simulation` and `external-controller` may drive;
   `observed-twin` and `replay` never command. Replay can never acquire authority.
4. **Handover is explicit and precondition-checked.** Connector owners must be `Connected` and the
   mapping validated; quiesce (outputs de-energized) is recorded before the transfer; takeover requires
   explicit confirmation (and a token when configured).
5. **Leases and degraded mode.** External authorities carry a lease refreshed by heartbeat. The single
   existing `HeartbeatMonitorService` also expires leases and degrades them. A degraded authority
   retains its owner/mode and denies all commands; it never silently reverts to another authority.
6. **Source arbitration vs authority.** Authority decides *who may drive*; the signal-source ranking
   continues to decide *which value wins* for a signal. Samples carry an optional authority scope/mode
   context so traces can be correlated. These are complementary, not replacements.

## Consequences

- Existing single-simulator flows keep working: an absent document is implicit local simulation.
- Connectors stay authority-agnostic requesters; orchestration asks an `IControlAuthorityGate` before
  driving an actuator or writing through a connector. Authority never bypasses the write allow-list.
- All transitions are audited append-only with correlation ids.
- Authentication remains an interim boundary until S42; production must configure a confirmation token
  and real identity. Takeover always requires confirmation, so the default is not "any client can take
  over".

## Alternatives considered

- **Source ranking alone**: rejected; it cannot prevent two writers from both being "the newest" and
  cannot express handover preconditions or degraded mode.
- **Client-owned authority**: rejected; the server must be the orchestration source of truth, and
  connector transports must not decide authority.
- **Auto-revert to local simulation on controller loss**: rejected; it would let a machine cycle change
  hands silently.
