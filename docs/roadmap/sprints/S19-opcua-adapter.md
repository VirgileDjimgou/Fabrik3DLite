# S19 - OPC UA adapter

## Outcome

Connect Fabrik3D to an industrial protocol through an optional, isolated adapter while keeping the core simulation independent.

## Scope

- Add an OPC UA client adapter as a separate deployable or infrastructure module.
- Map a documented sample namespace to normalized twin state and approved commands.
- Add endpoint, security policy, certificate, reconnect, subscription, and sampling configuration.
- Ship a local test server or containerized fixture for education and CI.
- Expose connector health and mapping diagnostics in the orchestrator/HMI.
- Default to read-only behavior; require explicit configuration for command writes.

## Tests and gates

- Mapping unit tests using captured/sample node values.
- Integration tests against the isolated OPC UA fixture.
- Certificate rejection/trust, invalid type, reconnect, stale subscription, and unavailable server tests.
- Contract tests proving the core twin model is protocol-independent.
- End-to-end read-only connected-cell demonstration.

## Acceptance criteria

- OPC UA can be disabled without affecting simulation.
- Connection failures do not crash the orchestrator.
- Write operations are allow-listed, logged, and disabled by default.

## Non-goals

- No claim of interoperability with every vendor information model.
