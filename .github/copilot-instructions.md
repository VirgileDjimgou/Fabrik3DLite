# Fabrik3D repository instructions

Fabrik3D is an existing modular educational industrial simulation, training, digital-twin and lightweight virtual-commissioning platform. Preserve current behavior and evolve it incrementally. The common rules are authoritative in [`AGENTS.md`](../AGENTS.md); this file only points to them.

The authoritative roadmap is `docs/roadmap/roadmap.json`; the canonical sprint semantics are in `AGENTS.md`, and the autopilot contract is in [`docs/roadmap/AUTOPILOT.md`](../docs/roadmap/AUTOPILOT.md).

- `Start Next Sprint` / `Lancer le prochain sprint` / autonomous roadmap execution → run the bounded batch orchestrator from the repository root: `npm run sprint:batch:start`, then supervise with `npm run sprint:batch:watch` until terminal. The orchestrator activates each sprint, runs one fresh `sprint-worker` child session per sprint, verifies each sprint independently and continues only when the previous sprint is green, for a maximum of 10 completed sprints. Do not implement product sprints directly in this session and do not enqueue one command per sprint.
- `Start One Sprint` → the atomic one-sprint workflow described in `AGENTS.md`: `npm run sprint:next`, read `docs/roadmap/CURRENT_SPRINT.md`, implement only that sprint with its tests and documentation, run the applicable gates, then `npm run sprint:complete -- --summary "..." --evidence "..."`, and stop.

Never fabricate evidence, never mark a sprint complete while a mandatory gate fails, and never start sprint N+1 unless sprint N was independently verified. Stop immediately for `HUMAN_REQUIRED` (`docs/roadmap/autopilot/HUMAN_REQUIRED.json`), an external blocker or an unresolved failure. Preserve unrelated user changes.

Respect the architecture: the server is the orchestration source of truth, the simulator executes and visualizes, the HMI is the operator interface, and external protocols are optional adapters (disabled by default, writes allow-listed). Keep `Definition ≠ Runtime ≠ Visual ≠ Collision ≠ Telemetry`. S01-S30 completion records in `docs/roadmap/state.json` are immutable history; the roadmap ends at S50.
