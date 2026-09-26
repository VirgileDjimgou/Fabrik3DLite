# Learning assessment and reports

S14 assesses the simulator from its ordered, simulated event timeline. S44 adds a server-side
training-session record and an authoritative deterministic assessment, while the local/offline
report remains available.

## Local data and privacy

Learners may enter a local session alias. The value is sanitized to a short pseudonym; no name, email
address, account, or external identifier is required for local use. Local reports are generated in
the browser as JSON or HTML downloads and carry `assessmentAuthority: "local"` plus the
educational-scope disclaimer.

## Local scoring (S14)

The default local assessment is transparent and configurable in `src/learning/assessment.ts`:

- 40 points: a `complete` workflow transition is recorded;
- 40 points: each timeline alarm has a recorded retry recovery action;
- 20 points: every recorded guided checkpoint has a deliberate `step-next` attempt.

Each report includes the observed evidence for every criterion, so a learner can see why it passed
or did not pass. A no-fault run receives the recovery criterion because no recovery was required.

S38 overlay faults are recorded on the same timeline: an activation is an `alarm` entry and a clear is
a `fault-action`. The existing recovery criterion therefore also counts an instructor-injected overlay
that was observed and cleared, while replay reconstructs active overlay state read-only. See
[FAULTS_TIMELINE_REPLAY.md](FAULTS_TIMELINE_REPLAY.md).

## Server-side authority (S44)

When the server is reachable, a run can be persisted as a `TrainingSession` with typed evidence and
assessed by the deterministic server-side engine. The server score is authoritative; the local score
is never trusted as the authoritative value. A run is shown as `LOCAL (OFFLINE)` until it is synced
and `SERVER-ASSESSED` afterwards, and a failed sync is explicit and retryable while the local report
is kept. The model, scoring rules and API are documented in
[TRAINING_SESSIONS.md](TRAINING_SESSIONS.md); the design decision is recorded in
[ADR 0005](../adr/0005-server-side-assessment-authority.md).

## Instructor mode and limitations

Instructor mode exposes a scenario reset and an expected-versus-observed command comparison. S42/S43
introduced a real server identity boundary and tenancy, so server-side training endpoints are
authorized by policy (`Train` for evidence reporting, `Instruct` for audited assessment
corrections), and the local UI boundary is no longer the only control. See
[IDENTITY_AND_RBAC.md](IDENTITY_AND_RBAC.md).

The reports evaluate simulated, educational traces. They neither validate real industrial competence
nor certify safe operation: every local and server report states this educational scope. High-frequency
telemetry, LMS integrations, courses/grades/transcripts, proctoring and long-term cross-tenant
analytics remain out of scope.
