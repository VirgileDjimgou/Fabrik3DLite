---
description: Gracefully stop the running Fabrik3D sprint batch after the current worker returns
agent: build
---

Run `npm run sprint:batch:stop` from the repository root. This writes the graceful STOP request checked by the orchestrator before every sprint activation. It never kills a worker mid-write and never marks a sprint complete. After that, run `npm run sprint:batch:status` once and report the current state.
