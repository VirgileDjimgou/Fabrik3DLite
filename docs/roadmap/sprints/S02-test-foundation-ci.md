# S02 - Automated test foundation and CI

## Outcome

Create the test and continuous-integration foundation required for safe multi-team development.

## Scope

- Add backend unit and integration test projects using xUnit.
- Add Vitest and Vue Test Utils to simulator and HMI.
- Add Playwright with one minimal end-to-end smoke journey.
- Add deterministic fixtures for jobs, sessions, palettes, and machine state.
- Add CI workflows for restore, type checking, tests, and builds.
- Publish readable test results and preserve failed test artifacts.

## Initial test coverage

- Backend job state transitions and invalid transitions.
- Repository persistence against an isolated MongoDB test instance.
- Pallet slot state transitions and workflow counters.
- HMI API client error handling and one critical component.
- End-to-end health check plus job creation/start/pause/resume/stop.

## Tests and gates

- All new test commands execute locally and in CI.
- Tests must not depend on a developer's MongoDB database.
- Add a regression test for the simulator build issue repaired in S01 where practical.

## Acceptance criteria

- Pull requests receive build and test feedback automatically.
- A failing test makes CI fail.
- Test data is isolated and repeatable.

## Non-goals

- High coverage percentage is not the target yet; reliable foundations are.
