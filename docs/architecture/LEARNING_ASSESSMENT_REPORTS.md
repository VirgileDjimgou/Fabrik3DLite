# Learning assessment and reports

S14 assesses the simulator from its ordered, simulated event timeline. It is not an LMS and does not send data to an external service.

## Data and privacy

Learners may enter a local session alias. The value is sanitized to a short pseudonym; no name, email address, account, or external identifier is required or stored. Reports are generated in the browser as JSON or HTML downloads.

## Scoring

The default assessment is transparent and configurable in `src/learning/assessment.ts`:

- 40 points: a `complete` workflow transition is recorded;
- 40 points: each timeline alarm has a recorded retry recovery action;
- 20 points: every recorded guided checkpoint has a deliberate `step-next` attempt.

Each report includes the observed evidence for every criterion, so a learner can see why it passed or did not pass. A no-fault run receives the recovery criterion because no recovery was required.

S38 overlay faults are recorded on the same timeline: an activation is an `alarm` entry and a clear is a `fault-action`. The existing recovery criterion therefore also counts an instructor-injected overlay that was observed and cleared, while replay reconstructs active overlay state read-only. See [FAULTS_TIMELINE_REPLAY.md](FAULTS_TIMELINE_REPLAY.md).

## Instructor mode and limitations

Instructor mode exposes a scenario reset and an expected-versus-observed command comparison. It is a local UI boundary only: this application has no user identity provider yet, so it must not be treated as access control. When identity support is introduced, the reset command must be authorized server-side.

The reports evaluate simulated, educational traces. They neither validate real industrial competence nor certify safe operation. High-frequency telemetry, LMS integrations, and long-term learner records remain out of scope.
