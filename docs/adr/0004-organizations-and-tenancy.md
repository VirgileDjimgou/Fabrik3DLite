# ADR 0004 — Organizations, tenancy and classroom boundaries

- Status: accepted (S43)
- Context sprint: S43 — Organizations, tenancy and classroom boundaries
- Related: [ADR 0003](./0003-identity-and-rbac.md), [ORGANIZATIONS_AND_TENANCY.md](../architecture/ORGANIZATIONS_AND_TENANCY.md)

## Context

S42 established authenticated principals with stable subjects and roles, but every entity (jobs,
tasks, sessions, alarms, messages, cell templates, historian records) was global. Schools, training
centers, companies and labs must not see each other's learners, sessions, scenarios or jobs, and the
server must remain usable as a frictionless single-organization on-premise install and as a
clearly-labelled shared public demo. A tenancy model is needed that is additive to S42, enforced
server-side, testable, and simple enough not to require per-tenant infrastructure.

## Decision

1. **Organization is explicit data, not infrastructure.** An `Organization` document (deterministic
   `default` id), `Membership` rows keyed by `(organizationId, subject)`, `TrainingClass`/cohorts and
   `TrainingResourceAssignment`s model the boundary in the existing MongoDB database. No per-tenant
   database, sharding or billing.
2. **Middleware resolves context; repositories enforce it.** `TenantContextMiddleware` resolves the
   active organization from validated claims and active membership only, records it in
   `HttpContext.Items`, and rejects forged or ambiguous selections with structured `403`/`409`
   responses. Every tenant-scoped repository query routes through `TenantQuery.For`, which encodes
   the platform-admin bypass and the default-organization legacy fallback once.
3. **Default organization and legacy compatibility.** `TenantMigrationService` deterministically
   assigns pre-S43 documents to the default organization and is idempotent; readers additionally treat
   a missing organization id as the default organization, so migration is never on the critical read
   path.
4. **Single-organization by default.** `Tenancy:SingleOrganization=true` is the default: no
   membership is required and everything resolves to the default organization. Multi-organization
   enforcement is opt-in and fails closed on missing or ambiguous membership. Tenant resolution can be
   disabled explicitly for dedicated single-tenant tooling.
5. **Classroom model, not an LMS.** Classes carry instructor/learner subject lists and resource
   assignments only; the instructor dashboard (S45) and server assessment (S44) build on this model
   without the sprint implementing them.
6. **Front-ends display context only.** The resolved organization is surfaced through
   `/api/auth/me` and `/api/organizations/context`; no client-side filtering is a security control.

## Consequences

- Cross-organization access is rejected in the repositories and proven by integration and HTTP tests
  for every tenant-scoped entity class.
- Existing single-organization deployments and the public demo keep working unchanged, with the
  default organization documented and labelled.
- Background services remain unscoped by design; they operate on infrastructure, not on a user's
  organization context.
- Tenant indexes are created on startup so enforcement does not degrade query latency.
- Authorities and the FESTO/MQTT/Modbus connectors remain outside the tenant model; they are
  infrastructure adapters, not tenant data.
