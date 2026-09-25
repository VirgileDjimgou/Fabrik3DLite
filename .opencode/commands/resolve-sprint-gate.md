---
description: Resolve the Fabrik3D HUMAN_REQUIRED gate after the required human action is complete
agent: build
---

Run the repository gate resolution with an explicit note describing what the human did and how it was verified:

`npm run sprint:batch:resolve-gate -- --reason "$ARGUMENTS"`

If `$ARGUMENTS` is empty, ask the user for the resolution note first; never resolve a gate without one. The script verifies roadmap validation before clearing `docs/roadmap/autopilot/HUMAN_REQUIRED.json` and appends the resolution to `docs/roadmap/autopilot/GATE_HISTORY.json`. Do not delete the gate file manually.

After resolution, report whether the user should run `/start-next-sprint` (new bounded batch) or `npm run sprint:batch:resume` (continue the previous batch).
