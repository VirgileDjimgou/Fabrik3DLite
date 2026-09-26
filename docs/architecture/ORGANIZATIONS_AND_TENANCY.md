# Organizations, tenancy and classroom boundaries

This document describes the Fabrik3D tenancy boundary introduced in S43. It covers the domain
model, how the active organization is resolved, how repositories enforce the boundary, the
deterministic migration of pre-S43 data, the single-organization default, the clearly-labelled
public demo and the classroom/assignment model that S44 and S45 build on.

Status: **implemented** for the server, persistence and audit paths described below. The HMI and
simulator display the resolved organization as context; they never filter data or decide access.

## Model

| Entity | Collection | Purpose |
|---|---|---|
| `Organization` | `organizations` | Tenant boundary: id, name, unique slug, non-secret settings, version. The id is a string so the default organization is deterministic (`default`). |
| `Membership` | `memberships` | `(organizationId, subject)` → role + status (`Active`, `Suspended`, `Revoked`). Unique per pair. |
| `TrainingClass` | `trainingClasses` | A class/cohort inside one organization with instructor and learner subject lists and optional schedule metadata. Classes are boundaries, not a full academic system. |
| `TrainingResourceAssignment` | `trainingResourceAssignments` | A scenario, cell template or template file assigned to an organization and optionally to one of its classes. |

Tenant-scoped documents (jobs, tasks, simulation sessions, alarms, operator messages, cell
templates, telemetry samples, historized events, training sessions and actions, classes, resource
assignments and memberships) carry an explicit `OrganizationId` field. On write the field is
backfilled from the ambient scope, so a document is never stored without a tenant boundary.

Pre-S43 documents have no `OrganizationId`. They are treated as belonging to the **default
organization** by the compatibility readers and are backfilled by the migration (below).

## Enforcement

Tenancy is enforced in **server repositories**, not in middleware alone and never in the
front-ends.

1. **Context resolution** — `TenantContextMiddleware` runs after authentication and before
   authorization. It resolves the active organization once per request:
   - a client may request an organization with the `X-Organization-Id` header, but the value is
     accepted only when an **active membership** exists for the authenticated subject (or for an
     optional platform administrator);
   - a server-issued `org` token claim is validated the same way;
   - in single-organization mode without an explicit request, the default organization is used;
   - in multi-organization mode a missing membership is denied (`403 organization_membership_required`)
     and an ambiguous context fails closed (`409 organization_selection_required`);
   - a revoked membership is rejected immediately, mid-session.
   The result is stored in `HttpContext.Items` and exposed through `ITenantContext`. Background
   services (connectors, heartbeat monitor, reference cell loop) run with a `null` scope and are
   therefore not tenant-filtered, by design.
2. **Repository filters** — `TenantQuery.For` builds the tenant filter for every repository read and
   write. The logic is defined once so a filter cannot be omitted by accident:
   - platform administrator → unfiltered;
   - default organization → `OrganizationId == default` **or** field missing (legacy fallback);
   - any other organization → `OrganizationId == <organization>` only, so legacy and other-tenant
     documents are invisible.
   Cross-organization identifiers therefore resolve to "not found" (HTTP 404) without leaking
   existence; a forged context selection is rejected with a structured 403 before any data is read.
3. **Indexes** — `TenantIndexInitializer` creates the documented tenant-scoped indexes on startup
   (organization+time, organization+parent, organization+subject unique, organization+slug unique,
   organization+class+learner, organization+scenario+date, organization+status+date and the unique
   organization+session+action key) so tenant filters are index-backed and never full-collection
   scans. `HistorianRepository` additionally exposes organization-prefixed historian indexes.

## Default, single-organization and public-demo modes

| Mode | Configuration | Behaviour |
|---|---|---|
| Single organization (default) | `Tenancy:SingleOrganization=true` (default) | No membership required; everything resolves to the deterministic default organization. On-premise installs work unchanged. |
| Multi-organization | `Tenancy:SingleOrganization=false` | Membership resolution is enforced; ambiguous contexts fail closed. |
| Disabled | `Tenancy:Enabled=false` | Tenant resolution is off and repositories are unscoped. Intended only for dedicated single-tenant tools; not a multi-tenant configuration. |
| Public demo | authenticated anonymous/`PublicDemo` identity in single-organization mode | Explicitly the single shared organization. Cross-tenant tests always use dedicated test organizations, never the public demo. |

