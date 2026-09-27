# S48 validation evidence

Recorded commands and their real results for the on-premise packaging and lifecycle sprint. Nothing
below is estimated: every transcript was produced on 2026-09-26 on the S48 reference workstation
(Windows 11, Docker Desktop / Linux containers, 13th Gen Intel Core i7-13620H, 64 GB RAM).

## Automated tests

```text
dotnet build Fabrik3D/Fabrik3D.slnx
  -> Build succeeded. 0 Warning(s) 0 Error(s)

dotnet test Fabrik3D/Fabrik3D.Server.Tests --no-build \
  --filter "FullyQualifiedName~DeploymentConfigurationValidatorTests|FullyQualifiedName~DeploymentHttpTests|FullyQualifiedName~SchemaMigrationRunnerTests|FullyQualifiedName~SecretRedactorTests|FullyQualifiedName~SupportBundleBuilderTests"
  -> Passed! Failed: 0, Passed: 53, Skipped: 0, Total: 53
```

Coverage: fail-fast configuration validation (missing persistence, non-positive timings, wildcard
CORS, Swagger in production, anonymous authentication, unknown profile), the version endpoint and
backward-compatible health summary, liveness/readiness semantics, administrator-only redacted
support bundle, migration ordering/idempotence over seeded documents, and secret redaction
(key-based, value-based and log-message-based) plus support-bundle environment scoping.

## Compose configuration validation

```text
docker compose -f Fabrik3D/compose.production.yaml config --quiet
  -> exit 0

node scripts/lifecycle/verify-config.mjs
  -> [verify-config] passed for Fabrik3D/compose.production.yaml
```

`verify-config.mjs` also asserts that every service declares a healthcheck test and that
`orchestrator→mongo`, `simulator→orchestrator` and `hmi→orchestrator` use
`condition: service_healthy`.

## Full stack start

Images built locally and started with a non-secret smoke env file (the templates intentionally have
an empty OIDC authority; a non-empty authority is required for a production-like boot):

```text
docker compose -f Fabrik3D/compose.production.yaml up -d
  -> Container fabrik3d-mongo-1        Healthy
     Container fabrik3d-orchestrator-1 Healthy
     Container fabrik3d-hmi-1          Started
     Container fabrik3d-simulator-1    Started

docker compose -f Fabrik3D/compose.production.yaml ps
  -> hmi=running/healthy
     mongo=running/healthy
     orchestrator=running/healthy
     simulator=running/healthy
```

Endpoint checks against the running stack:

```text
GET /api/health        -> 200 {"status":"Healthy","version":"1.0.0"}
GET /api/health/live   -> 200 checks: self=Healthy
GET /api/health/ready  -> 200 checks: mongo=Healthy, historian=Healthy (disabled), connectors=Healthy (none enabled)
GET /api/version       -> 200 {"version":"1.0.0","environment":"Production","profile":"OnPrem", ...}
GET /swagger/v1/swagger.json -> 401 (Swagger not served in the production-like profile)
GET /api/support/bundle      -> 401 (administrator only)
GET http://127.0.0.1:18081/  -> 200 simulator HTML
GET http://127.0.0.1:18082/  -> 200 HMI HTML
```

A healthcheck defect was found and fixed during this validation: the nginx containers resolve
`localhost` to `::1` while nginx listens on IPv4, so `wget http://localhost/` failed. The compose
healthchecks now probe `127.0.0.1` explicitly.

### Build-tooling note

`docker compose build` (BuildKit) failed on this host with
`rpc error: code = Canceled desc = grpc: the client connection is closing` during context load, an
environment-level BuildKit issue unrelated to the project. The images were built successfully with
the legacy builder (`DOCKER_BUILDKIT=0 docker build -f <dockerfile> -t <tag> Fabrik3D`), and
`docker compose config`/`up`/`down` and the healthchecks were exercised normally. The CI Docker
workflow continues to use the standard `docker compose build`.

## Configuration fail-fast examples

```text
# Cors__AllowedOrigins__0=*  (Production-like)
Unhandled exception. System.InvalidOperationException: Invalid deployment configuration:
 - Cors:AllowedOrigins must not contain the wildcard '*'.

# Deployment__Profile=Bogus
Unhandled exception. System.InvalidOperationException: Invalid deployment configuration:
 - Deployment:Profile 'Bogus' is not one of Production, OnPrem, Demo, Development, Testing.

# Authentication__Mode=None
Unhandled exception. System.InvalidOperationException: Authentication:Mode=None (anonymous fallback)
is refused in Production. Configure an external OIDC provider instead.
```

## Backup → destroy → restore

