# Administrator guide

Audience: the person responsible for a running Fabrik3D installation. It covers accounts, routine
operation, monitoring, backup, retention and recovery. Installation and configuration are in
[DEPLOYMENT.md](DEPLOYMENT.md); the detailed procedures are in
[BACKUP_RESTORE.md](BACKUP_RESTORE.md), [UPGRADE_ROLLBACK.md](UPGRADE_ROLLBACK.md) and
[SUPPORT_BUNDLE.md](SUPPORT_BUNDLE.md).

## Accounts and roles

Fabrik3D enforces authorization server-side. Production deployments use an external OIDC provider;
the identity mode and the minimum role matrix come from
[ADR 0003](../adr/0003-identity-and-rbac.md) and
[IDENTITY_AND_RBAC.md](../architecture/IDENTITY_AND_RBAC.md).

Roles in order of capability (see the identity document for the authoritative matrix):

| Role | Typical use |
| --- | --- |
| `Learner` | read-only training surfaces and own sessions |
| `PublicDemo` | clearly-labelled read-only public demonstration (Demo profile only) |
| `Operator` | run cells, acknowledge alarms, acquire control authority |
| `Instructor` | training sessions, assessment, class dashboards |
| `Engineer` | scene/equipment authoring, mapping, configuration |
| `Administrator` | users, support bundle, platform administration |

Operational rules:

- Create accounts in your OIDC provider, not in Fabrik3D. Fabrik3D validates tokens and maps roles.
- Never share the administrator account for routine operation.
- The `Developer` and `Test` identity modes are refused in production-like profiles; a development
  signing key in production is refused at startup.
- Cross-organization access is rejected server-side without leaking object existence. Use distinct
  organizations/classes for distinct cohorts.

## Daily operation

- **Start/stop the stack.**
  `docker compose -f Fabrik3D/compose.production.yaml up -d` /
  `docker compose -f Fabrik3D/compose.production.yaml down`.
  `down` keeps the MongoDB volume; `down -v` destroys data and should only be used intentionally.
- **Inspect status.**
  `docker compose -f Fabrik3D/compose.production.yaml ps` shows each service's health.
- **Readiness.** `curl -fsS http://127.0.0.1:8080/api/health/ready` returns
  `Healthy`, `Degraded` or `503 Unhealthy` with per-dependency checks (MongoDB, historian storage,
  connector summary).
- **Version.** `curl -fsS http://127.0.0.1:8080/api/version` and the HMI **Settings → About this
  installation** card show the running version, profile, environment, runtime and build id.

## Monitoring basics

The stack is designed to be monitored with standard container tooling; no separate observability
stack is bundled (a hardening sprint follows this one).

| Signal | How to read it | Healthy | Action |
| --- | --- | --- | --- |
| Container health | `docker ps` / Compose `ps` | all four `healthy` | inspect logs of the unhealthy service |
| Orchestrator readiness | `/api/health/ready` | `200 Healthy` | see the failing check name |
| MongoDB reachability | `mongo` check | `Healthy` | verify the container and disk space |
| Historian storage | `historian` check | `Healthy` or `disabled` | when enabled and MongoDB is down, readiness degrades |
| Connectors | `connectors` check | `Healthy` when none enabled | a `Degraded` state means an enabled adapter is not connected |
| Resource usage | `docker stats --no-stream` | see measured idle baseline | investigate sustained CPU/memory growth |
| Version | `/api/version` | expected tag | confirm you are running the intended release |

Reference idle usage (measured, see [REQUIREMENTS.md](REQUIREMENTS.md)): approximately 298 MiB total
across the four containers with connectors and historian disabled.

A moderately unhealthy stack behaves predictably:

- **MongoDB unavailable:** `/api/health/ready` returns `503` (`mongo` unhealthy), the orchestrator
  stays up for liveness, and the UI shows a clear offline/degraded state. Restore MongoDB; readiness
  recovers without a restart.
- **Enabled connector disconnected:** readiness reports `Degraded` with the protocol and state; no
  command is silently sent to a disconnected adapter and writes fail closed.

## Data retention

- Historian retention is bounded by `Historian:RetentionMaxAgeDays` and
  `Historian:RetentionMaxSamplesPerSignal`; the background pruner removes data beyond those limits.
  Choose values that fit your disk budget.
- Disabling the historian never breaks live orchestration.
- Training, assessment and audit records are not automatically pruned; plan archival via backups.

## Backups

Run [backup](BACKUP_RESTORE.md) on a schedule and keep at least one verified backup off the host.
Before any upgrade, service change or destructive maintenance, take and verify a fresh backup.

## Maintenance windows

- Upgrades: orchestrator restart plus migration time; see
  [UPGRADE_ROLLBACK.md](UPGRADE_ROLLBACK.md).
- Certificate rotation for OIDC/connectors: update configuration and recreate the affected service.
- Keep the Docker engine and base images patched; the deployment pins image tags so patching is
  deliberate.

## Support and diagnostics

Collect a redacted [support bundle](SUPPORT_BUNDLE.md) for support tickets. It includes versions,
health, redacted configuration, connector states, applied migrations and recent logs, and excludes
credentials and unrelated host environment data.

## Troubleshooting quick reference

| Symptom | First check |
| --- | --- |
| Orchestrator container restarts immediately | `docker logs` — startup validation or authentication guard message |
| Stack starts but simulator/HMI unreachable | orchestrator health; they wait for `service_healthy` |
| `401` on every API call | OIDC authority/issuer/audience configuration |
| `503` readiness | MongoDB reachability, then connector states |
| CORS failures in the browser | `Cors:AllowedOrigins` must list the exact HTTPS origin |
| Restore aborts without writing | archive failed `mongorestore --dryRun`; check the checksum and archive path |
