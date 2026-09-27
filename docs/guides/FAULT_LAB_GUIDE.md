# Fault lab guide

Status: verified against the 1.0 build. Every fault in Fabrik3D is **simulated**. Fault injection
never propagates arbitrary writes into live machinery and never becomes a real connector write.

The fault lab lets an instructor or engineer inject deterministic abnormal conditions, watch them
propagate through the signal/equipment chain, and verify recovery. It is the abnormal-condition
half of the training loop: scenario → fault → diagnosis → recovery → report.

## Open the fault lab

| Surface | How to open | Audience |
| --- | --- | --- |
| Fault lab harness | `?view=fault-lab` | Engineering / instructor |
| Expert diagnostics dock | Reference cell → bottom *Learning & diagnostics* dock | Engineering |
| Fault lab with external authority | `?view=fault-lab&authority=external` | Demonstrates injection refusal under external control |

The operator HMI does **not** expose fault injection; operator screens stay dense-free and read-only
for diagnostics.

## Concepts

- **Overlay** — a simulated modification applied to a signal when it is published (for example a
  forced value, freeze, delay, drift or disconnect). Overlays are separate, inspectable data; they
  never mutate the canonical signal definitions.
- **Class** — a typed fault category with documented precedence and deterministic behavior. The
  authoritative catalog is `Fabrik3D/fabrik3d.client/src/faults/overlayCatalog.ts`; the training
  timeline and typed faults are documented in
  [Faults, timeline and replay](../architecture/FAULTS_TIMELINE_REPLAY.md).
- **Precedence** — when several overlays target the same signal, the documented precedence order
  decides the observed value; this is deterministic and tested.
- **Timeline** — every raise and clear is recorded in order, and replay reconstructs the same
  sequence deterministically.
- **Authority gate** — while a scope is owned by an external controller or by replay, fault
  injection that could affect that scope is refused. Fault injection cannot write to a connector.

## Fault categories

The catalog groups faults into signal-level overlays (forced, frozen, inverted, delayed, noisy,
drifting, intermittent, disconnected, degraded values) and equipment-level effects (for example an
actuator jam or slow motion, motor overload, vacuum loss, sensor contamination and communications
loss). The exact class list, EN/FR/DE descriptions and precedence are maintained in the code catalog
and rendered in the panel; do not rely on a hard-coded list in prose.

Some classes support a **seeded stochastic pattern** (a deterministic PRNG). The same seed and the
same inputs always produce the same sequence, so an exercise is reproducible.

## Exercise recipe

1. Open the reference cell and start a guided run.
2. Open the fault lab and select a target signal or equipment.
3. Choose a fault class and raise it. Confirm the panel reports the injection with pending → success
   feedback.
4. Observe the effect: the *signal inspector* (`?view=signals`) shows the observed value, quality
   and source; the 3D cell and dashboard reflect the degraded state; unsafe commands are **refused**
   without mutating state.
5. Diagnose the condition, then clear the overlay (or use the documented recovery control) and
   confirm the state returns to nominal deterministically.
6. Replay the timeline (`?view=time-travel`) to review the fault → recovery sequence. Replay is
   read-only: it can never acquire authority or emit a write.

## Safety and honesty

- Faults are simulated and authority-gated; they cannot propagate arbitrary writes into live
  machinery.
- A refused command leaves runtime state untouched — there is no silent fallback and no fabricated
  data.
- Missing history is reported as a gap, never invented.
- The lab is a teaching aid, not a safety or SIL-rated function.

## Related documents

- [Fault lab architecture](../architecture/FAULT_LAB.md)
- [Faults, timeline and replay](../architecture/FAULTS_TIMELINE_REPLAY.md)
- [Reference signal catalog](../architecture/REFERENCE_SIGNAL_CATALOG.md)
- [Deterministic time travel](../architecture/TIME_TRAVEL.md)
- [Instructor guide](INSTRUCTOR_GUIDE.md)
