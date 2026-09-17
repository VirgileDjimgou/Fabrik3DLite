# S10 - Cell persistence and extension boundaries

## Outcome

Make cell configurations portable, versioned, and safe to evolve across teams.

## Scope

- Define a versioned JSON schema for cell definitions and equipment references.
- Implement import, export, validation, migration, and human-readable diagnostics.
- Persist named cell templates through the orchestrator while retaining local import/export.
- Add sample cells for compact, medium, and heavy robots.
- Document the process for adding equipment definitions, visuals, behavior adapters, and tests.
- Establish package/module boundaries for future teams without converting to dynamic untrusted plugins.

## Tests and gates

- Schema conformance and malformed-file tests.
- Round-trip save/load tests preserving transforms and identifiers.
- Migration tests from the initial schema to the current schema.
- Backend authorization placeholder tests around cell storage endpoints.
- End-to-end test importing a sample, editing it, saving it, and running validation.

## Acceptance criteria

- Cell files are deterministic, versioned, and reviewable in Git.
- Older supported cell files migrate predictably.
- Adding a catalog entry has a documented test checklist.

## Non-goals

- No arbitrary code loading from cell files.
