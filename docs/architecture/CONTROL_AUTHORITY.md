# Control authority and control arbitration (S36)

Status: **implemented** (S36). This is a training and virtual-commissioning mechanism, **not a
certified safety authority**. It is designed so that a connector can never silently fight the
simulation or another connector, and so that handover is explicit, precondition-checked, audited and
continuously visible.

## Modes

Exactly one authority owns one equipment/actuator **scope** (for example `cell-1`) at a time.

| Mode (wire) | Driving actuators | Description |
|---|---|---|
| `local-simulation` | yes | The simulator's own simulation drives the actuators. Connectors observe only. This is the implicit mode when no authority document exists. |
| `external-controller` | yes | An external controller (through a connector) drives the actuators. The simulator renders and observes only. |
| `observed-twin` | no | The twin renders externally observed values but nothing may command the actuators. |
| `replay` | no | Read-only playback. Replay can never acquire authority or emit a protocol write. |

Authority **state**: `available` (no owner), `held` (owner may command), `degraded` (owner lease
lost / owner unhealthy; commands fail closed).

## Rules

- The authority document id **is** the scope. Two concurrent acquisitions therefore cannot both
  insert the same id; the loser receives `409 authority_conflict` and the attempt is audited.
- Acquiring a scope that is already held by another owner/mode is rejected; use the explicit
  takeover endpoint instead.
- Re-acquiring with the same owner and mode is idempotent.
- `observed-twin` and `replay` can never acquire command authority. `replay` acquisition is rejected
  with `authority_replay_read_only`.
- Only the current owner may release or heartbeat an authority.
- An absent authority document is treated as **implicit local simulation** with a diagnostic, never
  as an error. This keeps the pre-S36 single-simulator claim flow working.

## Handover sequence

```text
operator / controller                 server (ControlAuthorityService)            owner
        |  POST /acquire (external)          |                                     |
        |------------------------------------>|                                     |
        |                                     | 1. validate mode/owner              |
        |                                     | 2. exclusivity check (fail closed)  |
        |                                     | 3. owner precondition probe          |
        |                                     |    (connector Connected + mapping)   |
        |                                     | 4. audit authority_quiesce          |
        |                                     |    (outputs de-energized)            |
        |                                     | 5. persist Held + lease              |
        |                                     | 6. audit authority_acquired          |
        |                                     | 7. broadcast ControlAuthorityChanged |
        |<------------------------------------|                                     |
        |  200 ControlAuthorityDto            |                                     |
```

Quiesce is recorded before the transfer: actuators hold their position with outputs de-energized
until the new owner issues its first command. The bounded handover time is dominated by the
precondition probe (a local connector-state check); the integration test records the measured value.

## Lease and degraded mode

- External authorities carry a lease (`Orchestration:AuthorityLeaseSeconds`, default 30 s, clamped to
  600 s). The owner refreshes it with `POST /control-authority/{scope}/heartbeat`.
- `HeartbeatMonitorService` — the single heartbeat scanner — also expires controller leases
  (`ControlAuthorityService.ExpireLeasesAsync`). An expired lease is set to `degraded`; the owner and
  mode are **retained**.
- Commands from anyone, including the previous owner, are denied with `authority_lost` while
  degraded. There is **no silent revert** to local simulation or to another connector.
- Recovery requires an explicit `heartbeat` with `"resume": true` from the owner, or an explicit
  release. A running cycle therefore never silently changes hands.
- The documented output state on loss is *hold-last-commanded with outputs de-energized*; the
  audit trail records `authority_degraded` with `controller-heartbeat-lost`.

## Connector integration

Connectors are authority-agnostic requesters: they never decide authority. Orchestration code that is
about to drive an actuator or emit a protocol write asks the `IControlAuthorityGate`
(`ControlAuthorityService.AuthorizeCommandAsync`). Connector health is a handover precondition via
`IControlAuthorityOwnerProbe`; a connector owner is ready only while the matching connector is
`Connected`, so disabled/degraded/errored connectors and unknown owners fail closed.
Authority never bypasses the connector write allow-list: writes remain disabled by default and
exact-match allow-listed.

