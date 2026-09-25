---
mode: agent
description: Start or resume the bounded Fabrik3D autonomous sprint batch
---

Follow the canonical repository rules in [`AGENTS.md`](../../AGENTS.md); the autopilot contract is [`docs/roadmap/AUTOPILOT.md`](../../docs/roadmap/AUTOPILOT.md).

Start or resume the bounded Fabrik3D sprint batch:

1. Run `npm run sprint:batch:start` from the repository root. It validates preconditions and launches the detached orchestrator, then returns.
2. Supervise with `npm run sprint:batch:watch` until the status is terminal (`max_reached`, `roadmap_complete`, `completed`, `human_required`, `blocked_external`, `failed`, `stopped`).
3. If `start` refuses, print the refusal and the required action; never bypass the gate, delete state manually or start a parallel batch.
4. At the end, run `npm run sprint:batch:status` and summarize the batch report: batch id, completed count, completed sprints, stop reason, human gate and next roadmap sprint.

The batch orchestrator activates each sprint, runs one fresh `sprint-worker` child session per sprint, verifies each sprint independently and continues only while every previous sprint is green. The hard maximum is 10 completed sprints per invocation; do not implement the sprints directly in this session and do not enqueue one command per sprint.

For a single sprint only, use `/start-one-sprint` instead.
