---
mode: agent
description: Activate and implement the next Fabrik3D roadmap sprint
---

Follow the repository rules in [`AGENTS.md`](../../AGENTS.md). Run `npm run sprint:next` from the repository root, then read `docs/roadmap/CURRENT_SPRINT.md` and `docs/roadmap/QUALITY_GATES.md` completely, plus the referenced source brief.

Inspect the current code and worktree state before editing. Implement only the active sprint end to end without restarting the project, skipping sprints, or reverting unrelated changes. Add the required tests, run all applicable quality gates, and update affected documentation. Never fabricate evidence and never complete a sprint while a mandatory gate fails.

Only when the acceptance criteria pass, run:

```text
npm run sprint:complete -- --summary "concise implementation summary" --evidence "exact tests and builds executed"
```

Do not start another sprint during this request unless autonomous multi-sprint execution was explicitly authorized.
