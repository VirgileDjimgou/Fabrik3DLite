---
description: Activate and implement the next Fabrik3D roadmap sprint
agent: build
---

Run `npm run sprint:next` from the repository root, then read the generated `docs/roadmap/CURRENT_SPRINT.md` and `docs/roadmap/QUALITY_GATES.md`.

Implement only the active sprint. Inspect and preserve the existing implementation, add required tests, run applicable quality gates, and update affected documentation. Do not skip an active sprint and do not start the following sprint.

After all acceptance criteria pass, record completion with:

`npm run sprint:complete -- --summary "concise implementation summary" --evidence "exact tests and builds executed"`
