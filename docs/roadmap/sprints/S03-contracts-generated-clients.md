# S03 - Contracts and generated clients

## Outcome

Remove manual drift between C# contracts and the two TypeScript clients while keeping current routes compatible.

## Scope

- Define the orchestrator OpenAPI document as the transport contract source of truth.
- Generate typed TypeScript clients/models for HMI and simulator during development or CI.
- Preserve a thin handwritten service layer for application-friendly calls.
- Stabilize JSON naming, nullability, enum representation, API error shape, and API versioning policy.
- Add contract compatibility checks for REST and SignalR payloads.
- Document how a contract change is proposed and rolled out across teams.

## Deliverables

- Generated client package or generated source consumed by both frontends.
- Shared normalized API error model.
- SignalR event schema tests or equivalent serialized fixtures.

## Tests and gates

- Snapshot or schema tests for OpenAPI.
- Serialization tests for all DTOs and hub events.
- Client generation is deterministic and produces no uncommitted diff in CI.
- Existing HMI and simulator API flows remain functional.

## Acceptance criteria

- DTOs are no longer independently maintained in multiple frontend files.
- An incompatible server contract change is detected before merge.

## Non-goals

- No switch to GraphQL or a message broker.
