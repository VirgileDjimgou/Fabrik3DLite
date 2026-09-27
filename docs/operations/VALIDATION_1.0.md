# Fabrik3D 1.0 (S50) validation evidence

Recorded commands and their real results for the 1.0 commercialization baseline. Nothing below is
estimated: every transcript was produced on 2026-09-27 on the S50 reference workstation
(Windows 11, .NET SDK 10.0.401 building net8.0, Node.js 24.18.0, Docker Desktop / Linux containers,
MongoDB 7.0/8.0, 13th Gen Intel Core i7-13620H).

The baseline validation re-ran the S48 lifecycle evidence and the full gate matrix. Historical S48
transcripts remain in [VALIDATION.md](VALIDATION.md).

## Roadmap, build and backend tests

```text
npm run sprint:validate
  -> Roadmap validation passed: 50 sprints, 49 completed, active=S50

dotnet build Fabrik3D/Fabrik3D.slnx
  -> 0 warnings, 0 errors

dotnet test Fabrik3D/Fabrik3D.slnx --no-build
  -> Contracts.Tests            5 passed
     Infrastructure.IntegrationTests 16 passed (Testcontainers MongoDB)
     Server.Tests             435 passed
     0 failed (456 total)
```

## Lifecycle tests (fresh install, upgrade, idempotence, support bundle)

```text
dotnet test Fabrik3D/Fabrik3D.Server.Tests --no-build \
  --filter "FullyQualifiedName~DeploymentConfigurationValidatorTests|FullyQualifiedName~DeploymentHttpTests|FullyQualifiedName~SchemaMigrationRunnerTests|FullyQualifiedName~SecretRedactorTests|FullyQualifiedName~SupportBundleBuilderTests"
  -> 53 passed, 0 failed

docker compose -f Fabrik3D/compose.production.yaml config --quiet
  -> exit 0

node scripts/lifecycle/verify-config.mjs
  -> [verify-config] passed for Fabrik3D/compose.production.yaml
```

## Full stack upgrade over a representative previous dataset

The stack was started from the cached 1.0 images over the existing `fabrik3d_mongo-data` volume
(the S48 seed dataset), simulating an upgrade rather than a fresh database. A non-secret smoke env
file supplied a placeholder OIDC authority (the templates intentionally leave it empty).

```text
docker compose -f Fabrik3D/compose.production.yaml up -d
  -> mongo Healthy, orchestrator Healthy, simulator healthy, hmi healthy

GET /api/health          -> 200 {"status":"Healthy","version":"1.0.0"}
GET /api/health/ready    -> 200 mongo=Healthy, historian=Healthy, connectors=Healthy (none enabled)
GET /api/version         -> 200 environment=Production profile=OnPrem runtime=".NET 8.0.25"
GET /swagger/v1/swagger.json -> 401 (not served in the production-like profile)
GET /api/support/bundle       -> 401 (administrator only)
GET http://127.0.0.1:8081/    -> 200 simulator HTML
GET http://127.0.0.1:8082/    -> 200 HMI HTML

docker logs fabrik3d-orchestrator-1
  -> [Server][Migrations] Schema migrations complete applied=0 total=1 alreadyUpToDate=True
```

The migration result proves idempotence over an existing dataset: the `0001` baseline migration was
already applied and was not re-applied, with data intact.

## Backup and restore

```text
node scripts/lifecycle/backup.mjs --compose Fabrik3D/compose.production.yaml --out <temp>
  -> [backup] archive verified with mongorestore --dryRun
     [backup] wrote fabrik3d-Fabrik3D-20260927T093149Z.archive.gz (2037 bytes)
     [backup] sha256=50170bb69f66c4f5ad6597cb9513bb6550b9896f9d22f031e7548f899dd30228
     [backup] manifest written

node scripts/lifecycle/restore.mjs --file <archive> --compose Fabrik3D/compose.production.yaml
  -> [restore] pre-flight verification succeeded (no writes performed)
     [restore] dry run only.

node scripts/lifecycle/restore.mjs --file <archive> --compose Fabrik3D/compose.production.yaml --yes
  -> [restore] pre-flight verification succeeded (no writes performed)
     [restore] collection counts=[["alarms",0],["memberships",0],["trainingClasses",0],["organizations",1],
                ["trainingSessions",0],["telemetrySamples",0],["trainingActions",0],["jobs",1],
                ["trainingResourceAssignments",0],["schemaMigrations",1],["seedMarker",1],
                ["controlAuthorityEvents",0],["historizedEvents",0],["operatorMessages",0],["tasks",0],
                ["simulationSessions",0],["cellTemplates",0]]
     [restore] completed

GET /api/health/ready -> 200 (after restore)

docker compose -f Fabrik3D/compose.production.yaml down
  -> stopped and removed the stack; the mongo-data volume is retained
```

