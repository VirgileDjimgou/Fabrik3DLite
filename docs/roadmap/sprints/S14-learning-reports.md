# S14 - Learning assessment and reports

## Outcome

Provide useful feedback to learners and instructors without turning the project into a full learning-management system.

## Scope

- Track scenario completion, steps attempted, faults encountered, hints used, and recovery actions.
- Add configurable assessment rules and transparent scoring criteria.
- Produce a concise HTML/JSON report for a completed session.
- Add instructor mode for resetting scenarios and comparing expected versus observed actions.
- Add anonymized local learner profiles or session aliases; avoid collecting unnecessary personal data.
- Document how reports should be interpreted and their educational limitations.

## Tests and gates

- Assessment rule and scoring boundary tests.
- Report schema and snapshot tests.
- Verify report values against recorded timeline fixtures.
- Access-control tests for instructor-only actions once identity support is introduced.
- End-to-end scenario completion followed by report export.

## Acceptance criteria

- Reports are derived from traceable events rather than UI-only counters.
- Learners can understand why a criterion passed or failed.
- The feature works without an external LMS.

## Non-goals

- No SCORM/LTI integration in this sprint.
