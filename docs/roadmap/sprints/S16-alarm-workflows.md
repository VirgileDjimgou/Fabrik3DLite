# S16 - Industrial alarms and operator workflows

## Outcome

Implement a complete, teachable alarm lifecycle inspired by IEC 62682 concepts without claiming formal compliance.

## Scope

- Model active, returned-to-normal, acknowledged, shelved/suppressed-for-training, and closed states.
- Add severity, source equipment, first/last occurrence, occurrence count, cause, consequence, and operator guidance.
- Separate alarms from informational operator messages.
- Add filtering, sorting, acknowledgement identity, and alarm detail views.
- Persist an immutable audit trail of operator alarm actions.
- Connect simulator faults to structured alarm definitions and recovery prerequisites.

## Tests and gates

- Domain transition tests for every alarm lifecycle path.
- Persistence and concurrent acknowledgement integration tests.
- SignalR ordering and reconnect consistency tests.
- HMI component/accessibility tests for alarm tables and detail panels.
- End-to-end fault → alarm → acknowledgement → recovery journey.

## Acceptance criteria

- Alarm state remains consistent across simulator, server, and HMI.
- Acknowledgement records who, when, and what was acknowledged.
- Informational messages do not use alarm severity styling.

## Non-goals

- No regulatory compliance certification.
