---
description: Activate and implement the next Fabrik3D roadmap sprint
agent: build
---

Follow the repository rules in `AGENTS.md`. Run `npm run sprint:next` from the repository root, then read the generated `docs/roadmap/CURRENT_SPRINT.md`, `docs/roadmap/QUALITY_GATES.md`, and the referenced source brief.

Implement only the active sprint. Inspect and preserve the existing implementation, add required tests, run applicable quality gates, and update affected documentation. Do not skip an active sprint, do not fabricate evidence, do not complete a sprint while a mandatory gate fails, and do not start the following sprint unless autonomous multi-sprint execution was explicitly authorized.

After all acceptance criteria pass, record completion with:

`npm run sprint:complete -- --summary "concise implementation summary" --evidence "exact tests and builds executed"`
