# S43 - Organizations, tenancy and classroom boundaries

## Outcome

The server models organizations, memberships, classes/cohorts, instructor assignments, learner assignments, and training resources with enforced tenant boundaries. Every tenant-scoped query checks the boundary server-side. Cross-organization access is rejected and proven by integration tests. The first implementation stays simple enough for single-organization on-premise deployment.

## Motivation

Schools, training centers, companies, and labs must not see each other's learners, sessions, scenarios, or jobs. S42 provides identities; S43 gives them boundaries.

## Current-state assumptions to verify

- S42 merged: authenticated principals with stable `sub` and roles.
- Existing entities (jobs, tasks, sessions, alarms, messages, templates, historian, authority) have no tenant/owner scope.
- No index strategy for tenant-scoped queries exists.
- The HMI and simulator have no organization context; the public demo runs as a single shared environment.
- MongoDB is the persistence layer; optimistic concurrency patterns exist.

## Scope

- Domain model:
  - `Organization` (id, name, slug, settings, created/updated);
  - `Membership` (organizationId, subject, role, status);
  - `Class`/`Cohort` (organizationId, name, instructor subjects, learner subjects, schedule metadata as needed);
  - `TrainingResource` assignment (scenario/template/cell file assigned to a class/organization);
  - tenant scope on jobs, sessions, templates, historian records, and training sessions.
- Server enforcement:
  - request context resolves the active organization from the authenticated principal (membership), never from a client-supplied arbitrary value;
  - every repository query for tenant-scoped data filters by organization server-side;
  - cross-tenant identifiers return 404/403 without leaking existence;
  - administrators may be scoped per organization; a platform-admin role is documented and optional;
  - indexes for tenant-scoped query patterns.
- Data migration: existing data is assigned to a default organization deterministically; compatibility readers keep old documents working; migration is idempotent and tested.
- Frontends: organization/class context selection where applicable; the operator HMI and simulator show the active organization clearly; no client-side filtering as a security control.
- Single-organization on-prem mode: no friction, no fake multi-tenant UI, documented default organization.
- Public demo: explicitly labelled single shared organization; cross-tenant tests use test organizations, not the public demo.

## Non-goals

- No per-tenant physical database separation or sharding.
- No billing/entitlements.
- No LMS feature parity; classes are boundaries, not a full academic system.
- No instructor dashboard (S45) or server training assessment (S44); provide only the model and enforcement needed by them.

## Architecture boundaries

- Tenancy is enforced in server repositories/services, not middleware alone (middleware provides context; repositories enforce scope).
- Domain entities carry organizationId as an explicit field.
- Frontends treat organization context as display/selection only.
- Cross-cutting queries must use tenant-scoped helpers to make omission hard to code by accident.

## Domain and data model changes

- New entities, membership indexes, organizationId on tenant-scoped entities, and schema versions.
- Additive fields with defaults for existing documents.

## Backend changes

- Organization/membership/class services and endpoints (create/read/update membership, class assignment) with policies.
- Tenant scoping in repositories and services, tenant-aware query extensions, index creation, migration routine, seed/default organization.
- Contracts + generated TS.
- Audit enrichment with organization id.

## Simulator changes

- Pass organization context when claiming jobs/sessions; display active organization in engineering/operator status where appropriate.
- Do not break offline/local mode (no organization required).

## HMI and UX changes

- Active organization/class display; selection where the user belongs to several; clear unauthorized/cross-tenant feedback.
- EN/FR/DE; accessible; no operator clutter beyond context display.

## 3D and visual requirements

Not applicable.

## Protocol and security requirements

- Organization/tenant is never trusted from the client without server-side membership validation.
- All write policies and roles remain enforced on top of tenancy.
- Historian queries are tenant-scoped.
- No secret or personal data leakage across tenants; audit records scoped.

## Backward compatibility

- Existing single-organization deployments work unchanged via the default organization.
- Existing APIs work with organization resolved from the principal; explicit organization parameters, if added, must be validated against membership.
- Public demo remains a shared single organization with a clear notice.

## Migration requirements

- Deterministic assignment of existing data to the default organization.
- Idempotent migration + compatibility readers; migration tested on representative existing data.
- Rollback path documented (organizationId defaults).

## Failure and degraded-mode behavior

- Missing membership: deny tenant-scoped access with a clear error; anonymous/public-demo role maps to the shared organization explicitly.
- Ambiguous organization context: fail closed and require explicit selection.
- Partial migration: reads treat missing organizationId as the default organization with a diagnostic; writes backfill.

## Testing strategy

- Unit tests: membership resolution, class assignment rules, scope builders.
- Integration tests (Testcontainers): cross-organization access rejected for every tenant-scoped endpoint class (jobs, sessions, tasks, templates, historian, training); 404/403 semantics; queries filtered; indexes present; migration idempotence.
- Negative tests: forged organization header/id, membership revoked mid-session, learner accessing another class.
- E2E: two organizations with isolated data; instructor/learner boundary behavior.

## Performance requirements

- Tenant-scoped queries remain within the documented latency budget with indexes; record representative measurements.
- No per-request full-collection scans; index coverage verified.

## Security considerations

- Client-side filtering is never sufficient; server enforcement is mandatory and tested.
- Object-id enumeration must not leak cross-tenant existence.
- Audit logs include organization and subject.

## Documentation changes

- New `docs/architecture/ORGANIZATIONS_AND_TENANCY.md` (model, enforcement rules, single-org default, migration, public demo notice).
- Update `IDENTITY_AND_RBAC.md`, `ORCHESTRATION.md`, `README.md`, and privacy documentation.
- ADR for the tenancy boundary.

## Acceptance criteria

1. Organizations, memberships, classes, instructor/learner assignments, and resource assignments are modeled and persisted.
2. Every tenant-scoped server query enforces the boundary; integration tests prove cross-organization rejection for jobs, sessions, tasks, templates, historian, and training resources.
3. Existing data migrates deterministically to the default organization; migration is idempotent and tested.
4. Single-organization on-prem and the public demo work unchanged with clear labelling.
5. Client-supplied organization identifiers are validated against membership; forged values are rejected.
6. All builds/tests/E2E/contracts gates pass.

## Evidence expected for completion

```text
dotnet build/test (N passed, listing tenancy isolation + migration tests)
E2E two-organization isolation evidence
frontend gates (pass)
npm run contracts:check (pass)
index listing and query latency measurements
```

## Rollback and failure containment

Tenancy is additive; single-organization mode ignores scoping complexity. If isolation tests fail, do not complete the sprint. Rollback removes tenant filters only in the default-organization configuration under an explicit flag, never silently relaxing enforcement for multi-org data.

## Follow-up items that must not leak into this sprint

- Server-side training sessions/assessment (S44), instructor dashboard (S45).
- Security hardening review (S49).
