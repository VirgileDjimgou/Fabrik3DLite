# S38 - Advanced physical and signal fault injection

## Outcome

The fault engine evolves from scenario-level faults to signal/equipment-level abnormalities represented as explicit overlays or disturbances: forced true/false, frozen, disconnected, degraded quality, intermittent, delayed, noisy, drifting, inverted, actuator jam, slow response, motor overload, vacuum loss, sensor contamination, and communications loss. Faults propagate naturally through the signal/controller/actuator chain, are deterministic and seeded when random, integrate with the timeline, replay, and the instructor flow, and never corrupt canonical definitions.

## Motivation

S13 introduced typed faults that pause workflows and ask for acknowledgement. Industrial training and diagnosis require realistic signal degradation that propagates through the I/O chain so learners observe consequences, not just a message. Fault injection is also how virtual commissioning is stress-tested.

## Current-state assumptions to verify

- `src/faults/` has `FaultDefinition`, `ActiveFault`, `FaultController`, `FAULT_CATALOG` (7 scenario-level types), `scenarioInjection`, and a `TimelineRecorder` integration.
- S32 signals exist and actually drive the reference cell; S37 mapping/connectors exist but are disabled by default.
- `src/timeline` records entries with `simulated: true` and a pure replay reducer.
- `src/learning` and `ScenarioRunner` consume recovery actions; `scenario.faultInjections` is the existing injection point.
- Fault injection is explicitly simulated and never writes into live machinery.

## Scope

- Extend the fault model with:
  - signal-level faults: `forced-true`, `forced-false`, `frozen-value`, `disconnected`, `degraded-quality`, `intermittent`, `delayed`, `noisy-analog`, `drift`, `inverted`;
  - equipment-level faults: `actuator-jam`, `actuator-slow-response`, `motor-overload`, `vacuum-loss`, `sensor-contamination`, `communications-loss`.
- Define each fault as an explicit overlay applied at the signal layer (or observer layer for physical faults) with: activation/deactivation, persistence, severity, source (scenario/instructor), affected equipment, affected signals, start/end, deterministic seed for stochastic patterns, and a documentation entry.
- Implement the overlay engine so faults compose deterministically (documented precedence when multiple faults affect one signal) and never mutate stored canonical signal definitions.
- Propagate faults through the real signal/actuator chain so downstream behavior changes naturally (for example a frozen photoeye causes the conveyor logic to misbehave; an inverted signal changes downstream state; a delayed signal shifts cycle timing).
- Maintain deterministic seeded patterns for noise/intermittent/drift so replay reproduces them exactly.
- Integrate with the timeline (raise/clear entries), replay (read-only reconstruction of fault state), learning assessment (fault observed/recovered), and scenario recovery.
- Add an instructor fault-lab surface (engineering) to activate/deactivate faults on live reference-cell equipment and signals with target confirmation and pending/success/failure feedback.
- Update `FAULT_CATALOG` to keep the existing scenario-level faults and add the new classes with EN/FR/DE text.
- Guarantee live-connector safety: injectors only act on simulated signals; when an external authority is active, injection is disabled or explicitly confined to the simulated boundary and documented.

## Non-goals

- No physical rigid-body damage simulation.
- No injection into live connectors/real machinery.
- No new scenes; deepen the reference cell.
- No instructor dashboard (S45) or server-side training sessions (S44).
- Do not remove existing fault behaviors or their timeline semantics.

## Architecture boundaries

- Overlays live in the simulator signal/fault layer; failure physics stays simulated.
- Canonical definitions are immutable; overlays are separate, inspectable, and removable.
- The server is not required for local fault injection; instructor/server coordination arrives with S44.
- Replay reads fault overlays; it never re-applies them to live equipment.

## Domain and data model changes

- New fault type union, overlay contracts, seed, activation window, and diagnostics.
- Additive changes to scenario injection format (versioned) and to timeline payloads; compatibility readers for existing scenario files.

## Backend changes

- No protocol work required. Optionally persist instructor-injected fault events for audit later (S40/S44); if used, version and index the schema.

## Simulator changes

- `src/faults/overlays.ts` with deterministic transforms and composition rules.
- Binding layer from S32 applies overlays when publishing signals and when dispatching commands.
- Actuator/equipment fault adapters (jam/slow/overload/vacuum/contamination) that alter runtime behavior through existing interfaces.
- `FaultLabPanel.vue` (engineering) plus `?view=fault-lab` harness.
- Workflow behavior preserved in nominal operation.

