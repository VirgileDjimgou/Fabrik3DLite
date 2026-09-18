# Educational scenario engine

The simulator is driven by scenarios instead of one hardcoded machining sequence. Scenario orchestration is separated from low-level robot and equipment behavior: the central scene component never encodes scenario logic.

## Scenario format

A scenario is a versioned definition (`src/scenarios/types.ts`, schema `1.0`):

- **Metadata**: id, localized title (en/fr/de), level (`beginner` / `intermediate` / `advanced`).
- **Learning**: localized learning objectives, prerequisites, success criteria.
- **Cell**: an optional `cellTemplateId` reference and optional `initialJoints`.
- **Activities**: an ordered list; each activity has a localized title + learner instruction and, when provided, an `expectedEvent` (`{ type, match? }`).
- **Text**: localized `explanation` (learner-facing) and `instructorNotes`.

## Runner

`src/scenarios/runner.ts` (`ScenarioRunner`) is a deterministic state machine: `start()` begins the first activity; `observe(event)` advances exactly one activity when the observed event matches the current activity's expected event; `reset()` returns to idle. Progress is reported as `{ status, currentActivityId, completedActivityIds, progressPercent }`.

## Catalog

`src/scenarios/catalog.ts` ships five reference scenarios, all with complete en/fr/de content:

- `robot-axes` (beginner), `coordinate-frames` (beginner)
- `pick-and-place` (intermediate), `cnc-loading` (intermediate)
- `pallet-processing` (advanced) — the **reference scenario**: it extracts the current pallet machining cycle, so the existing demonstration remains available.

`src/scenarios/workflowEvents.ts` chains scenario-event emission onto the `PalletMachiningWorkflow` callbacks without changing workflow behavior (the original callbacks still fire).

## Adding a scenario

A new scenario is pure data in the catalog — no change to the central scene component is required:

1. Add a `ScenarioDefinition` to `SCENARIO_CATALOG` (or a new catalog file).
2. Provide localized title, objectives, explanation, instructor notes, and one activity per expected event.
3. Extend `validation.test.ts` (schema conformance) and `translation.test.ts` (en/fr/de completeness).
4. If the scenario consumes new event types, add the emitter in `workflowEvents.ts` and cover it in `runner.test.ts`.
5. Run the scenario-lab e2e flow and the baseline gates.

## Orchestrator observability

Scenario progress and runtime state are observable through the orchestrator: the simulator bridge includes `scenarioId`, `scenarioActivityId`, and `scenarioProgress` in session state updates, which the server persists on the `SimulationSession`, exposes via `GET /api/simulation-sessions/{id}`, and broadcasts in the `SimulationStateChanged` event.

## Scenario lab

A WebGL-free harness (`/?view=scenario`, `ScenarioLab.vue`) lists the catalog, runs a selected scenario against a fast machining workflow, and shows live progress/status — used by the e2e flow that selects and completes a basic scenario.

## Non-goals

No grading analytics yet; scenarios never load arbitrary code.