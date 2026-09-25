# S44 - Server-side training sessions and assessment

## Outcome

Training-session authority moves beyond browser-local reports: learner, organization/class, scenario, start/end, expected actions, observed actions, faults, hints, incorrect actions, safety violations, recovery actions, completion, assessment evidence, score, and software/schema versions are persisted server-side with deterministic, testable assessment. Local/offline training remains available where practical. Reports state their educational scope and never claim professional certification.

## Motivation

Instructors need durable, comparable evidence; S14/S29 built rich local reports and S40 the historian. Persisting sessions and assessing them server-side is the foundation for the instructor dashboard (S45) and commercial training.

## Current-state assumptions to verify

- `src/learning` implements trace-derived assessment with local aliases, instructor comparison/reset, and JSON/HTML reports (S14).
- `src/scenarios` has a deterministic runner with activities, expected events, success criteria, instructor notes (S11/S29).
- `src/faults` records fault actions; `src/timeline` records ordered events; S38 adds signal faults; S41 adds time travel.
- S40 historian persists telemetry/events; S42/S43 add identity and tenancy.
- Simulation sessions currently persist scenario id/activity/progress on `SimulationSession`.

## Scope

- Define versioned server models:
  - `TrainingSession` (organization, class, learner subject, scenario id/version, simulator/session refs, start/end, status, completion, score, assessment schema/software versions);
  - `TrainingAction`/`TrainingEvent` (expected vs observed, kind, target, timestamp, correctness, severity, fault/hint/recovery flags);
  - `TrainingAssessment` (deterministic evaluation output with evidence references and explanations);
  - `HintUsage`, `SafetyViolation`, `RecoveryAction` as typed records (not free text blobs).
- Assessment engine:
  - deterministic, pure evaluation from recorded actions/events + scenario expectations;
  - explicit scoring rules per scenario, documented, versioned, and testable;
  - reproducible results for identical inputs; no wall-clock or locale dependence.
- Ingestion from the simulator:
  - start/join session, report expected/observed actions and events in bounded batches;
  - local/offline mode continues to produce local reports and can sync later if configured, or explicitly remain local;
  - reconnect-safe idempotency by correlation id.
- Reports:
  - server-stored assessment with educational-scope disclaimer text;
  - API to fetch session, actions, evidence, and assessment; contracts regenerated;
  - export compatible with the existing local JSON/HTML report shapes where practical.
- Enumeration and filtering by organization/class/learner/scenario/date with tenant enforcement.
- Integrity: assessment cannot be silently mutated; corrections produce new versions or audit entries.

## Non-goals

- No claim that a score certifies professional competence; every report states educational scope.
- No proctoring, biometrics, or anti-cheat infrastructure.
- No instructor dashboard UI (S45) beyond API and minimal necessary surfaces.
- No full LMS features (courses, grades, transcripts).

## Architecture boundaries

- Assessment logic is deterministic server-side code driven by recorded evidence; it must not depend on UI.
- The simulator reports evidence; it does not compute the authoritative server score (local score may remain for offline use and must be labelled local).
- Historian/time-travel evidence can be referenced but not required for scoring.
- Tenancy/identity enforcement from S42/S43 applies to all training data.

## Domain and data model changes

- New versioned entities/collections with indexes (organization+class+learner, scenario+date, session status).
- Additive references from `SimulationSession` if needed.

## Backend changes

- Training services/controllers, assessment engine, scoring rules registry, ingestion and query endpoints, export, audit, contracts, DI, indexes, migration.

## Simulator changes

- Report training session lifecycle and evidence; keep local report generation working offline; display whether the current run is local-only or server-assessed.

## HMI and UX changes

- Operator HMI unchanged.
- Learner-facing result surfaces (where they exist or are added) clearly label local vs server assessment and show the educational disclaimer.

## 3D and visual requirements

Not applicable.

## Protocol and security requirements

- Only the owning learner/simulator may report actions for a session; instructors may read within their organization.
- Server-side validation of every reported action; client cannot inject arbitrary score.
- Idempotent, bounded batch ingestion; rate limits.
- Reports contain no secrets and no other learners' data across tenants.

## Backward compatibility

- Existing local reports and assessment continue to work; server assessment is additive.
- Existing simulation-session fields remain.
- Public demo either disables server training persistence explicitly or uses the shared demo organization with a clear notice.

## Migration requirements

- Versioned documents with compatibility readers; idempotent index/migration; deterministic import of existing local report JSON if feasible (best effort, documented).

## Failure and degraded-mode behavior

- Server unavailable: local report still produced; sync failure is explicit and retryable.
- Partial batch: idempotent retry; no duplicate actions.
- Assessment unavailable: session stored with pending assessment status and diagnostic; no fabricated score.

## Testing strategy

- Deterministic assessment unit tests with fixed evidence fixtures (perfect, partial, failed, safety violation, hint-heavy, incorrect-then-recovered).
- Scoring version tests: same evidence + same rule version = same score; rule version changes documented.
- Integration tests: ingestion idempotency, tenant filtering, instructor/learner authorization, report retrieval, migration.
- Negative tests: forged learner identity, cross-class reporting, oversized batch, action for another session.
- E2E: scenario run → server session → assessment → report fetch.

## Performance requirements

- Batch ingestion and assessment complete within documented bounds for a representative scenario; record measurements.
- Query latency bounded with indexes.

## Security considerations

- Server-side authorization for every training endpoint (S42/S43 policies).
- No client-trusted scores; evidence validated.
- Personal data handling documented; retention aligns with historian policy.

## Documentation changes

- New `docs/architecture/TRAINING_SESSIONS.md` (model, deterministic assessment, scoring versioning, offline/sync behavior, educational-scope statement).
- Update `LEARNING_ASSESSMENT_REPORTS.md`, `IDENTITY_AND_RBAC.md`, `ORGANIZATIONS_AND_TENANCY.md`, `README.md`.
- ADR for assessment authority.

## Acceptance criteria

1. Training sessions and typed actions/events persist with learner, organization/class, scenario, timestamps, faults, hints, violations, recoveries, completion, evidence, score, and versions.
2. Assessment is deterministic and testable; identical evidence and rule version produce identical results, covered by fixtures.
3. Reports state educational scope and never claim certification.
4. Local/offline training still works; server sync failure is explicit and retryable; ingestion is idempotent.
5. Cross-tenant and cross-learner access is rejected server-side; tests prove it.
6. All builds/tests/E2E/contracts gates pass.

## Evidence expected for completion

```text
dotnet build/test (N passed, listing assessment determinism + ingestion + tenancy tests)
E2E scenario → server session → assessment → report
frontend gates (pass)
npm run contracts:check (pass)
sample report artifact with educational disclaimer
```

## Rollback and failure containment

Training persistence and assessment are additive and feature-gated; disabling them restores S43 local-only behavior. Never complete the sprint with a nondeterministic assessment or a client-trusted score.

## Follow-up items that must not leak into this sprint

- Instructor/class dashboard UI and aggregate metrics (S45).
- Interoperability showcases (S46/S47), packaging (S48), hardening (S49).
