# Server-side training sessions and assessment

S44 moves training-session authority beyond browser-local reports. A simulator run can be persisted
server-side with typed evidence, and the authoritative score is computed by a deterministic,
versioned server-side engine. Local/offline training keeps working; server assessment is additive.

Status: **implemented and server-enforced**. The assessment is an educational record and does
**not** certify professional competence, safety qualification or industrial readiness.

## Model

Collections (MongoDB), all versioned with `TrainingSchema.Version`:

| Document | Collection | Purpose |
|---|---|---|
| `TrainingSession` | `trainingSessions` | Learner, organization/class, scenario id + version, simulator/session refs, start/end, status, completion, expected actions, counts, score, assessment, schema/software/scoring versions, audit |
| `TrainingActionRecord` | `trainingActions` | Typed expected/observed actions and events with correctness, severity and typed fault/hint/violation/recovery payloads |

Typed sub-records: `HintUsage`, `SafetyViolation`, `RecoveryAction`. They are typed fields on the
action, never free-text blobs. The assessment output is `TrainingAssessmentRecord`
(`TrainingCriterionResult` per criterion) and is stored inside the session document.

`SimulationSession` is unchanged; `TrainingSession.SimulationSessionId` is an optional additive
reference. No existing document is migrated destructively.

## Deterministic assessment

`Fabrik3D.Domain.Training.TrainingAssessmentEngine` is a pure function of recorded evidence:

- input: the session metadata + recorded actions;
- output: `TrainingAssessmentResult` with per-criterion explanations, evidence references and the
  score.

The engine uses no wall clock, locale, random source or UI state. Identical evidence and the same
scoring-rule version always produce an identical result. The engine stamps no timestamp; the service
supplies the clock when it maps the result to the persisted record.

Scoring rules are registered in `TrainingScoringRegistry` and selected deterministically from the
scenario id (`safety-door-recovery` uses the safety-emphasis scheme, everything else the default
scheme). The default scheme (100 points) is:

| Criterion | Points | Passes when |
|---|---|---|
| `completion` | 40 | the simulator reported the scenario completed |
| `expected-actions` | 25 | every declared expected action was observed (or none were declared) |
| `fault-recovery` | 15 | every simulated fault has a successful recovery action |
| `safety-compliance` | 10 | no safety violation was recorded |
| `hint-discipline` | 10 | hints used ≤ the tolerated maximum (3) |

The safety-emphasis scheme redistributes points (completion 30, expected 20, recovery 15, safety 25,
hint 10) for scenarios whose learning objective is safe recovery.

### Versioning and integrity

- Rule changes must bump `TrainingSchema.ScoringRuleVersion`; the version is stored on every session
  and assessment so scores remain interpretable and comparable.
- The computed score and criteria are immutable. Corrections created by an instructor append a
  `TrainingCorrectionEntry`, increment `AssessmentVersion`, update only the effective score and add a
  session audit entry. The computed score is never overwritten silently.
- When server assessment is disabled, or the engine fails, the session is stored with
  `AssessmentStatus = Pending`/`Failed` and a diagnostic. No score is fabricated.

## API

`/api/training/sessions` (all responses are contract-generated):

| Method | Route | Policy | Description |
|---|---|---|---|
| `POST` | `/api/training/sessions` | `Train` | Start a session owned by the caller |
| `POST` | `/api/training/sessions/{id}/actions` | `Train` | Report a bounded, idempotent batch of actions |
| `POST` | `/api/training/sessions/{id}/complete` | `Train` | Complete/fail the session and return the assessment |
| `GET` | `/api/training/sessions` | `Read` | Enumerate/filter by class, learner, scenario, status, date |
| `GET` | `/api/training/sessions/{id}` | `Read` | Fetch one session |
| `GET` | `/api/training/sessions/{id}/actions` | `Read` | Fetch the typed evidence |
| `GET` | `/api/training/sessions/{id}/assessment` | `Read` | Fetch the assessment (204 when pending) |
| `GET` | `/api/training/sessions/{id}/report` | `Read` | Export the server report with its disclaimer |
| `POST` | `/api/training/sessions/{id}/assessment/corrections` | `Instruct` | Append an audited correction |
| `POST` | `/api/training/sessions/import` | `Train` | Best-effort import of a local report JSON |
| `POST` | `/api/training/sessions/{id}/restart` | `Instruct` | Audited, non-destructive restart as a new running attempt (S45) |
| `GET` | `/api/training/metrics` | `Instruct` | Tenant-scoped instructor aggregates over a class/scenario/date window (S45) |

