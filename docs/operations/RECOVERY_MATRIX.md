# Failure and recovery matrix

Status: **implemented (S56)**. This document is the explicit contract for how the platform behaves
when a dependency fails and how it recovers. It is derived from the actual reconnect/retry policies in
code and from the automated tests that exercise them. Where a genuine external dependency cannot be
automated, the case is marked **manual** and is not presented as a passing automated gate.

Guiding rules (S56 architecture boundaries):

- Recovery never fabricates telemetry, never silently takes control authority and never writes from a
  replay.
- A degraded component reports its degraded state; it does not present stale or missing data as fresh.
- Losing a dependency must fail closed, not fail open: connectors stay disconnected until an allowed
  reconnect succeeds, and writes remain disabled unless explicitly allow-listed.

## Legend

| Column | Meaning |
| --- | --- |
| Detected signal | What makes the failure observable (metric, log, health flag, UI state, exception) |
| User-visible state | What the operator/HMI shows while degraded |
| Data-loss semantics | What is dropped or delayed, and whether it is reconstructable |
| Retry / backoff | Concrete policy applied before recovery |
| Authority / safety | What happens to control authority and actuator safety |
| Recovery proof | Automated test or explicit manual procedure that demonstrates recovery |

## Automated cases

### 1. MongoDB unavailable or restarted (persistence)

| Aspect | Behavior |
| --- | --- |
| Detected signal | Repository commands throw; `IMongoHealthProbe` / diagnostics health reports the database as unhealthy. `GET /api/health` reports the degraded database. |
| User-visible state | Affected REST calls return a server error (no partial success); the HMI surfaces the failed action rather than a false success. |
| Data-loss semantics | No acknowledged write is lost; a write that failed before acknowledgement is reported as failed to the caller. There is no local write buffer and no replay write. |
| Retry / backoff | MongoDB driver defaults (retryable reads/writes and server selection) apply to transient conditions; the application does not add an unbounded retry loop around persistence. |
| Authority / safety | Persistence failure never grants authority and never drives an actuator. In-memory runtime state is not silently promoted to authoritative. |
| Recovery proof | Automated: `JobRepositoryTests`, `TenantIsolationTests`, `SchemaMigrationRunnerTests` (Testcontainers MongoDB fixture). Manual: stop/start the `mongo` container in `compose.production.yaml` and confirm health flips unhealthy → healthy and a queued HMI action succeeds. |

### 2. Orchestrator restart

| Aspect | Behavior |
| --- | --- |
| Detected signal | SignalR connections close (`onreconnecting` → `onreconnected`/`onclose`); heartbeat monitor restarts its sweep. |
| User-visible state | HMI connection state shows `reconnecting`, then `connected`; a closed hub with an expired/missing token raises an explicit unauthorized signal instead of silent anonymity. |
| Data-loss semantics | Durable job/session/history state is in MongoDB and survives the restart. In-flight SignalR broadcasts are not replayed; subscribers reload current state. |
| Retry / backoff | Client SignalR `withAutomaticReconnect()` default schedule; after reconnect the simulator re-registers its group so targeted dispatch still arrives. |
| Authority / safety | Stale simulation sessions are swept to `Faulted` after the heartbeat timeout; external leases expire and never silently revert to another authority. |
| Recovery proof | Automated: `HeartbeatExpiryPolicyTests`, `SessionOwnershipAndHeartbeatIntegrationTests`, `ControlAuthorityIntegrationTests`, client `simulatorOrchestrationBridge.test.ts` (disconnect → local demo, no server writes). Manual: restart the server container and confirm all clients reconnect and targeted dispatch resumes. |

### 3. Simulator or HMI reload (browser refresh)

| Aspect | Behavior |
| --- | --- |
| Detected signal | SignalR `onclose`; asset runtime `disposeAll()` on unmount; diagnostics surface removed. |
| User-visible state | Client boots into a loading state, then reconnects and reloads the current scene/job state. |
| Data-loss semantics | Nothing authoritative lives in the browser; a reload discards only local view state and re-fetches from the server. |
| Retry / backoff | Standard reconnect on the new page load. |
| Authority / safety | A reload never claims control authority implicitly; operator actions that require authority are rejected until authority is re-established. |
| Recovery proof | Automated: `simulatorOrchestrationBridge.test.ts`, `useRobotPositions.test.ts`, `ResourceLeakDetector`-based `e2e/soak.spec.ts` (repeated scene loads/disposal leave resource counts flat). |