## HMI and UX changes

- Fault lab is an engineering/instructor surface; operator HMI gains only the existing alarm/event visibility.
- Active faults show severity, target equipment/signal, start time, and source; clearing is target-confirmed.
- EN/FR/DE; accessible controls; no decorative red/green.

## 3D and visual requirements

- Fault effects that are physically visible must derive from runtime state (for example a jammed actuator stops moving; a slow actuator visibly lags) rather than playing a canned animation unrelated to the simulation.
- No visual regression change in nominal state.

## Protocol and security requirements

- Injection is disabled when the affected equipment is under external authority, or strictly confined to a documented simulated boundary.
- No injection path can write to a connector by design; add a test proving that.
- Instructor actions are audited in the timeline with correlation ids.

## Backward compatibility

- Existing scenario-level faults and recovery flows continue to work unchanged.
- Scenario files remain readable; new fields are optional with defaults.
- Replay of older timelines stays valid.

## Migration requirements

- Scenario injection schema versioning with deterministic migration; existing scenarios validated in tests.
- Timeline entries stay backward compatible (new kinds optional).

## Failure and degraded-mode behavior

- Deactivating an unknown/completed fault is a no-op with a diagnostic, not an exception.
- Overlay conflicts resolve by documented precedence and surface a warning.
- If injection is blocked by authority, the UI reports the blocker explicitly.
- Determinism: identical seed + inputs produce identical sequences across reloads.

## Testing strategy

- Deterministic unit tests per fault class (forced/frozen/inverted/delayed/noisy/drift/intermittent/disconnected/degraded) including boundary values and quality/timestamp effects.
- Composition/precedence tests for multiple overlapping overlays.
- Propagation tests: signal fault → workflow consequence → recovery, evaluated on the reference cell.
- Seeded determinism tests: same seed reproduces the exact sequence; different seeds differ.
- Replay tests: fault state reconstructs from the timeline; replay issues no commands.
- Authority-safety test: injection cannot reach a connector or live write.
- Component tests for the fault-lab panel and EN/FR/DE completeness.

## Performance requirements

- Overlay evaluation adds under a documented bound per signal per tick on the full catalog (measure and record).
- No per-frame unbounded allocations; stochastic generators are seeded and reused.

## Security considerations

- Instructor-only fault activation must be permission-gated; until S42, use the documented boundary and do not expose publicly by default.
- Fault files/scenarios are data, never code.
- No arbitrary write path into connectors.

## Documentation changes

- Rewrite/extend `docs/architecture/FAULTS_TIMELINE_REPLAY.md` with the fault-class catalog, overlay semantics, precedence, seeds, authority safety, and recovery model.
- Add `docs/architecture/FAULT_LAB.md` for instructor usage and limitations.
- Update `README.md` and learning/scenario docs.

## Acceptance criteria

1. All listed fault classes are implemented, documented, and covered by deterministic tests.
2. Overlays never modify canonical signal definitions; removal restores the exact pre-fault value/quality/behavior.
3. Faults propagate through the signal chain and produce observable downstream behavior changes in the reference cell.
4. Identical seeds reproduce identical fault sequences; replay reconstructs fault state and issues no commands.
5. Injection cannot write to a connector or live machinery; a test proves the boundary.
6. Existing scenario faults and recovery workflows still pass their tests.
7. Fault-lab UI is usable, accessible, EN/FR/DE, and engineering-only.
8. All gates pass (type-check, tests, build, visual, HMI, backend, contracts).

## Evidence expected for completion

```text
simulator type-check/test/build (N passed, listing fault-class + propagation + determinism tests)
visual regression results
HMI gates (pass)
dotnet build/test (pass)
npm run contracts:check (pass)
recorded overlay evaluation overhead
replay evidence showing fault reconstruction
```

## Rollback and failure containment

The overlay engine is additive; disabling it restores S37 behavior. Existing scenario faults stay untouched. If a fault class cannot be made deterministic, exclude it and document the gap rather than shipping nondeterministic training behavior.

## Follow-up items that must not leak into this sprint

- Reference-cell visual/fidelity deepening (S39).
- Server historian and time travel (S40/S41).
- Training sessions/assessment aggregation (S44/S45).
