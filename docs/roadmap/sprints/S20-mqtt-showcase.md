# S20 - MQTT adapter and final connected showcase

## Outcome

Complete the roadmap with a second optional protocol and a polished demonstration from virtual scenario to connected digital twin.

## Scope

- Add an MQTT adapter mapping versioned topics to normalized twin state and approved commands.
- Define topic naming, QoS, retained-message, session, reconnect, and payload-version policies.
- Ship a local broker configuration and deterministic publisher fixture.
- Demonstrate one HMI supervising the same logical cell in simulation, telemetry replay, OPC UA, and MQTT modes.
- Add a guided showcase scenario, architecture documentation, demo data, screenshots/video checklist, and troubleshooting runbook.
- Review module ownership, extension documentation, security boundaries, and roadmap outcomes.

## Tests and gates

- Topic/payload mapping and invalid-message tests.
- Broker reconnect, retained stale value, duplicate delivery, QoS, and authorization tests.
- Cross-adapter conformance tests against the normalized twin model.
- Full end-to-end showcase covering HMI command, orchestration, simulator/twin state, alarm, timeline, and report.
- Performance smoke test for expected educational telemetry rates.
- Clean-clone installation and execution rehearsal.

## Acceptance criteria

- MQTT and OPC UA remain optional adapters rather than core dependencies.
- The final demo is reproducible from documented commands and sample data.
- The repository clearly demonstrates construction, simulation, supervision, learning, replay, and connected twin capabilities.

## Non-goals

- No production certification, safety PLC control, or commercial-scale fleet management.
