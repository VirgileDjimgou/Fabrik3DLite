# S39 - High-fidelity CNC machine-tending reference cell

## Outcome

The existing CNC machine-tending reference cell becomes the commercial-quality demonstration baseline: credible machine states, timings, abnormal conditions, professional industrial proportions, believable PBR materials, sensible lighting, environment grounding, clear safety fencing and access, signal-driven visual states, and enough meaningful I/O to demonstrate real controller integration. No broad new scenes are added.

## Motivation

S21-S30 built many scenes and assets; S31-S38 made the CNC cell signal-driven and faultable. The reference cell should now be the flagship, deep rather than broad, because it is the substrate of virtual commissioning and training showcases.

## Current-state assumptions to verify

- The `cnc-machine-tending` preset loads `SingleConveyorCellLayout.vue` with `scaled-robot`, `LargeCNCMachine`, `PalletConveyorFeed`, `SafetyGuardSystem`, `IndustrialInfrastructureSystem`.
- Assets are generated GLBs with procedural fallbacks and semantic nodes (`public/assets/equipment/*`), loaded through `EquipmentVisualProvider`.
- S32 declared the signal catalog and bindings; S38 added signal/equipment faults.
- Performance budgets and visual baselines exist; `docs/architecture/CNC_AND_SAFETY_VISUALS.md`, `INDUSTRIAL_SCENE.md`, `3D_ASSETS.md` document current visuals.
- Deterministic collision proxies are separate from visual meshes.

## Scope

- Deepen behavior and state realism:
  - robot motion profile improvements (approach/retreat, tool orientation, dwell) within existing kinematics and safety guards;
  - CNC full cycle: door open/close with interlocks, fixture clamp/unclamp, spindle spin-up/down, feed, cycle complete, unload, fault states;
  - chuck/fixture behavior and part presence consistency with signals (`FixtureClamped`, `PartPresent`);
  - material flow: pallet indexing, slot states, raw/in-process/machined transitions, reject path where justified;
  - gripper open/close timing and payload detection consistency;
  - sensors: photoeyes, door, clamp, spindle, position feedback;
  - safety devices: gate closed/locked, light curtain, E-stop chain, safety reset with plausible sequencing;
  - drive/motor states: conveyor running/speed, robot servo state, CNC spindle/feed;
  - stack light driven by actual machine/safety state;
  - operator station with realistic indicators and controls that map to existing commands;
  - realistic timings: documented cycle time budget with per-phase durations;
  - abnormal conditions: jam, blocked sensor, door obstruction, vacuum loss, spindle fault, communications loss (using S38 overlays).
- Visual quality:
  - professional proportions and scale for robot, CNC, conveyor, pallet, fencing, cabinets, cable trays, stack light, control station;
  - coherent PBR materials (painted steel, stainless, safety yellow, rubber, glass), believable roughness/metalness, no random gradients or gaming aesthetics;
  - sensible three-point/industrial lighting, restrained environment, floor grounding, contact shadows;
  - clear machine access, warning markings, equipment labels, emergency-stop visibility;
  - all state-bearing visuals driven by runtime signals/state, never decorative.
- Performance and robustness:
  - maintain LOD, instancing where useful, texture budgets, deterministic disposal on unload;
  - preserve collision proxies and never derive collision authority from visual meshes;
  - documented frame-time, draw-call, triangle, and texture budgets measured on the reference cell.
- I/O depth: ensure the cell exposes tens to low hundreds of meaningful signals; every exposed signal serves a credible purpose and has a driver/consumer table entry (extend `REFERENCE_SIGNAL_CATALOG.md`).

## Non-goals

- No new industrial scenes or presets.
- No cinematic graphics, VR, or photorealism pursuit at the cost of readability/performance.
- No OEM-specific machines; keep vendor-neutral generic equipment.
- No control-authority or protocol changes; connectors stay as built.

## Architecture boundaries

- Runtime behavior remains authoritative in simulation modules; visuals subscribe to state.
- Assets remain renderer-only; definitions/runtime/collision/telemetry stay separate.
- Safety visuals remain teaching aids, not certified functions.

## Domain and data model changes

- Additive signal/state fields only where the deeper behavior requires them (for example CNC sub-state); document each addition and keep it aligned with the signal schema.
- No breaking changes to existing equipment definitions.

## Backend changes

None required beyond regenerated contracts if any DTO is touched (avoid touching DTOs unless necessary).

## Simulator changes

