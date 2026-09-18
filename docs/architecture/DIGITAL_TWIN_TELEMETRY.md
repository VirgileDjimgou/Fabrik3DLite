# Digital twin telemetry

S18 defines `NormalizedEquipmentState` schema 1.0 for robot, CNC, conveyor, sensor, and tool state. Every record carries identity, availability, operating/execution state, measurements, alarms, quality, source, and timestamp.

The state store accepts commanded, simulated, observed, and replay sources with explicit source priority and timestamp ordering. It rejects stale records and marks stale or conflicting values so consumers can render a single model without assuming simulated data is observed equipment data.

Telemetry replay imports a JSON array and only emits normalized records. It has no command method, so recorded playback cannot issue commands to a live connector. Long-term historian retention and external connector persistence remain follow-up work.
