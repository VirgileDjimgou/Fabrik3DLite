# Fabrik3D agent instructions

## Product direction

Fabrik3D is an existing educational, industrial simulation, training, digital-twin and lightweight virtual-commissioning platform for building, simulating, supervising and understanding robotic cells. Its authoritative roadmap is `docs/roadmap/roadmap.json`; sprint briefs live in `docs/roadmap/sprints/`. Improve the platform incrementally; never restart, rewrite or re-bootstrap it, and never replace working modules without a documented migration reason.

## Sprint commands

When the user says `Start Next Sprint`, `Lancer le prochain sprint`, `Execute roadmap autonomously through S50`, or an equivalent request:

1. Run `npm run sprint:next` from the repository root.
2. Read `docs/roadmap/CURRENT_SPRINT.md`, `docs/roadmap/QUALITY_GATES.md`, and the source brief referenced by the active sprint.
3. Inspect the current implementation and `git status --short` before editing.
4. Implement only the active sprint. Preserve unrelated user changes.
5. Add the tests required by the sprint and run all applicable baseline gates from `QUALITY_GATES.md`.
6. Fix failures caused by the sprint. Report unrelated pre-existing failures explicitly with evidence; do not hide or attribute them to the sprint.
7. Update architecture/user documentation affected by the implementation, and keep implemented/experimental/planned/simulated/live claims accurate.
8. Run `npm run sprint:complete -- --summary "..." --evidence "..."` only when acceptance criteria and required gates pass. Evidence must contain the actual commands and results.
9. Stop after the active sprint unless the user explicitly authorized autonomous multi-sprint execution; never merge several sprints into one implementation batch.

If an active sprint already exists, `npm run sprint:next` resumes it rather than skipping it. `npm run sprint:validate` checks roadmap/brief/dependency/state consistency.

## Non-negotiable guardrails

- One active sprint at a time by default; no silent skipping, no renumbering, no merging.
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

A new agent or developer must be able to determine architecture, active and completed sprints, quality gates, worktree state, how to test and how to record completion from the repository alone, without hidden conversation context. Read `README.md`, `docs/roadmap/*`, `docs/architecture/*` and the active sprint brief; do not rely on undocumented assumptions.