The `--drop` restore is the documented rollback path; a real round trip through the backup archive
completed and the stack stayed healthy afterwards.

## Contracts

```text
npm run contracts:check   (server started non-blocking from the built
  Fabrik3D.ServerTaskManager.dll on 127.0.0.1:7249, Development profile, swagger polled, stopped)
  -> [contracts] verified from http://127.0.0.1:7249/swagger/v1/swagger.json, exit 0
```

## Simulator (fabrik3d.client)

```text
npm --prefix Fabrik3D/fabrik3d.client run type-check  -> exit 0
npm --prefix Fabrik3D/fabrik3d.client run test        -> 106 files, 523 passed
npm --prefix Fabrik3D/fabrik3d.client run build       -> exit 0
npm --prefix Fabrik3D/fabrik3d.client run test:visual -> 26 passed
```

The new `src/samples/referenceProject.test.ts` (6 tests) opens the shipped 1.0 reference sample
project with the real cell-file parser, mapping validator, scenario catalog and scene-preset catalog.

## Operator HMI (fabrik3d.hmi)

```text
npm --prefix Fabrik3D/fabrik3d.hmi run type-check  -> exit 0
npm --prefix Fabrik3D/fabrik3d.hmi run test        -> 18 files, 65 passed
npm --prefix Fabrik3D/fabrik3d.hmi run build       -> exit 0
npm --prefix Fabrik3D/fabrik3d.hmi run test:e2e    -> 13 passed
npm --prefix Fabrik3D/fabrik3d.hmi run test:a11y   -> 15 passed (chromium, chrome, msedge, firefox, webkit)
```

The HMI visual hierarchy spec compares against a committed win32 baseline, so it must run against a
clean database (as CI does): a reused persistent volume carries an ambient machine state that shifts
the right-hand status panel. On a clean database all 13 e2e and all 15 accessibility checks pass.
Two pre-existing flakiness sources were removed during this validation without weakening any
assertion: the accessibility spec now waits for the workspace/bottom-nav to render before exercising
the keyboard and measuring target sizes, and the E2E run raised the configurable test-host auth rate
limit (`Authentication__AuthRateLimitPermitLimit`) so the 5-engine accessibility matrix does not
collide with the dev-token limiter. The product default (30/min) is unchanged.

## Security

```text
npm run audit        -> simulator 0 vulnerabilities; hmi 0 vulnerabilities;
                        no vulnerable NuGet packages (Contracts, Domain, Infrastructure, ServerTaskManager)
npm run security:scan -> Security check passed (978 file(s) checked)
```

## Documentation

```text
npm run docs:check
  -> [docs:check] passed: 21 required documents present, 318 links resolved
```

## Reference workflow

The reference workflow is exercised by the automated suites in one continuous validation: the
simulator scenario tests and Playwright scenario/cell/mapping/fault-lab/time-travel specs
(scenario → cell → mapping → fault → time travel), the HMI E2E orchestration job claim flow
(job → simulator session → pallet), the reference-cell loop E2E (`ReferenceCellLoopE2ETests`, real
in-process Modbus fixture → control authority → actuator/sensor closed loop), the connector fixture
tests (OPC UA, MQTT/Mosquitto Testcontainers, Modbus in-process fixture), historian/time-travel
tests, and the training-session/instructor-dashboard and auth/tenancy negative tests in the backend
and HMI suites.

## Pre-existing unrelated failures (not caused by S50)

```text
npm run sprint:batch:test
  -> 28 passed, 5 failed
```

The five failures are stale autopilot infrastructure tests that assert the S33-era baseline and are
unrelated to the 1.0 documentation work:

- `autopilot-wiring.test.mjs` "autopilot state sample and worker prompt are committed" expects
  `docs/roadmap/autopilot/state.json` to be an idle sample, but the orchestrator owns and overwrites
  that live file while a batch is running.
- `autopilot-wiring.test.mjs` "the real roadmap was not mutated by this infrastructure work" asserts
  `activeSprint === null` and exactly 32 completed sprints; the roadmap has since progressed to S49
  (this is by design, not a regression).
- `sprint-batch-runner.test.mjs` "clamps a requested maximum of 25…", "detached start launches a
  batch…" and "start refuses to launch while an unresolved human gate exists" assert specific
  console text from the batch runner fixture that is no longer emitted.

These tests are not part of the mandatory gate matrix and were not touched by S50; the new
`scripts/tests/documentation.test.mjs` (2 tests) passes within the same suite.
