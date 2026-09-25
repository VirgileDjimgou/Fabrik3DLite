# Digital twin telemetry

S18 defines `NormalizedEquipmentState` schema 1.0 for robot, CNC, conveyor, sensor, and tool state. Every record carries identity, availability, operating/execution state, measurements, alarms, quality, source, and timestamp.

The state store accepts commanded, simulated, observed, and replay sources with explicit source priority and timestamp ordering. It rejects stale records and marks stale or conflicting values so consumers can render a single model without assuming simulated data is observed equipment data.

Telemetry replay imports a JSON array and only emits normalized records. It has no command method, so recorded playback cannot issue commands to a live connector.

S40 adds durable server-side history for *selected* signals and events: bounded, versioned
`telemetrySamples` and `historizedEvents` documents, per-signal sampling (on-change/periodic/deadband),
rate-limited batch ingestion, read-only filtered queries, intentional indexes, retention/pruning and a
storage-growth policy. The historian is additive and disabled by default, carries source, quality,
timestamp and correlation id on every record, and can never issue a command. See
[`TELEMETRY_HISTORIAN.md`](./TELEMETRY_HISTORIAN.md). External connector persistence still flows
through the same historian path rather than connector-specific storage.

S41 adds deterministic time travel: `reconstructCell` folds the local timeline or an S40 historian
window into a versioned read-only snapshot (robot, CNC, equipment, material, signals, alarms, faults,
job/session, authority), and `reconstructTwinStates` expresses that snapshot through the same
`NormalizedEquipmentState` model with `source: "replay"`. Pose exactness maps to quality (`exact` →
`good`, `interpolated`/`held` → `stale`, `gap` → `invalid`), so an approximation is never presented as
a recorded sample. The replay controller has no command interface, and while replay is active the
isolation gate refuses every OPC UA/MQTT/Modbus write and authority acquisition before it can run. See
[`TIME_TRAVEL.md`](./TIME_TRAVEL.md).
