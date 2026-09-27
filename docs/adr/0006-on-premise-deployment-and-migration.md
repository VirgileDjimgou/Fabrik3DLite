# ADR 0006 — On-premise deployment topology and schema migration strategy

- Status: accepted (S48)
- Date: 2026-09-26
- Supersedes: none
- Related: [S48 sprint brief](../roadmap/sprints/S48-onpremise-packaging-lifecycle.md),
  [DEPLOYMENT.md](../operations/DEPLOYMENT.md),
  [UPGRADE_ROLLBACK.md](../operations/UPGRADE_ROLLBACK.md),
  [ADR 0003 (identity and RBAC)](0003-identity-and-rbac.md)

## Context

Fabrik3D is deployed by training centres and industrial users on their own hardware, often on a
restricted or air-gapped network with no cloud dependency. The product must be installable,
upgradeable, recoverable and supportable locally. Before S48 the repository shipped a single
`compose.production.yaml` with no healthchecks, no readiness/liveness distinction, no migration
bookkeeping, no documented backup/restore or upgrade/rollback procedure and no support bundle.

The public demo deployment shares the same stack but has a distinct configuration (read-only public
identity, no support bundle). Both must keep working.

## Decision

### 1. Docker Compose remains the on-premise packaging unit

No Kubernetes, Helm, cloud autoscaling or HA clustering is introduced (explicit S48 non-goals). The
stack is four services — `mongo`, `orchestrator`, `simulator`, `hmi` — described by
`Fabrik3D/compose.production.yaml`. Each service declares a `healthcheck`; downstream services use
`depends_on` with `condition: service_healthy`, so the stack starts in dependency order instead of
racing. Container ports are configurable through environment variables and MongoDB is never
published outside the internal network.

Secure defaults are configuration, not code branches:

- `ASPNETCORE_ENVIRONMENT=Production` plus an explicit `Deployment__Profile` (`Production`,
  `OnPrem` or `Demo`) loads the matching `appsettings.<Profile>.json` overlay without changing the
  ASP.NET Core environment name, so every production guard still applies.
- Swagger is disabled unless explicitly enabled; enabling it in a production-like profile requires
  the documented `Deployment:AllowSwaggerInProduction=true` opt-in.
- CORS is an explicit origin allow-list; a wildcard is rejected at startup.
- Secrets come from an env file or Docker secrets and are never baked into images.

### 2. Readiness is separate from liveness

`/api/health` remains the backward-compatible summary. `/api/health/live` asserts only that the
process is serving. `/api/health/ready` performs dependency checks (MongoDB ping, historian storage
reachability, connector state summary) and returns `503` when a required dependency is unhealthy.
The orchestrator container healthcheck uses `/api/health/ready`, so a container that cannot reach its
dependencies is reported unhealthy rather than serving misleading traffic. Health payloads never
contain configuration values.

### 3. Configuration validation fails fast

`DeploymentConfigurationValidator` runs after `app.Build()` and before the pipeline is configured.
It returns every actionable problem at once and the host throws, so an invalid or unsafe deployment
never starts partially secure. Authentication misconfiguration remains covered by the existing
`AuthenticationStartupGuard` (ADR 0003).

### 4. Schema migrations are versioned, additive and idempotent

`ISchemaMigration` implementations declare a sortable `Version` and `Name` and perform additive,
idempotent changes. `SchemaMigrationRunner` applies pending migrations in version order and records
each one in the `schemaMigrations` MongoDB collection keyed by the version string, so a second pass
is a no-op. `SchemaMigrationHostedService` runs the pass once at startup; a failure is logged and
readiness reports the degraded dependency rather than crashing the host, because the compatibility
readers keep the server usable. `BaselineIndexesMigration` (`0001`) only ensures the documented core
indexes exist and never mutates documents.

There is no destructive automatic down-migration. Rollback is documented per migration; for the
baseline it is simply "the previous image keeps reading the same data".

### 5. Backup, restore and support are scripts and read-only endpoints

`scripts/lifecycle/` provides `verify-config.mjs`, `backup.mjs` and `restore.mjs` that drive the
running Compose stack (`mongodump`/`mongorestore` inside the container). Backups are verified with
`mongorestore --dryRun` before being trusted, checksummed, and accompanied by a manifest. Restore is
dry-run first and requires an explicit `--yes` before any write, so a failed verification never
partially overwrites data. The support bundle is a read-only, administrator-only, secret-redacted
diagnostic snapshot and never includes credentials, tokens or unrelated process environment data.

## Consequences

- Existing Compose users keep the same service names and the same MongoDB volume; the changes are
  additive.
- A production-like deployment **must** configure an OIDC authority, because anonymous access is
  refused in production. This is a deliberate identity decision from ADR 0003, not a packaging
  regression.
- New healthchecks add a short startup delay (`start_period`) but prevent dependent services from
  starting against an unready dependency.
- Migration bookkeeping adds one small collection (`schemaMigrations`); it is additive and ignored
  by existing readers.
- The public demo keeps its own `Demo` profile (public read-only identity, support bundle disabled)
  and is not affected by on-premise secure defaults beyond what it already requires.

## Alternatives considered

- **A single fat container.** Rejected: it destroys the per-service health and resource isolation and
  makes upgrades all-or-nothing.
- **Kubernetes/Helm.** Rejected: out of scope for training-centre installs and explicit S48 non-goal.
- **Automatic schema migrations with a full migration framework.** Rejected: heavier than needed and
  the existing documents already have tested compatibility readers; an idempotent, versioned runner
  is sufficient and easier to reason about on an air-gapped host.
- **Dumping the whole `IConfiguration` into the support bundle.** Rejected: ASP.NET Core merges the
  entire process environment, which can contain host paths and user names. The bundle is restricted
  to owned application sections and redacts sensitive keys.