The S45 instructor metrics and restart endpoints are documented in
[`INSTRUCTOR_DASHBOARD.md`](INSTRUCTOR_DASHBOARD.md). Restart preserves the original session and its
evidence; metrics are computed on demand and never persisted.

A representative server report — including the educational-scope disclaimer and the per-criterion
evidence — is committed at
[`docs/architecture/samples/training-session-report.sample.json`](samples/training-session-report.sample.json);
a test deserializes it into the contract so the artifact cannot silently drift.

## Ingestion, idempotency and bounds

- Actions carry a client-generated `ActionId`, unique per session. The unique index
  `(organization, session, actionId)` makes ingestion idempotent: a reconnecting simulator can retry
  a batch and already-stored actions are skipped, never duplicated.
- A batch is bounded by `Training:MaxBatchSize` (default 500) and a session is bounded by
  `Training:MaxActionsPerSession` (default 5000). Excess is rejected with `400`.
- The learner subject is always bound from the authenticated token; the client cannot forge it and
  cannot inject a score.

## Offline / sync behaviour

- The simulator always produces its local JSON/HTML report. The local report now carries
  `assessmentAuthority: "local"` and an educational-scope disclaimer.
- When the server is reachable, the learner can sync the run; the panel then labels the report
  `SERVER-ASSESSED` and shows the server score. A failed sync is explicit, retryable, and never
  discards the local report.
- The local report's score is never sent as the authoritative value; the server recomputes the score
  from the reported evidence (including the best-effort local-report import).

## Tenancy, authorization and privacy

- Every repository read/write is tenant-scoped through `TenantQuery`; cross-organization access
  returns `404` without leaking existence.
- Only the owning learner may report evidence for a session; instructors/administrators may read
  within their organization and append corrections. A learner can only enumerate their own sessions
  (the filter is forced server-side).
- `PublicDemo` is read-only and cannot start, report or complete sessions.
- Reports contain no secrets, no tokens and no other learners' data across tenants.
- Personal data is limited to the authenticated subject, an optional sanitized pseudonymous alias and
  the recorded evidence. Retention aligns with the historian policy: the deployment retains training
  documents for as long as its MongoDB retention/backup policy defines.

## Migration

- Indexes are created idempotently at startup by `TenantIndexInitializer`
  (`organization_class_learner`, `organization_scenario_started`, `organization_status_started`,
  `session_action_unique`, `session_sequence`).
- `TenantMigrationService` backfills `OrganizationId` on `trainingSessions`/`trainingActions` for
  legacy documents (idempotent).
- `POST /api/training/sessions/import` is a best-effort, documented mapping of an existing local
  report JSON; the local score is ignored.

## Configuration

```jsonc
"Training": {
  "Enabled": true,                 // false restores S43 local-only behavior
  "ServerAssessmentEnabled": true, // false stores sessions pending, never fabricates a score
  "MaxBatchSize": 500,
  "MaxActionsPerSession": 5000,
  "MaxPageSize": 200
}
```

## Performance

Batch ingestion and assessment are bounded operations. The mandatory gates record the suite
durations; no query-latency micro-benchmark is claimed. Indexes exist so the documented query shapes
do not fall back to collection scans.

## Explicit non-goals

No certification, proctoring, biometrics or anti-cheat. The instructor/class dashboard itself is
documented separately in [`INSTRUCTOR_DASHBOARD.md`](INSTRUCTOR_DASHBOARD.md); interoperability
showcases (S46/S47), packaging (S48) and hardening (S49) remain out of scope.
