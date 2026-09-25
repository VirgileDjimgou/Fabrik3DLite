---
description: Resume the previous Fabrik3D sprint batch after a stop or a resolved human gate
agent: build
---

Run `npm run sprint:batch:resume` from the repository root. It revalidates preconditions, clears a manual STOP request, reconciles any sprint that finished while the parent was not running, and continues the batch with its remaining quota. Then supervise with `npm run sprint:batch:watch` until the batch is terminal, exactly like `/start-next-sprint`.

Refuse to continue and report the gate if `docs/roadmap/autopilot/HUMAN_REQUIRED.json` still exists, or if the previous batch reached `max_reached`/`roadmap_complete` (start a new batch instead).
