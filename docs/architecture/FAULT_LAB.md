# Instructor fault lab

The instructor fault lab is the S38 engineering surface for injecting realistic
signal and equipment abnormalities into the simulated CNC machine-tending
reference cell. It is a **simulated** facility: every effect derives from the
runtime simulation and the timeline marks all records `simulated: true`.

## Surfaces

- `?view=fault-lab` — deterministic, WebGL-free harness
  (`src/components/FaultLabPage.vue`). It renders `FaultLabPanel` against the
  reference-cell signal registry and an affected-signal monitor so the
  downstream effect of an overlay is visible.
- `FaultLabPanel.vue` — the presentational engineering panel. It is embedded in
  the reference cell (`SingleConveyorCellLayout.vue`) under **Expert diagnostics**
  so the operator surface stays uncluttered.
- `FaultController` / `FaultLabPanel` for S13 scenario faults remain available in
  the operator dock as the "simulated fault lab" alarm/event surface.

The panel is engineering-only: it is not exposed in the operator HMI, and the
instructor/server coordination arrives with S44.

## Usage

1. Select a fault class. Signal classes show a signal selector; equipment classes
   hide it.
2. Select the target equipment and (for signal classes) the target signal.
3. Press **Activate overlay**. The panel confirms the target above the button and
   reports pending/success/failure feedback.
4. Active overlays show severity, source, activation time and the affected
   target. **Clear** is target-confirmed against the row.

In the `?view=fault-lab` harness, append `&authority=external` to simulate the
equipment being owned by an external controller; the panel then reports the
blocker and disables activation.

## Fault classes

See `docs/architecture/FAULTS_TIMELINE_REPLAY.md` for the full catalog, overlay
semantics, precedence, seeding and determinism guarantees. In short:

- signal-level: `forced-true`, `forced-false`, `frozen-value`, `disconnected`,
  `degraded-quality`, `intermittent`, `delayed`, `noisy-analog`, `drift`,
  `inverted`;
- equipment-level: `actuator-jam`, `actuator-slow-response`, `motor-overload`,
  `vacuum-loss`, `sensor-contamination`, `communications-loss`.

## Safety and limitations

- **Simulated only.** No overlay can write to a connector or live machinery; the
  fault surface exposes activation/deactivation/application only. An
  authority-safety test proves the boundary.
- **Injection is authority-gated.** When the affected equipment is under external
  authority, activation is refused with an explicit blocker and an `inject-blocked`
  timeline entry.
- **Canonical definitions are immutable.** Overlays are separate, inspectable and
  removable; clearing one restores the exact pre-fault value and quality.
- **Deterministic and seeded.** Stochastic classes reproduce exactly for the same
  seed; replay reconstructs active overlay state read-only and issues no commands.
- **Not yet permission-gated server-side.** Until S42, the surface relies on the
  documented engineering boundary and is not public by default.
- **No physical damage model.** Failure physics stays simulated; there is no
  rigid-body damage or real-machine effect.
- **No persistence.** Instructor-injected overlays are recorded in the in-memory
  timeline only; server-side audit persistence arrives with S40/S44.