## API

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/control-authority/{scope}` | Current authority (implicit local simulation when absent) |
| POST | `/api/control-authority/{scope}/acquire` | Acquire / idempotent re-acquire |
| POST | `/api/control-authority/{scope}/takeover` | Explicit takeover (confirmation required) |
| POST | `/api/control-authority/{scope}/release` | Release (owner only) |
| POST | `/api/control-authority/{scope}/heartbeat` | Refresh lease; optional `resume` |
| GET | `/api/control-authority/{scope}/audit?limit=50` | Immutable audit trail (newest first) |

SignalR broadcasts `ControlAuthorityChanged` with scope, mode, state, owner, previous
mode/owner, degraded reason and correlation id. The payload never contains secrets.

### Error codes

| Code | Meaning |
|---|---|
| `authority_conflict` | Another owner holds the scope |
| `authority_not_acquired` | The caller does not hold the authority it needs |
| `authority_handover_rejected` | A handover precondition failed (unhealthy owner, unconfirmed takeover, bad token) |
| `authority_lost` | The lease expired / owner is unhealthy; commands fail closed |
| `authority_replay_read_only` | Replay tried to acquire or command |
| `authority_invalid_mode` | Unknown mode |
| `authority_not_owner` | Caller is not the holder (release/heartbeat) |
| `authority_invalid_request` | Missing owner identity for a non-local mode |
| `concurrent_modification` | Optimistic-concurrency race; retry |

## Persistence, migration and indexes

- Collections: `controlAuthorities` (one document per scope, id = scope) and
  `controlAuthorityEvents` (append-only audit).
- Indexes created idempotently: `{ scope: 1, timestampUtc: -1 }` and `{ correlationId: 1 }` on the
  audit collection.
- Existing sessions/scopes without an authority document are read as implicit local simulation with
  the diagnostic `no-authority-document; treated as implicit local-simulation`.
- Server restart: authority documents are persisted as-is, but no external authority is auto-granted
  on start. A `Held` external authority whose lease elapsed is degraded by the first monitor scan.

## Simulator and HMI

- The simulator holds an `AuthorityStore` (`src/twin/authority.ts`) fed by
  `ControlAuthorityChanged`. `PalletMachiningWorkflow.update()` consults the authority gate and issues
  **no actuator command** when the simulator does not hold `local-simulation` authority; rendering and
  observation continue.
- The HMI shows a continuously visible authority indicator (not a tooltip) in the shell: mode, state,
  owner and target scope, with EN/FR/DE labels, semantic `role="status"`, pending/success/failure
  feedback and an explicit degraded notice.

## External-controller end-to-end evidence

`Fabrik3D.Server.Tests/ReferenceCellLoopE2ETests` runs a real in-process Modbus TCP fixture (the S35
deterministic fixture controller) and the real Modbus connector:

```text
fixture output (holding register 0) → connector → observed signal cell-1.actuator.command
→ authority-gated virtual actuator → virtual sensor cell-1.sensor.position
→ connector write back to fixture input (holding register 1) → fixture reads it
```

The same test proves exclusivity (local simulation is denied while the external controller holds the
scope and a denied request has no actuator effect), loss-of-controller degraded behaviour (no silent
takeover) and explicit release back to local simulation.

The S46 CODESYS / SoftPLC showcase reuses the same model at a documented scale: its automated
substitute fixture acquires external authority explicitly, drives the full permissives → start →
pallet → robot → CNC → completion → stop/fault → reset sequence, refuses local simulation during the
run, and demonstrates degraded mode on controller loss. See
[`../showcases/codesys-softplc/sequence.md`](../showcases/codesys-softplc/sequence.md).

## Limitations

- This is **not** a safety authority and carries no certification. It is a training/VC arbitration
  mechanism.
- Authentication is still an interim boundary until S42. A production deployment must configure
  `Orchestration:AuthorityConfirmationToken` and enforce identity; S36 never introduces an
  "any client can take over" default: takeover always requires explicit confirmation, and connector
  owners must be connected.
- Mapping studio UX is S37; S36 exposes the API and gate, not a mapping editor.
- The reference cell loop is a deterministic test/VC harness, not a productized machine model.