Platform administration is optional and opt-in via the `platform_admin=true` claim combined with
the `Administrator` role (`Tenancy:PlatformAdminEnabled`, default true). Per-organization
administrators are ordinary `Administrator` memberships; they cannot administer another
organization. All write policies from S42 remain enforced **on top of** tenancy.

The authenticated creator of an organization automatically receives an active `Administrator`
membership in it, so a newly created organization is never orphaned when no platform administrator
is configured. Existing single-organization installs never exercise this path because no organization
is created at runtime.

## Migration and rollback

`TenantMigrationService.MigrateAsync` runs on startup and is exposed to administrators as
`POST /api/organizations/migrate`:

- ensures the deterministic default organization exists;
- assigns every document that has a null, empty or missing `OrganizationId` to the default
  organization;
- never overwrites an existing organization scope;
- is idempotent: a second run reports `AlreadyMigrated=true` and zero migrated documents.

Rollback is additive: remove the tenant filters only in an explicit single-organization
configuration. The boundary is never silently relaxed for multi-organization data.

## API surface

| Endpoint | Policy | Purpose |
|---|---|---|
| `GET /api/organizations/context` | Read | Resolved organization context plus organizations the caller may see. |
| `GET /api/organizations` | Read | Organizations visible to the caller. |
| `POST /api/organizations` | Admin | Create an organization. |
| `GET /api/organizations/{id}/memberships` | Admin | List memberships. |
| `PUT /api/organizations/{id}/memberships` | Admin | Create/update a membership (role validated). |
| `DELETE /api/organizations/{id}/memberships/{membershipId}` | Admin | Remove a membership. |
| `GET/POST/PUT/DELETE /api/organizations/classes[/{id}]` | Read / Instruct | Tenant-scoped class administration. |
| `GET/POST/DELETE /api/organizations/resources[/{id}]` | Read / Instruct | Tenant-scoped resource assignment. |
| `POST /api/organizations/migrate` | Admin | Run the idempotent default-organization migration. |

`GET /api/auth/me` additionally returns the resolved `organizationId` and `organizationName` for
display in the HMI and simulator.

## Audit and privacy

- Every tenant-scoped document records its `OrganizationId`; historian and audit queries are
  tenant-filtered.
- Cross-tenant reads and writes are rejected server-side; object-id enumeration does not leak
  existence (a foreign id looks identical to a missing one).
- Audit records carry the authenticated subject (S42) and the organization where applicable (S43).
- No secret or personal data is duplicated across organizations; class rosters are visible only
  inside their organization.

## Testing

| Layer | Coverage |
|---|---|
| Unit (`TenantScopeTests`) | Scope normalization, legacy fallback, platform-admin bypass, backfill rules, filter rendering. |
| Integration, Testcontainers (`TenantIsolationTests`) | Cross-organization rejection for jobs, tasks, sessions, templates, alarms, messages, historian samples/events, classes and resource assignments; index presence and idempotence. |
| Integration, Testcontainers (`TrainingRepositoryTests`) | Training sessions/actions are isolated between organizations; action ingestion is idempotent; training indexes are present and idempotent. |
| Integration, Testcontainers (`TenantMigrationTests`) | Deterministic backfill, idempotence, no overwrite of existing scopes, single default organization. |
| HTTP (`TenancyHttpIntegrationTests`, `MultiOrganizationTenancyTests`) | Forged header rejected, validated selection accepted, revoked membership rejected, HTTP job isolation, `/api/auth/me` organization, missing/ambiguous membership failure semantics. |
| HTTP (`TrainingHttpIntegrationTests`) | Full training lifecycle, cross-learner rejection, cross-tenant training-session invisibility over a multi-organization host, public-demo read-only enforcement. |
