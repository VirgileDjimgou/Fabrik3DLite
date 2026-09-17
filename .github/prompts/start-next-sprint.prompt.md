---
mode: agent
description: Activate and implement the next Fabrik3D roadmap sprint
---

Run `npm run sprint:next` from the repository root. Read `docs/roadmap/CURRENT_SPRINT.md` and `docs/roadmap/QUALITY_GATES.md` completely.

Inspect the current code and worktree, then implement the active sprint end to end without restarting the project or reverting unrelated changes. Add the required tests, run all applicable quality gates, and update affected documentation.

Only when the acceptance criteria pass, run:

```text
npm run sprint:complete -- --summary "concise implementation summary" --evidence "exact tests and builds executed"
```

Do not start another sprint during this request.
