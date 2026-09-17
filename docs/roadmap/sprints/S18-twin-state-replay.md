# S18 - Digital twin state model and telemetry replay

## Outcome

Establish one normalized model that can represent simulated, replayed, or externally observed equipment state.

## Scope

- Define versioned equipment identity, availability, operating mode, execution state, measurements, alarms, quality, source, and timestamp.
- Distinguish commanded state, simulated state, and observed state.
- Add adapter boundaries so simulation and future connectors produce the same normalized telemetry.
- Persist selected telemetry/events with retention settings suitable for demonstrations.
- Add file-based telemetry import and timestamp-controlled replay.
- Show state source, freshness, and divergence in HMI and simulator diagnostics.

## Tests and gates

- Schema and mapping tests for every equipment category.
- Ordering, duplicate, stale-data, clock-skew, and source-priority tests.
- Deterministic replay tests at multiple speeds.
- Database retention/query integration tests.
- End-to-end switch between live simulation and recorded replay without changing HMI views.

## Acceptance criteria

- Consumers do not need separate UI models for simulated and connected data.
- Stale or conflicting observations are explicit.
- Replay cannot accidentally issue commands to a live connector.

## Non-goals

- No large-scale historian or predictive analytics platform.
