---
description: Start or resume the bounded Fabrik3D autonomous sprint batch (maximum 10 completed sprints)
agent: build
---

Start the bounded Fabrik3D sprint autopilot for this repository. Do **not** implement a product sprint yourself in this session.

1. Run `npm run sprint:batch:start` from the repository root. It validates preconditions and launches the detached batch orchestrator, then returns.
2. Supervise with `npm run sprint:batch:watch`. Each call waits up to five minutes; re-run it until the printed status is terminal: `max_reached`, `roadmap_complete`, `completed`, `human_required`, `blocked_external`, `failed` or `stopped`.
3. If `start` refuses to launch (unresolved `HUMAN_REQUIRED.json`, unfinished previous batch, live lock, clamps), print the refusal verbatim and the required action. Never bypass, delete or edit autopilot state manually.
4. When the batch reaches a terminal state, run `npm run sprint:batch:status` and summarize the final batch report: batch id, completed count, completed sprints, stop reason, human gate (if any) and the next roadmap sprint.

Authoritative semantics live in `AGENTS.md` and `docs/roadmap/AUTOPILOT.md`. The repository batch orchestrator — not this session — activates each sprint, launches one fresh `sprint-worker` child session per sprint, verifies each sprint independently, and decides whether the following sprint may start. A maximum of 10 successful sprint completions is enforced by `scripts/sprint-batch-runner.mjs`, never by prompt text.
