# Fabrik3D agent instructions

## Product direction

Fabrik3D is an existing educational and demonstrative platform for building, simulating, supervising, and understanding robotic cells, from a virtual scenario to a connected digital twin. Improve it incrementally; do not restart it or replace working modules without a documented migration reason.

## Sprint commands

When the user says `Start Next Sprint`, `Lancer le prochain sprint`, or an equivalent request:

1. Run `npm run sprint:next` from the repository root.
2. Read `docs/roadmap/CURRENT_SPRINT.md`, `docs/roadmap/QUALITY_GATES.md`, and the source brief referenced by the active sprint.
3. Inspect the current implementation and dirty worktree before editing.
4. Implement only the active sprint. Preserve unrelated user changes.
5. Add the tests required by the sprint and run all applicable baseline gates.
6. Fix failures caused by the sprint. Report unrelated pre-existing failures explicitly.
7. Update architecture/user documentation affected by the implementation.
8. Run `npm run sprint:complete -- --summary "..." --evidence "..."` only when acceptance criteria and required gates pass.
9. Do not activate the following sprint in the same request unless the user explicitly asks for multiple sprints.

If an active sprint already exists, `npm run sprint:next` resumes it rather than skipping it.

## Engineering rules

- Keep the server as orchestration source of truth, the simulator as execution/visualization layer, and the HMI as operator interface.
- Keep TypeScript strict and use Vue 3 `<script setup lang="ts">`.
- Keep protocol adapters optional and outside core domain behavior.
- Use SI units internally for simulation and robotics.
- Do not duplicate REST contracts manually when generated contracts exist.
- Add deterministic tests for geometry, frames, kinematics, state machines, and contracts.
- HMI color communicates status; it is not decorative. Critical actions identify their target.
- Never claim safety certification or exact OEM emulation without corresponding evidence.
- Do not commit secrets, generated dependencies, build output, or local IDE state.
