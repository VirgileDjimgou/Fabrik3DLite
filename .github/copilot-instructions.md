# Fabrik3D repository instructions

Fabrik3D is an existing modular educational industrial simulation, training, digital-twin and lightweight virtual-commissioning platform. Preserve current behavior and evolve it incrementally. The common rules are authoritative in [`AGENTS.md`](../AGENTS.md); this file only points to them.

The authoritative roadmap is `docs/roadmap/roadmap.json`. When asked to start the next sprint:

1. Run `npm run sprint:next` (it resumes an active sprint rather than skipping it).
2. Read `docs/roadmap/CURRENT_SPRINT.md`, `docs/roadmap/QUALITY_GATES.md`, and the referenced brief.
3. Inspect the implementation and `git status --short` before editing; preserve unrelated user changes.
4. Implement only that sprint, with its tests and documentation.
5. Do not fabricate evidence, do not mark a sprint complete while a mandatory gate fails, and keep implemented/simulated/planned claims accurate.
6. Complete only with `npm run sprint:complete -- --summary "..." --evidence "..."`, including the real commands and results.

Respect the architecture: the server is the orchestration source of truth, the simulator executes and visualizes, the HMI is the operator interface, and external protocols are optional adapters (disabled by default, writes allow-listed). Keep `Definition ≠ Runtime ≠ Visual ≠ Collision ≠ Telemetry`. S01-S30 completion records in `docs/roadmap/state.json` are immutable history; the roadmap ends at S50.
