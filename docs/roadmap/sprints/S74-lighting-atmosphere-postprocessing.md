# S74 - Industrial lighting, atmosphere and quality-gated post-processing

## Outcome

Make the cells read as a real industrial hall through coherent image-based lighting, atmosphere and
optional quality-gated post-processing, with measured performance and a guaranteed direct-render
fallback.

## Scope

- Replace the generic neutral `RoomEnvironment` PMREM in `src/composables/useThreeScene.ts` with a
  deterministic industrial-hall environment (procedural sky/softbox rig or generated hall scene),
  per-scene environment intensity, a subtle `scene.fog` and a gradient background instead of the flat
  color.
- Add a bounded local-lighting vocabulary: work lights, machine-hood spots and emissive fixtures tied to
  the existing `work-light` and `screen-emissive` materials, with a documented per-scene light budget
  and a single shadow-casting key light.
- Add an optional post-processing path (EffectComposer) with quality-gated passes: cheap depth AO or
  SSAO, selective bloom for emissive screens and status signals, and SMAA/FXAA. Low quality and
  unsupported environments must fall back to the current direct `renderer.render` path.
- Fix the renderer resize path to re-apply pixel ratio, and keep the existing low/medium/high quality
  presets authoritative for pass selection.
- Keep all lighting and post-processing visual-only; no state, signal, safety or collision effect.
- Update `docs/architecture/3D_ASSETS.md`, `docs/architecture/ASSET_RUNTIME.md`,
  `docs/architecture/HERO_REFERENCE_CELL.md` and `docs/architecture/SCENARIO_3D_RUNTIME.md` with the
  lighting/post-processing configuration and budgets.

## Non-goals and boundaries

- No HDRI/image asset downloads, no new runtime dependency, no bloom-heavy aesthetic that hides status
  colors.
- No change to simulation timing, determinism or the visual-regression protocol.
- No performance claim without the recorded GPU benchmark.

## Testing and validation

- Unit tests for environment/fog/light configuration per quality preset and for the composer fallback
  decision.
- Deterministic visual regressions for the reference cell and flagship scenarios in low and high
  quality.
- GPU benchmark on the reference machine recording triangles, draw calls, texture memory, load time,
  FPS and frame p50/p95/p99 before/after; keep the documented 60 FPS target or keep the sprint open.
- Run every applicable baseline gate in `docs/roadmap/QUALITY_GATES.md`.

## Acceptance criteria

1. Cells use a coherent industrial environment with fog/gradient background and bounded local lights.
2. Post-processing is optional, quality-gated and falls back cleanly; status colors stay readable.
3. Measured performance stays within the documented budget on reference hardware, with honest
   acceleration classification.
4. Visual regression baselines are regenerated only after review and remain deterministic.
5. No runtime, state or collision behavior changes.

## Evidence expected for completion

Record environment/light/post-processing configuration tests, low/high visual baselines, the measured
GPU benchmark comparison and all applicable baseline gates.
