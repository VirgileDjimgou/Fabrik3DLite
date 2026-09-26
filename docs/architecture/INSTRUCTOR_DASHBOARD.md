# Instructor and class dashboard (S45)

Status: **implemented**. The dashboard is a dedicated, role-gated surface in the HMI that composes the
server-side training APIs from S44 plus a small set of authorized, audited instructor actions. It is a
teaching aid over **simulated** training evidence and is **not** a professional certification,
qualification or industrial-readiness statement.

The operator HMI is unchanged. Operators and instructors use separate surfaces; the dashboard lives at
the `/instructor` route and requires the `Instructor` (or `Administrator`) role, enforced server-side.

## Surface and workflows

The HMI view `InstructorDashboardView.vue` composes:

| Panel | Component | Purpose |
|---|---|---|
| Class selection | `InstructorClassSelector` | Pick a class/cohort, see its learner and instructor counts |
| Filters | inline | Scenario and date-range filters applied to both the session list and the aggregates |
| Aggregate metrics | `InstructorMetricsPanel` | Server-computed teaching metrics, ranked tables and the educational note |
| Session list | `InstructorSessionList` | Running/completed/failed sessions with status, elapsed time and score |
| Session review | `InstructorSessionReview` | Expected-vs-observed comparison, timeline, typed evidence, score evidence and restart |
| Assignments | `InstructorAssignmentPanel` | Assign/unassign a scenario (or cell/template file) to the selected class |

A session is selected automatically when the current selection is no longer in the filtered list, so the
review panel is never left empty when evidence exists. Selecting a session loads its typed actions and
the server assessment; the client renders the server result and never re-computes a score.

Every panel has explicit **loading**, **empty**, **error** and (at the view level) **offline** states.
The offline state is shown when the orchestrator cannot be reached; stale or fabricated numbers are
never displayed.

## Roles and tenancy

- Reading aggregates and restarting a session require the `Fabrik3D.Instruct` policy
  (`Instructor` or `Administrator`); the server rejects other roles with `403`.
- Session reads use the S44 `Read` policy plus the learner-ownership/instructor rules: a learner can
  only ever read their own sessions; hidden UI is not a control.
- Every repository query applies the ambient organization through `TenantQuery`. Aggregates and the
  session/evidence fetch are tenant-scoped server-side; there is no client-side cross-tenant filtering.
- The HMI route guard is a usability separation only. It is not an access-control boundary.

## Metrics definitions (version 1.0)

`Fabrik3D.Domain.Training.TrainingMetricsCalculator` is a pure function of the tenant-scoped sessions
and their typed evidence. It uses no wall clock, locale, random source or UI state, so identical evidence
always produces identical numbers. `DefinitionsVersion` is bumped when a definition below changes, and
`ScoringRuleVersion`/`AssessmentSchemaVersion` are reported with the result.

| Metric | Definition |
|---|---|
| `sessionCount` | Sessions in the window after the class/scenario/date filters |
| `completedCount` / `failedCount` / `runningCount` / `terminalCount` | Session status counts (`terminal = completed + failed + abandoned`) |
| `completionRate` | `completed / terminal`, rounded to 4 decimals; `0` when there is no terminal session |
| `meanSessionSeconds` | Mean wall-clock duration of sessions that have ended |
| `meanDiagnosisSeconds` | Mean duration of sessions where at least one fault was observed (working through a fault) |
| `totalActions` / `incorrectActionCount` | Observed actions and those marked incorrect |
| `hintCount` / `sessionsWithHints` / `meanHintsPerSession` | Hint evidence, the sessions that used hints and the mean per session |
| `faultCount` / `recoveryActionCount` / `safetyViolationCount` / `sessionsWithSafetyViolations` | Typed fault, recovery and safety-violation evidence |
| `commonIncorrectActions` | Top 5 incorrect action types by count, ties broken by ordinal key |
| `repeatedFaultTypes` | Top 5 fault types by count, ties broken by ordinal key |
| `safetyMistakeRules` | Top 5 violated safety rule ids by count, ties broken by ordinal key |
| `truncated` | True when the bounded query hit `Training:MaxMetricsSessions`; narrow the filters for exact totals |

Metrics are computed **on demand** from stored evidence; nothing is persisted, so there is no staleness
beyond the query window. `educationalNote` carries the disclaimer in every response.

### Aggregation query shape and bounds

The metrics query reuses the existing session indexes and is bounded by
`Training:MaxMetricsSessions` (default 500). It fetches the in-window sessions and then their typed
actions with a tenant-scoped `session_id IN (...)` query. The response reports `truncated` rather than
silently dropping data.

Recorded latency (S45 evidence, local workstation, MongoDB 7 on `localhost:27017`, 100 completed
sessions × 5 typed actions, `classId` + `scenarioId` filter, 20 sequential `GET /api/training/metrics`
requests): min 153.5 ms, mean 219.2 ms, p95 344.8 ms, max 471.4 ms. These are representative local
numbers with the documented dataset, not a hardware-independent guarantee; the query remains bounded by
`MaxMetricsSessions` regardless of the collection size.

## Restart semantics and audit

`POST /api/training/sessions/{id}/restart` is **non-destructive**: the original session and all of its
evidence are preserved. The server creates a new running session for the same learner, class and
scenario (with the same expected actions) and audits both sides:

- the new session gets a `restarted-from` audit entry naming the source;
- the source gets a `restarted` audit entry naming the new session and the optional reason, stamped with
  the authenticated subject.

Restarting a running session is refused with `409 training_session_running`, and missing/foreign
sessions return `404`. In the UI the action identifies its target (learner and scenario) in a
confirmation dialog, reports pending/success/failure, and never leaves the operator surface modified.

## Configuration

```jsonc
"Training": {
  "Enabled": true,
  "ServerAssessmentEnabled": true,
  "MaxBatchSize": 500,
  "MaxActionsPerSession": 5000,
  "MaxPageSize": 200,
  "MaxMetricsSessions": 500   // S45 aggregate query bound
}
```

Disabling `Training:Enabled` returns `400` for the training endpoints; the dashboard then shows its
error/offline state rather than invented data.

## Accessibility and localization

- The dashboard uses the industrial design system (neutral surfaces, semantic status colour, Bootstrap
  icons with text) and reflows to a single column on narrow screens.
- Session rows are keyboard reachable (`tabindex`, Enter/Space activate) and the restart action is a
  labelled button behind a confirmation dialog naming the target.
- Empty/loading/error states use `HmiEmptyState`/`HmiErrorState` with `role="status"`/`role="alert"`.
- English, French and German dictionaries are kept key-complete by the i18n completeness test.

Recorded accessibility notes for the initial implementation: no automated axe-style violations were
scanned, but keyboard reachability, labelled controls, `role` semantics, focus-visible outlines from the
shared design tokens and label lengths are covered by component tests and manual review. A formal
WCAG 2.2 AA audit remains a hardening item (S49).

## Limitations and non-goals

- No generic LMS: no courses, transcripts, grading workflows or SCORM.
- No student-facing social features.
- No operator HMI changes; the dashboard is a separate route.
- Assessment logic is never re-implemented in the client; the dashboard renders server results.
- The aggregates are teaching aids and must not be presented as certification or industrial readiness.
- If a real 3D replay is embedded it reuses the S41 read-only replay; the initial dashboard renders the
  typed timeline and evidence rather than embedding the 3D view.
