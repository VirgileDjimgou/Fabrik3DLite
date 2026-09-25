---
description: Activate and implement exactly one Fabrik3D roadmap sprint (atomic mode)
agent: build
---

This command is the atomic escape hatch: exactly one sprint, no batch.

Follow the repository rules in `AGENTS.md`. Run `npm run sprint:next` from the repository root, then read the generated `docs/roadmap/CURRENT_SPRINT.md`, `docs/roadmap/QUALITY_GATES.md`, and the referenced source brief.

Implement only the active sprint. Inspect and preserve the existing implementation, add required tests, run applicable quality gates, and update affected documentation. Do not skip an active sprint, do not fabricate evidence, do not complete a sprint while a mandatory gate fails, and do not activate the following sprint.

After all acceptance criteria pass, record completion with:

`npm run sprint:complete -- --summary "concise implementation summary" --evidence "exact tests and builds executed"`

Stop after that single sprint. Use `/start-next-sprint` for the bounded autonomous batch.
