# Fabrik3D agent instructions

## Product direction

Fabrik3D is an existing educational, industrial simulation, training, digital-twin and lightweight virtual-commissioning platform for building, simulating, supervising and understanding robotic cells. Its authoritative roadmap is `docs/roadmap/roadmap.json`; sprint briefs live in `docs/roadmap/sprints/`. Improve the platform incrementally; never restart, rewrite or re-bootstrap it, and never replace working modules without a documented migration reason.

## Sprint commands

`Start Next Sprint`, `Lancer le prochain sprint`, `Execute roadmap autonomously through S50`, and clearly equivalent requests mean:

> Start or resume the current next Fabrik3D roadmap sprint, implement it completely, validate it completely, and — only when it is successfully completed with all mandatory gates green and no human intervention required — automatically continue with the following sprint, sequentially, for a maximum of **10 successfully completed** sprints in this invocation.

1. Run `npm run sprint:batch:start` from the repository root; it launches the detached bounded batch orchestrator. Supervise with `npm run sprint:batch:watch` until the printed status is terminal.
2. The orchestrator activates each sprint with `npm run sprint:next`, launches one fresh `sprint-worker` child OpenCode session per sprint, verifies each sprint independently, and is the only layer allowed to decide whether another sprint starts.
3. Only a sprint completed through `npm run sprint:complete` counts toward the 10-sprint limit. Never skip, renumber or merge sprints.
4. Stop immediately for a `HUMAN_REQUIRED` gate (`docs/roadmap/autopilot/HUMAN_REQUIRED.json`), an external blocker, a manual STOP request, or a mandatory gate that remains red after at most 3 meaningful repair attempts. Never start sprint N+1 unless sprint N is independently verified green.
5. Do not ask the user to type `Start Next Sprint` again after every green sprint; that is exactly what this mechanism removes.

`Start One Sprint` is the atomic escape hatch and means exactly one sprint:

1. Run `npm run sprint:next` from the repository root.
2. Read `docs/roadmap/CURRENT_SPRINT.md`, `docs/roadmap/QUALITY_GATES.md`, and the source brief referenced by the active sprint.
3. Inspect the current implementation and `git status --short` before editing.
4. Implement only the active sprint. Preserve unrelated user changes.
5. Add the tests required by the sprint and run all applicable baseline gates from `QUALITY_GATES.md`.
6. Fix failures caused by the sprint. Report unrelated pre-existing failures explicitly with evidence; do not hide or attribute them to the sprint.
7. Update architecture/user documentation affected by the implementation, and keep implemented/experimental/planned/simulated/live claims accurate.
8. Run `npm run sprint:complete -- --summary "..." --evidence "..."` only when acceptance criteria and required gates pass. Evidence must contain the actual commands and results.
9. Stop after that sprint. Do not activate the following sprint.

If an active sprint already exists, `npm run sprint:next` resumes it rather than skipping it. `npm run sprint:validate` checks roadmap/brief/dependency/state consistency. The complete autopilot contract, state machine, stop conditions, human gates, repair policy and commands are documented in `docs/roadmap/AUTOPILOT.md`; that document and this section are authoritative for tool-specific instruction files.

## Non-negotiable guardrails

- One active sprint at a time by default; no silent skipping, no renumbering, no merging.
- The bounded batch orchestrator (`scripts/sprint-batch-runner.mjs`) is the only layer allowed to decide whether another sprint starts; no agent may bypass independent verification, and `MAX_BATCH_SPRINTS = 10` is a hard limit that must not be raised by prompt text or CLI argument.
- S01-S30 completion records in `docs/roadmap/state.json` are an immutable audit trail; never reset, rewrite, fabricate evidence for, or reinterpret them. Extend the roadmap only through S50; there is no S51.
- Never fabricate test output, screenshots, benchmarks, connector evidence or industrial data.
- Never mark a sprint complete while a mandatory gate fails, and never claim a gate that was not executed.
- No unrelated mass refactor, destructive rewrite, or downgrade of existing functionality.
- No safety certification, OEM emulation or standards-compliance claim without evidence and licensing.
- No protocol mock described as a live integration; documentation must state what is real, simulated or planned.
- Fault injection is explicitly simulated and must never propagate arbitrary writes into live machinery.
- Default to safe and read-only: connectors disabled, writes disabled and allow-listed, debug/Swagger off in production, tenant and role checks server-side.

## Engineering rules

- Keep the server as orchestration source of truth, the simulator as execution/visualization layer, and the HMI as operator interface.
- Keep TypeScript strict and use Vue 3 `<script setup lang="ts">`.
- Keep protocol adapters optional and outside core domain behavior.
- Use SI units internally for simulation and robotics.
- Do not duplicate REST contracts manually when generated contracts exist.
- Preserve `Definition ≠ Runtime ≠ Visual ≠ Collision ≠ Telemetry`.
- Add deterministic tests for geometry, frames, kinematics, state machines, contracts, signals and assessment.
- HMI color communicates status; it is not decorative. Critical actions identify their target and report pending/success/failure.
- Keep operator, engineering and instructor personas on distinct surfaces.
- Do not commit secrets, generated dependencies, build output, or local IDE state.

## How to resume safely

A new agent or developer must be able to determine architecture, active and completed sprints, quality gates, worktree state, how to test and how to record completion from the repository alone, without hidden conversation context. Read `README.md`, `docs/roadmap/*` (including `docs/roadmap/AUTOPILOT.md` and `docs/roadmap/autopilot/state.json`), `docs/architecture/*` and the active sprint brief; do not rely on undocumented assumptions.