### 4. SignalR interruption / reconnect storm

| Aspect | Behavior |
| --- | --- |
| Detected signal | `fabrik3d.signalr.connections.active` dips; reconnect counters and client connection-state callbacks fire. |
| User-visible state | `reconnecting` state; commands issued while disconnected are reported as failed, not queued silently. |
| Data-loss semantics | Broadcast events during the outage are not replayed; clients converge on the authoritative state after reconnect. |
| Retry / backoff | Client automatic reconnect; the load harness records a bounded reconnect storm and its latency/failure count. |
| Authority / safety | Reconnect does not restore authority that was not held; lease expiry applies independently. |
| Recovery proof | Automated: `npm --prefix Fabrik3D/fabrik3d.client run load:signalr` with `LOAD_RECONNECT=true` records `reconnect.attempted`, `failures` and latency percentiles. The [`signalr-load.mjs`](../../Fabrik3D/fabrik3d.client/scripts/signalr-load.mjs) harness fails the command on a connection error. |

### 5. MQTT broker disconnect / restart

| Aspect | Behavior |
| --- | --- |
| Detected signal | `fabrik3d.connector.reconnects` (by protocol) increments; connector health state leaves `Connected`; last-will becomes visible on abnormal disconnect. |
| User-visible state | Connector health shows disconnected/degraded; retained telemetry is surfaced only as historical **stale** state, never as fresh. |
| Data-loss semantics | Messages published while disconnected are lost unless the broker retains them; retained messages require a valid fresh timestamp to become trusted state. Duplicate deliveries are ignored by correlation id. |
| Retry / backoff | Shared `ConnectorBackoff.Compute` — `min(max, base·2^(attempt−1))`, exponent capped at 10 (`Fabrik3D.Infrastructure/Connectors/ConnectorBackoff.cs`). |
| Authority / safety | Writes stay disabled by default; non-allow-listed commands are rejected. |
| Recovery proof | Automated (real broker fixture): `MqttConnectorIntegrationTests` — `Reconnects_after_a_broker_restart_and_resumes_delivery`, `Last_will_is_armed_and_becomes_visible_on_an_abnormal_disconnect`, `Retained_telemetry_surfaces_only_as_historical_stale_state`, `Duplicate_deliveries_are_ignored_by_correlation_id`, `Graceful_shutdown_disconnects_cleanly_and_leaves_the_broker_alive`. Backoff arithmetic: `ConnectorBackoffTests`. |

### 6. OPC UA server disconnect / restart

| Aspect | Behavior |
| --- | --- |
| Detected signal | `fabrik3d.connector.reconnects`; subscription samples become stale by read time without mutating stored values; invalid node ids produce diagnostics instead of crashes. |
| User-visible state | Connector health shows disconnected/degraded; values keep their last quality/timestamp and age into stale rather than silently refreshing. |
| Data-loss semantics | Samples during the outage are not reconstructed; missed history is reported as a gap. |
| Retry / backoff | Shared `ConnectorBackoff.Compute` (same contract as MQTT/Modbus). |
| Authority / safety | Secure endpoints refuse untrusted server certificates; development trust is explicit opt-in and never a silent accept. Writes are allow-listed and fail closed. |
| Recovery proof | Automated (real server fixture): `OpcUaConnectorIntegrationTests` — connect/subscribe/map, staleness without mutation, invalid node ids, write policy, untrusted certificate refusal and explicit development trust. Backoff arithmetic: `ConnectorBackoffTests`. |

### 7. Modbus TCP / PLC disconnect / restart

