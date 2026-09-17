# Fabrik3D repository instructions

Fabrik3D is an existing modular educational robotic-cell and digital-twin demonstrator. Preserve current behavior and evolve it incrementally.

The authoritative roadmap is `docs/roadmap/roadmap.json`. When asked to start the next sprint, run `npm run sprint:next`, read `docs/roadmap/CURRENT_SPRINT.md` and `docs/roadmap/QUALITY_GATES.md`, then implement only that sprint with its tests and documentation.

Do not mark a sprint complete while required tests or builds fail. Complete it with `npm run sprint:complete -- --summary "..." --evidence "..."` and include the actual commands run.

Respect the architecture: server-orchestrator is the state authority, simulator executes and visualizes, HMI provides operator interaction, and external protocols are optional adapters. Use strict TypeScript, Vue 3, C#/.NET conventions, SI units, deterministic robotics tests, and industrial HMI semantics.
