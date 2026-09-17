# S11 - Educational scenario engine

## Outcome

Turn the simulator into a reusable learning environment driven by scenarios rather than one hardcoded machining sequence.

## Scope

- Define a versioned scenario format containing learning objectives, prerequisites, cell template, initial state, ordered activities, expected events, and success criteria.
- Extract the current pallet machining cycle into the first reference scenario.
- Add a scenario catalog with beginner/intermediate/advanced metadata.
- Add scenarios for robot axes, coordinate frames, pick-and-place, CNC loading, and complete pallet processing.
- Separate scenario orchestration from low-level robot and equipment behavior.
- Add instructor notes and learner-facing explanations in English, French, and German.

## Tests and gates

- Parser and schema tests for valid/invalid scenarios.
- Deterministic scenario-state transition tests.
- Test that the existing machining workflow produces equivalent outcomes after extraction.
- Translation key completeness tests for all reference scenarios.
- End-to-end test selecting and completing a basic scenario.

## Acceptance criteria

- A new scenario can be added without changing the central scene component.
- Scenario progress and runtime state are observable through the orchestrator.
- The existing demonstration remains available as a reference scenario.

## Non-goals

- No grading analytics yet.
