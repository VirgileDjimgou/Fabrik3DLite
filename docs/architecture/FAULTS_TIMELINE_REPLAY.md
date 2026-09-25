# Simulated faults, timeline, and replay

This document describes two related but deliberately separate fault models:

- **Scenario-level instructional faults (S13)** — typed, latched faults that pause
  the workflow and require an acknowledge/reset/retry recovery journey.
- **Signal/equipment overlays (S38)** — explicit, inspectable, removable
  disturbances applied at the signal or equipment-observer layer, which
  propagate through the I/O chain so learners observe consequences.

Everything emitted by these features carries `simulated: true`. Fault injection
is explicitly simulated and never writes into live machinery.

## Scenario-level faults (S13)

`faults/catalog.ts` defines the seven S13 fault classes (`collision-risk`,
`unreachable-target`, `cnc-fault`, `conveyor-blockage`, `missing-pallet`,
`stale-heartbeat`, `communication-loss`). `FaultController` latches each fault;
a recovery must acknowledge first and, where the fault declares it, reset before
retry. Scenario files can declare `faultInjections`; `injectScenarioFaults`
injects them at scenario start, while the instructor panel can inject the same
typed definitions interactively.

These classes are unchanged by S38 and keep their timeline semantics
(`alarm` / `acknowledgement` / `fault-action`).

## Overlay fault classes (S38)

`faults/overlayCatalog.ts` documents every overlay class with EN/FR/DE title,
description and recovery instructions, the layer it applies to, and whether it
is stochastic (seeded) or numeric-only.

### Signal-level overlays

| Class | Effect | Notes |
|---|---|---|
| `forced-true` / `forced-false` | Hard boolean override. | Highest precedence value transform. |
| `frozen-value` | Latches the first observed value. | Latched per overlay; removing restores live values. |
| `disconnected` | Publishes the safe value with `bad` quality. | Treats the link as lost. |
| `degraded-quality` | Keeps the value, downgrades `good` quality to `uncertain`. | Quality-only; stacks on the winning transform. |
| `intermittent` | Seeded dropout to the safe value for part of each period. | Deterministic; `periodMs` configurable. |
| `delayed` | Published value lags the runtime by `delayMs`. | FIFO delay buffer; shifts downstream cycle timing. |
| `noisy-analog` | Seeded bounded additive noise. | Numeric signals only. |
| `drift` | Seeded monotonic offset growing per tick. | Numeric signals only. |
| `inverted` | Boolean polarity flip. | Non-booleans pass through unchanged. |

### Equipment/observer-level overlays

`actuator-jam`, `actuator-slow-response`, `motor-overload`, `vacuum-loss`,
`sensor-contamination`, `communications-loss`. These alter runtime behaviour
through the existing equipment interfaces rather than rewriting signal values.
`communications-loss` additionally behaves like `disconnected` when it targets a
signal.

## Overlay engine semantics

`faults/overlays.ts` is pure and deterministic:

- Overlays never mutate the stored canonical signal definition. The registry
  keeps the pristine sample; `ReferenceCellSignalBinding` applies the overlay
  chain to the value on its way out (`tick`) and refuses a command that targets
  an overlay-affected signal (`write`). Removing an overlay restores the exact
  pre-fault value and quality on the next publication.
- **Precedence (highest wins):** `disconnected` / `communications-loss` >
  `forced-true` > `forced-false` > `frozen-value` > `inverted` > `delayed` >
  `intermittent` > `noisy-analog` > `drift` > `degraded-quality`. Lower-precedence
  value transforms that would be undone are skipped and reported as a warning.
  Equipment/observer classes are listed last so the order stays total.
- **Conflict warning:** two overlays of the same class on one signal resolve to
  the most recently activated one and surface an `overlay-conflict` diagnostic.

### Determinism and seeding

Every stochastic class derives its pattern from `createSeededRandom` (mulberry32)
keyed by `hash(overlayId:signalId) ^ seed` and the tick index. There is no
`Math.random` and no wall-clock dependency inside the transforms, so identical
seed + inputs reproduce the exact sequence across reloads, and different seeds
produce different sequences.

### Performance

`faults/overlays.performance.test.ts` activates the full 16-class catalog on one
signal for 10 000 ticks and records the per-signal per-tick overhead. The
regression bound is 50 µs/signal/tick; the measured value is printed by the test
for evidence.

## Timeline and replay

`timeline/` provides ordered records for commands, state transitions, alarms,
acknowledgements, recovery actions, and telemetry. Each record includes source,
severity, session, equipment, timestamp, correlation ID, and the simulation
marker. Instructor overlay activations are recorded as `alarm` entries carrying
the `layer`, `type`, `seed` and correlation id; clears are recorded as
`fault-action` with `action: 'clear'`.

`replayTimeline` is a pure reducer: an ordered fixture reconstructs the same
state regardless of input ordering, including `activeOverlayIds` /
`activeOverlayTypes`. Replay is **read-only**: it reconstructs fault state from
the timeline and never re-applies an overlay to live equipment or emits a command.

The timeline is intentionally in-memory in this sprint; high-frequency
persistence arrives with the server historian (S40/S41).

## Time travel and mode semantics (S41)

S41 adds `src/timeTravel/` on top of `replayTimeline`. `replayTimeline` remains the pure fault/overlay
reducer; time travel adds a complete read-only cell snapshot, a deterministic controller and a hard
isolation gate. See [`TIME_TRAVEL.md`](./TIME_TRAVEL.md) for the full model.

- **Modes.** `live`, `simulation` and `replay` are explicit, text-and-color states. The operator HMI
  stays unchanged; the engineering/instructor surface (`?view=time-travel`) shows the current mode
  continuously, and replay additionally states the read-only guarantee.
- **Exactness and limits.** Robot joints/pose are `exact` on a recorded sample, `interpolated`
  between two samples, `held` after the last sample and a `gap` before the first sample. Interpolation
  is linear and documented; nothing is fabricated. All other fields are reconstructed from recorded
  records only, and missing evidence is reported as an explicit gap.
- **Read-only enforcement.** Entering replay activates `ReplayIsolationGate`; while it is active every
  OPC UA/MQTT/Modbus write and every authority acquisition is refused *before* the underlying function
  runs, and the attempt is recorded. Exiting replay releases the gate and restores the previous mode.
- **Faults and overlays.** Time travel reconstructs active fault overlays from the timeline read-only;
  it never re-applies an overlay to live equipment, exactly as `replayTimeline` never did.

## Authority safety

Injection is disabled when the affected equipment is under external authority.
`FaultLabController` accepts a `FaultLabAuthority`; when `canInject` returns
false the activation is refused, a `injection-blocked-by-authority` diagnostic is
returned, and an `inject-blocked` timeline entry is recorded — the UI reports the
blocker explicitly.

By construction the fault surface exposes only activation, deactivation and
overlay application. There is no method that accepts a protocol target or emits a
network write, so a fault can never reach a connector. The
`FaultLabController.test.ts` authority-safety tests assert both the refusal and
that no connector write path exists.
