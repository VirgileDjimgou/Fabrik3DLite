# S48 - On-premise product packaging and lifecycle

## Outcome

Commercial-grade on-premise deployment: documented Docker Compose stack, configuration validation, secrets handling, persistent data, backup, restore, database migration, health checks, readiness checks, upgrade procedure, rollback procedure, version information, support bundle/export, environment-specific configuration, and secure defaults. Development Swagger/debug endpoints are not exposed unnecessarily in production. CPU/RAM/GPU/browser requirements are documented. The public demo deployment is preserved.

## Motivation

Training centers deploy locally, often air-gapped or with restricted IT. Fabrik3D must be installable, upgradeable, recoverable, and supportable without a cloud dependency.

## Current-state assumptions to verify

- `Fabrik3D/compose.production.yaml` runs mongo/orchestrator/simulator/hmi with `restart: unless-stopped` but has no healthchecks.
- The server Dockerfile publishes `Fabrik3D.ServerTaskManager.dll`, runs as non-root, exposes 8080.
- Swagger is enabled in `Development` and `Testing`; CORS is currently permissive; `HealthController` returns a simple status.
- No backup/restore/migration tooling, no version endpoint beyond `HealthDto.Version = "1.0.0"`, no support bundle.
- Mongo data volume exists (`mongo-data`); no migration runner exists.
- CI validates compose config and builds images; it does not run the stack end to end.

## Scope

- Compose and container hardening:
  - healthchecks for mongo, orchestrator, simulator, hmi; `depends_on` with `condition: service_healthy` where appropriate;
  - readiness vs liveness: `/api/health` split or extended (for example `/api/health/live`, `/api/health/ready`) with meaningful checks (Mongo connectivity, historian availability, connector state summary);
  - resource limits/recommendations documented; restart policies; log configuration;
  - environment-specific configuration files/examples (`Production`, `OnPrem`, `Demo`) with secure defaults;
  - no debug/Swagger exposure in production unless explicitly enabled; CORS restricted by configuration.
- Secrets handling:
  - externalized secrets via environment/secret files, never baked into images or committed;
  - documented options (Docker secrets/env file) and rotation guidance;
  - no secrets in logs or support bundles.
- Data lifecycle:
  - documented persistence layout and volumes;
  - backup and restore scripts/procedures with verification (for example `mongodump`/`mongorestore` or snapshot guidance) and a tested restore;
  - database migration strategy and runner compatible with existing compatibility readers; upgrade applies migrations idempotently;
  - upgrade procedure (image tags, order, downtime expectations, rollback) and rollback procedure (previous image tags + data compatibility statement);
  - version information surfaced by the API and in a version file/UIs.
- Support bundle/export: a documented command/endpoint to collect safe diagnostics (versions, config with secrets redacted, health, recent logs, connector states) that never includes credentials or personal data.
- Documentation:
  - deployment guide (hardware requirements: CPU/RAM/disk/GPU optional, browser requirements, network/ports, TLS termination guidance);
  - administrator guide (users, backup, upgrade, monitoring basics);
  - configuration reference with validation rules (fail fast on invalid config).
- Preserve the public demo deployment: document its distinct configuration and ensure changes do not break it.

## Non-goals

- No Kubernetes/Helm chart, no cloud autoscaling, no HA clustering.
- No paid/licensing enforcement.
- No re-architecture of the application.
- No full observability stack (S49).

## Architecture boundaries

- Packaging stays in Docker/scripts/config; no application architecture change beyond health/version endpoints and migration hooks.
- Migrations are idempotent and versioned; no destructive silent changes.
- Support bundle generation is read-only and redacts secrets.

## Domain and data model changes

- Migration bookkeeping collection/version fields if needed; additive and versioned.

## Backend changes

- Health/readiness endpoints, version endpoint, configuration validation at startup, migration runner hook, support-bundle endpoint/command (authorized), log redaction review.

## Simulator changes

- Expose build version in the UI/console; no functional change.

## HMI and UX changes

- Show version/build information in settings or about; no workflow change.

## 3D and visual requirements

Not applicable.

## Protocol and security requirements

- Secure defaults: debug off, Swagger off unless enabled, CORS allow-list, HTTPS guidance, non-root containers, read-only filesystems where practical, least-privilege Mongo user.
- Connector defaults remain disabled.
- Health endpoints must not leak sensitive configuration.

## Backward compatibility

- Existing compose users keep working; new healthchecks/conditions must not create flakiness.
- Existing data volumes continue to work after migration; upgrade/rollback documented.
- Public demo configuration preserved.

## Migration requirements

- Document all persisted schema versions and the migration runner behavior; test migration from an existing repository dataset; verify idempotence and rollback compatibility.

## Failure and degraded-mode behavior

- Invalid configuration: startup fails fast with actionable messages (not partial insecure startup).
- Mongo unavailable: readiness fails; liveness stays meaningful; the UI shows a clear offline state.
- Restore/backup failure: explicit failure and no partial overwrite; documented recovery.
- Upgrade failure: documented rollback steps with image and data compatibility.

## Testing strategy

- Automated: compose config validation, healthcheck presence/behavior, readiness/liveness semantics, version endpoint, config validation failure cases, support-bundle redaction test, migration idempotence against a seeded database.
- Integration: `docker compose up --build` smoke where CI resources allow; otherwise a scripted local validation with recorded evidence.
- Backup/restore test: seed data → backup → destroy volume → restore → verify.
- Upgrade test: previous image/state → new image → migrate → verify, then rollback verify.
- Fresh-install test on a clean host.

## Performance requirements

- Document minimum/recommended CPU/RAM/disk and optional GPU; record measured idle and running resource usage of the stack. Do not claim requirements without measurement.

## Security considerations

- No default credentials; Mongo auth guidance; secrets externalized; image scan guidance; dependency audit referenced from S49.
- Swagger/debug disabled in production defaults.
- Support bundles redact secrets and personal data.

## Documentation changes

- Add `docs/operations/DEPLOYMENT.md`, `docs/operations/ADMINISTRATOR_GUIDE.md`, `docs/operations/BACKUP_RESTORE.md`, `docs/operations/UPGRADE_ROLLBACK.md`, `docs/operations/SUPPORT_BUNDLE.md`, `docs/operations/REQUIREMENTS.md`.
- Update `README.md` Docker section, `docs/development/SETUP.md`, and `docs/TESTING.md`.
- ADR for deployment topology and migration strategy.

## Acceptance criteria

1. Documented compose deployment passes config validation, starts with healthchecks, and reports readiness/liveness meaningfully.
2. Backup/restore and upgrade/rollback procedures are tested and documented with recorded evidence.
3. Configuration validation fails fast on invalid/unsafe configuration; production defaults do not expose Swagger/debug or wildcard CORS.
4. Version information is available from API and UI; support bundle redacts secrets and personal data.
5. Requirements (CPU/RAM/disk/GPU/browser) are documented from measurements.
6. Public demo configuration remains functional and documented.
7. All builds/tests/contracts gates pass; fresh-install and restore evidence recorded.

## Evidence expected for completion

```text
docker compose config/up output and healthcheck status
backup → destroy → restore verification transcript
upgrade → rollback verification transcript
fresh-install transcript
config validation failure examples
support bundle sample with redaction proof
recorded idle/running resource usage
dotnet build/test (pass)
```

## Rollback and failure containment

Lifecycle tooling is additive; the previous compose configuration remains valid. Migration rollback is documented per migration. Never complete the sprint if restore or upgrade verification fails.

## Follow-up items that must not leak into this sprint

- Full observability (S49), 1.0 product validation (S50).