- `LargeCNCMachine.vue` and related state machines: richer phases and signal-consistent visuals.
- `PalletMachiningWorkflow`: timing/phase refinements that preserve deterministic outcomes and safety guards.
- Robot motion: smoother, profile-driven motion within existing kinematics/safety.
- Safety visuals and stack light: state-driven.
- New or refined procedural geometry as needed; regenerate GLBs deterministically through `npm run assets:generate` when assets change, with manifests/hashes updated.
- Update collision proxies for any geometry change and keep deterministic tests green.

## HMI and UX changes

- Operator HMI remains unchanged; if machine-state detail changes server-side, surface it through existing fields only.
- Engineering diagnostics may expose new sub-states.

## 3D and visual requirements

- Before/after screenshots at desktop, laptop, and a touch resolution for the reference cell in nominal, running, fault, and safety states.
- Measured frame time, draw calls, triangle count, and texture memory on the documented reference machine and browser; record in evidence.
- Repeated scene load/unload shows no GPU/resource growth (bounded threshold documented).
- Visual regression baselines updated intentionally with a written rationale for each change.

## Protocol and security requirements

- No new protocol surface. Signal ids remain stable so S33-S38 mappings do not break; any renamed signal requires a mapping migration note.

## Backward compatibility

- Existing scenarios, faults, mappings, and authority flows continue to work.
- Cell files and scene presets referencing the reference cell keep loading.
- Existing signal ids remain stable; additions are additive.

## Migration requirements

- If signal ids change for correctness, provide a documented alias/migration and update catalogs/mappings; do not silently rename.

## Failure and degraded-mode behavior

- Missing/updated assets fall back procedurally with a diagnostic.
- Abnormal conditions use the S38 overlay system and recover deterministically.
- Scene unload disposes new resources; no listener leaks.

## Testing strategy

- Deterministic state/timing tests for the CNC cycle, fixture/clamp, gripper/payload, pallet/slot transitions, and safety sequencing.
- Signal consistency tests: every state-bearing visual maps to a signal/state value.
- Geometry/collision determinism tests for changed proxies.
- Fault/abnormal-condition tests using S38 overlays.
- Visual regression and performance measurements; repeated load/unload leak checks.
- Scenario/workflow equivalence tests remain green.

## Performance requirements

- Documented budget: target stable 60 fps at 1080p on the reference machine for the reference cell; record measured frame time and draw calls.
- No per-frame allocation growth; repeated scene switches bounded.
- Asset download size bounded; LODs used at distance.

## Security considerations

- Generated assets are deterministic and license-safe; no external downloads at runtime.
- No secrets or endpoints introduced.

## Documentation changes

- Update `docs/architecture/CNC_AND_SAFETY_VISUALS.md`, `INDUSTRIAL_SCENE.md`, `PROFESSIONAL_ROBOT_ASSETS.md`, and `REFERENCE_SIGNAL_CATALOG.md`.
- Add a reference-cell walkthrough section in `README.md` with updated screenshots.
- Record budgets and measurements in `docs/architecture/3D_ASSETS.md` or a dedicated performance note.

## Acceptance criteria

1. The reference cell demonstrates the complete flow: pallet feed → robot load → CNC cycle (door/fixture/spindle/feed) → part return → cycle complete, with state-consistent visuals.
2. Every state-bearing visual derives from runtime state/signals; no contradictory animation.
3. Abnormal conditions (jam, sensor fault, door obstruction, vacuum loss, spindle fault, communications loss) are reproducible through S38 and recover deterministically.
4. Signal catalog remains stable or migrations are provided; mapping/authority flows still pass.
5. Measured performance stays within documented budgets; repeated load/unload shows no resource growth.
6. Visual regression, scenario, fault, safety, and backend gates all pass.

## Evidence expected for completion

```text
simulator type-check/test/build (N passed)
visual regression before/after at desktop/laptop/touch
recorded frame time, draw calls, triangles, texture memory
repeated load/unload measurement
asset regeneration output (npm run assets:generate) if assets changed
dotnet build/test (pass)
npm run contracts:check (pass)
```

## Rollback and failure containment

Keep changes incremental per concern (CNC, robot, conveyor, safety, visuals) so any regression can be reverted independently. If performance budgets cannot be met, revert the offending visual change and document the deferral rather than shipping a regression.

## Follow-up items that must not leak into this sprint

- Historian persistence (S40), time travel (S41).
- Training sessions/instructor dashboards (S44/S45).
- Packaging/observability hardening (S48/S49).
