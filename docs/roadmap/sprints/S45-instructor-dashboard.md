# S45 - Instructor and class dashboard

## Outcome

A clean instructor workflow: select a class, assign/select training scenarios, inspect running sessions, review completed sessions with timeline and learner actions, compare expected vs observed behavior, review hints, fault recovery, and score evidence, reset/restart appropriate simulated training sessions, and consult aggregate metrics. The dashboard is a dedicated surface and does not clutter the operator HMI.

## Motivation

S44 persists training sessions and assessments; instructors need an efficient workspace. Aggregates turn individual sessions into teaching insight.

## Current-state assumptions to verify

- S42/S43 provide identity, roles, organizations, classes, memberships; S44 provides sessions/actions/assessments.
- The HMI is a separate Vue app with role-aware routing (S42) and an industrial design system (S15).
- `src/learning` local comparison/reset tooling exists in the simulator (S14).
- Time travel (S41) and historian (S40) can provide timeline reconstruction and evidence.

## Scope

- Instructor surface (dedicated route in the appropriate frontend, role-gated):
  - class selection and class detail (learners, assignments);
  - scenario/assignment management for a class (assign, unassign, schedule where justified);
  - running-session monitor (live status, current activity, elapsed time, alerts);
  - completed-session review: expected vs observed actions, timeline, hint usage, faults, safety violations, recovery actions, score evidence, and reconstruction via time travel;
  - reset/restart of simulated training sessions with explicit target confirmation and audit;
  - aggregate metrics: completion rate, mean diagnosis time, common incorrect actions, hint usage, repeated fault types, safety-related mistakes, with filters (class, scenario, date range).
- API/contract additions needed by the dashboard; tenant/role enforcement server-side.
- Clear empty/loading/error/offline states for every panel.
- EN/FR/DE; accessible semantics; keyboard navigation; responsive at desktop and laptop resolutions.
- Explicit statement that scores are educational and not professional certification.

## Non-goals

- No generic LMS (courses, transcripts, grading workflows, SCORM).
- No student-facing social features.
- No operator HMI changes.
- No re-implementation of assessment logic in the client; the dashboard renders server results.

## Architecture boundaries

- Dashboard is a read/compose surface over S44 APIs plus targeted admin actions (assignments, restart) that are authorized and audited.
- Aggregation queries are server-side and tenant-scoped; no client-side aggregation over cross-tenant data.
- Timeline/time-travel visualization reuses S41; no duplicate reconstruction logic.

## Domain and data model changes

- Assignment/scheduling fields as needed on class/scenario entities (additive, versioned).
- Metrics may be computed on demand or persisted; if persisted, version and index them and document staleness.

## Backend changes

- Endpoints for class assignments, session listing/detail, metrics queries, and restart with policies, validation, audit, and indexes.
- Contracts + generated TS.

## Simulator changes

None required; the simulator continues reporting sessions. A live instructor assignment may be reflected as the default scenario where appropriate.

## HMI and UX changes

- Dashboard uses the industrial design system: restrained palette, semantic status color, clear hierarchy, no giant floating panels.
- Critical actions (restart/reset) identify the learner/session target and show pending/success/failure.
- No operator workflow changes; navigation separation between operator and instructor surfaces.

## 3D and visual requirements

- If the review embeds a 3D replay view, it reuses the S41 read-only replay and must not issue commands.
- Visual regression coverage of dashboard screens at desktop/laptop.

## Protocol and security requirements

- Instructor actions require Instructor role within the correct organization/class; server-side.
- Learners cannot access other learners' data.
- Restart/reset actions are audited with subject and target.
- No secrets or personal data leakage in aggregates/export.

## Backward compatibility

- Operator HMI and simulator workflows unchanged.
- Public demo: instructor features require authentication; the shared demo may expose a clearly labelled read-only instructor demo only if documented.

## Migration requirements

- Additive assignment fields with defaults; metrics computed from existing sessions where possible without corrupting historical data.

## Failure and degraded-mode behavior

- Empty class/session lists show explanatory empty states.
- Metrics failure does not break session review.
- Offline/unavailable server shows an explicit error/offline state, not stale fabricated numbers.
- Restart of a non-restartable or already-completed session is refused with a clear reason.

## Testing strategy

- Component tests: class selector, session list/detail, expected-vs-observed comparison, metrics cards/tables, empty/loading/error states, restart confirmation, EN/FR/DE completeness.
- Integration tests: assignment endpoints, session queries, metrics correctness on seeded data, authorization matrix, tenant isolation.
- E2E: instructor assigns scenario → learner session → completed review → metrics update → restart flow.
- Visual regression at desktop/laptop.
- Accessibility checks (keyboard, focus, labels, contrast) aiming toward WCAG 2.2 AA.

## Performance requirements

- Session lists and metrics queries bounded with indexes; record representative latencies.
- Dashboard does not degrade operator HMI or simulator performance.

## Security considerations

- Role/tenant enforcement server-side for every endpoint.
- Export/report data minimized; no cross-tenant data.
- Restart/reset actions require confirmation and audit.

## Documentation changes

- New `docs/architecture/INSTRUCTOR_DASHBOARD.md` (workflows, roles, metrics definitions, limitations, educational scope).
- Update `TRAINING_SESSIONS.md`, `HMI_DESIGN_SYSTEM.md`, `README.md`; add screenshots.
- Note explicitly that metrics are teaching aids, not certification.

## Acceptance criteria

1. Instructor can select a class, assign scenarios, monitor running sessions, review completed sessions with expected vs observed actions, timeline, hints, faults, recovery, and score evidence, restart simulated sessions, and view aggregates, all with server-side authorization.
2. Every panel has usable empty/loading/error/offline states.
3. Metrics definitions are documented and computed server-side with tenant-scoped queries.
4. Restart/reset actions identify their target, confirm, report pending/success/failure, and are audited.
5. Operator HMI is unchanged; dashboard is a separate role-gated route.
6. EN/FR/DE complete; responsive at desktop/laptop; accessibility checks recorded.
7. All builds/tests/E2E/visual/contracts gates pass.

## Evidence expected for completion

```text
frontend type-check/test/build (N passed, including dashboard components)
E2E instructor workflow evidence
metrics query latency measurements
authorization/tenant isolation tests (dotnet)
visual regression results
npm run contracts:check (pass)
accessibility notes (keyboard/focus/contrast)
```

## Rollback and failure containment

Dashboard is additive and role-gated; removing routes and endpoints restores S44 state. If metrics cannot be made correct and tenant-safe, ship session review without aggregates and document the deferral.

## Follow-up items that must not leak into this sprint

- Interoperability showcases (S46/S47), packaging (S48), hardening/RC (S49), 1.0 baseline (S50).