```text
# seed
docker exec fabrik3d-mongo-1 mongosh --quiet --eval "..."
  -> seeded jobs=1 markers=1

node scripts/lifecycle/backup.mjs --compose Fabrik3D/compose.production.yaml --out <temp>
  -> [backup] archive verified with mongorestore --dryRun
     [backup] wrote .../fabrik3d-Fabrik3D-20260926T205557Z.archive.gz (495 bytes)
     [backup] sha256=8a7f337a3d7e80dd09e2ac9014c73b74f71dc118040f4148f169841498ccf60f

# destroy
docker compose -f Fabrik3D/compose.production.yaml down
docker volume rm fabrik3d_mongo-data
docker compose -f Fabrik3D/compose.production.yaml up -d mongo   # fresh, healthy
docker exec fabrik3d-mongo-1 mongosh --quiet --eval "..."
  -> before-restore jobs=0

node scripts/lifecycle/restore.mjs --file <archive> --compose ... --yes
  -> [restore] pre-flight verification succeeded (no writes performed)
     [restore] collection counts=[["seedMarker",1],["jobs",1]]
     [restore] completed

docker exec fabrik3d-mongo-1 mongosh --quiet --eval "..."
  -> jobs=1 markers=1
     marker={"_id":"...","marker":"s48-backup-restore","at":"2026-09-26T20:55:54.718Z"}
```

The restored marker retained its original timestamp, proving a real round trip through a destroyed
volume.

## Schema migration idempotence (upgrade pass)

```text
# first startup applied the baseline
docker exec fabrik3d-mongo-1 mongosh --quiet --eval "printjson(...schemaMigrations.find().toArray())"
  -> [{ _id: '0001', Name: 'baseline-core-indexes', AppliedAtUtc: ISODate('2026-09-26T22:06:07.329Z'), DurationMilliseconds: 306 }]
docker logs fabrik3d-orchestrator-1 | grep Migrations
  -> [Server][Migrations] Schema migrations complete applied=0 total=1 alreadyUpToDate=True

# restart (simulated upgrade image change over the same data)
docker compose ... restart orchestrator   -> orchestrator healthy
docker exec ... schemaMigrations
  -> same _id and same AppliedAtUtc (not re-applied)
docker logs ... after restart
  -> applied=0 total=1 alreadyUpToDate=True
docker exec ... seedMarker/jobs
  -> markers=1 jobs=1  (data intact)
```

## Resource measurements

`docker stats --no-stream` with the full stack healthy and idle:

```text
fabrik3d-orchestrator-1  0.46%  68.09MiB / 2GiB
fabrik3d-simulator-1     0.00%  12.36MiB / 512MiB
fabrik3d-hmi-1           0.00%  12.43MiB / 512MiB
fabrik3d-mongo-1         0.46%  205.3MiB / host
```

See [REQUIREMENTS.md](REQUIREMENTS.md) for how these map to recommended sizing.

## Support bundle redaction

Verified by `DeploymentHttpTests.Support_bundle_redacts_secrets_and_never_returns_them_in_raw_json`:
the administrator bundle contains `[REDACTED]` entries, lists `Authentication:SigningKey` in
`redactedKeys`, and the serialized bundle never contains the fixture signing key. `SupportBundleBuilderTests`
additionally proves that unrelated process environment keys (`PATH`, `USERPROFILE`, `HOME`,
`AWS_SECRET_ACCESS_KEY`, …) are excluded from the bundle.

## Contracts and frontend gates

```text
node scripts/sprint-runner.mjs validate
  -> Roadmap validation passed: 50 sprints, 47 completed, active=S48

dotnet test Fabrik3D/Fabrik3D.slnx
  -> Contracts.Tests 5/5, Infrastructure.IntegrationTests 16/16, Server.Tests 413/413, 0 failed

npm run contracts:generate   # regenerated openapi.json + orchestrator.generated.ts from the live server
npm run contracts:check      # verified from http://127.0.0.1:7249/swagger/v1/swagger.json, exit 0

npm --prefix Fabrik3D/fabrik3d.client run type-check  -> pass
npm --prefix Fabrik3D/fabrik3d.client run test        -> 102 files, 503 passed
npm --prefix Fabrik3D/fabrik3d.client run build       -> success
npm --prefix Fabrik3D/fabrik3d.client run test:visual -> 25 passed

npm --prefix Fabrik3D/fabrik3d.hmi run type-check  -> pass
npm --prefix Fabrik3D/fabrik3d.hmi run test        -> 16 files, 59 passed
npm --prefix Fabrik3D/fabrik3d.hmi run build       -> success
npm --prefix Fabrik3D/fabrik3d.hmi run test:e2e    -> 10 passed

npm run audit        -> no vulnerable npm packages; no vulnerable NuGet packages (4 projects)
npm run security:scan -> Security check passed (902 files)
```

The generated TypeScript contracts were regenerated from the live server: the S48 DTOs
(`VersionDto`, `HealthReportDto`, `SupportBundleDto`) were referenced by the hand-written contract
index but absent from `orchestrator.generated.ts`, which broke the simulator/HMI Docker builds until
regenerated.

### Visual baseline stabilisation

The HMI visual hierarchy test initially failed by 1676 pixels. A pixel-level diff showed the only
difference was the header connection badge: the committed baseline had been captured showing
`Disconnected` while a live run shows `Connected`. Diagnosis (bounding box `(8,4)-(1011,76)`, peak
diff rows `y=23–30`, and the actual screenshot) confirmed the SignalR transport state, not a layout
change. The test now waits for the badge's steady `hmi-status--success` state before capturing, and
the two `hmi-home-*` baselines were regenerated for that deterministic connected state. This is an
evidence-backed correction, not a blind snapshot update; the navigation-hierarchy assertions are
unchanged.

## Cleanup

The stack was stopped with `docker compose down` (the volume is retained). The disposable standalone
MongoDB container used for earlier checks was removed. No production data was touched.