| Aspect | Behavior |
| --- | --- |
| Detected signal | Connector state leaves `Connected`; timeouts are recorded; illegal addresses are reported per point without stopping the connector. |
| User-visible state | Connector health shows disconnected/degraded; writes fail visibly when no longer connected. |
| Data-loss semantics | Read values during the outage are missed; a write issued while disconnected fails and is not retried as a write. |
| Retry / backoff | Shared `ConnectorBackoff.Compute`; the connector keeps retrying after a timeout. |
| Authority / safety | Writes accept only writable allow-listed points; disconnected writes fail closed. |
| Recovery proof | Automated (real PLC fixture): `ModbusConnectorIntegrationTests` — `Reconnects_after_the_plc_goes_away_and_returns`, `Timeout_is_recorded_and_the_connector_keeps_retrying`, `Writes_fail_visibly_when_the_connector_is_no_longer_connected`. Backoff arithmetic: `ConnectorBackoffTests`. |

### 8. External controller disappearance / authority loss

| Aspect | Behavior |
| --- | --- |
| Detected signal | Heartbeat/lease expiry; `fabrik3d.authority.transitions`; dispatch expiry. |
| User-visible state | Control-authority UI shows the lost owner removed; operator jog is stopped on disconnect/authority loss. |
| Data-loss semantics | No authority is fabricated; pending dispatches expire and are reported. |
| Retry / backoff | Lease expiry is time-based; pending dispatches expire rather than being re-sent to an unknown owner. |
| Authority / safety | Exactly one authority owns an actuator at a time; loss of an external controller never silently reverts to another authority mid-cycle — the documented degraded mode applies. Replay is read-only and can never acquire authority or emit a write. |
| Recovery proof | Automated: `ControlAuthorityRulesTests`, `ControlAuthorityIntegrationTests`, `RobotJogAuthorityIntegrationTests`, client `simulatorOrchestrationBridge.test.ts` (`onJogStop('authority-loss')` / `onJogStop('disconnect')`). |

### 9. Historian write failure / retained / backpressure

| Aspect | Behavior |
| --- | --- |
| Detected signal | `fabrik3d.historian.writes` and write duration; ingest result reports `degraded`; a prune failure is logged with "policy bounds were not exceeded". |
| User-visible state | Time-travel/queries can report a gap or degraded status; live orchestration is unaffected. |
| Data-loss semantics | Historian failure never breaks live orchestration. A bounded insert is retried once, then dropped and counted — dropped samples become an explicit gap, never a fabricated value. Storage stays bounded by the sampling/retention policy. |
| Retry / backoff | One retry per batch, then drop. Pruning failure is contained. |
| Authority / safety | The historian is an observer: it cannot take authority or write to machinery. |
| Recovery proof | Automated: `HistorianIntegrationTests`, `HistorianQueryAndRateLimitTests`, `HistorianSamplingTests`, `HistorianDocumentMapperTests` (Testcontainers MongoDB). |

## Manual / reference-only cases

These require a real external dependency and are **not** automated gates in ordinary CI. They must
remain visibly unresolved until performed.

| Case | Why manual | Procedure | Acceptance threshold |
| --- | --- | --- | --- |
| Long soak (4–8 h) with real GPU | Needs a hardware-accelerated browser and a multi-hour window | See [PERFORMANCE.md](./PERFORMANCE.md) "Manual reference soak" | Heap/texture/draw-call series flat within the recorded budgets; no leak verdict for texture bytes or draw calls |
| Real protocol round-trip against vendor hardware (Siemens/Codesys/PLCSIM) | Needs licensed/OEM software and a device | [showcases/siemens-plcsim](../showcases/siemens-plcsim/README.md), [showcases/codesys-softplc](../showcases/codesys-softplc/README.md) | Connect, subscribe, reconnect and write-policy checks observed against the real device |
| Production orchestrator restart with live clients | Destructive to a running deployment | Rolling restart during a maintenance window, watch reconnection | All clients reconnect; no authority is silently transferred |

## Related documents

- [PERFORMANCE.md](./PERFORMANCE.md) — measurement commands, budgets and the soak procedure.
- [OBSERVABILITY.md](./OBSERVABILITY.md) — metrics and traces that make the signals above observable.
- [LIMITATIONS.md](./LIMITATIONS.md) — explicit non-claims.
