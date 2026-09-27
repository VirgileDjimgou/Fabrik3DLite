# Testing Fabrik3D

Fabrik3D uses layered tests so a change can be checked without relying on a developer's local database or a manually running frontend.

## Local commands

```powershell
dotnet test Fabrik3D/Fabrik3D.slnx
npm --prefix Fabrik3D/fabrik3d.client run test
npm --prefix Fabrik3D/fabrik3d.hmi run test
```

The infrastructure integration tests start their own disposable MongoDB container through Testcontainers. Docker must be running; they never use the local `Fabrik3D` database.

OPC UA connector tests start the in-process `Fabrik3D.OpcUa.Fixture` server on a loopback port (real OPC UA transport, no Docker and no proprietary software). Run them with `dotnet test Fabrik3D/Fabrik3D.Server.Tests/Fabrik3D.Server.Tests.csproj --filter "FullyQualifiedName~OpcUa"`. Details are in [OPC_UA_ADAPTER.md](architecture/OPC_UA_ADAPTER.md).

The S47 Siemens / PLCSIM interoperability profile reuses that fixture (no TIA Portal, PLCSIM or licence required): `dotnet test Fabrik3D/Fabrik3D.Server.Tests/Fabrik3D.Server.Tests.csproj --filter "FullyQualifiedName~SiemensPlcsimProfileTests"`. See [docs/showcases/siemens-plcsim/](showcases/siemens-plcsim/README.md).

The S48 packaging/lifecycle tests run against disposable MongoDB (Testcontainers) and the real `Program.cs` pipeline: `dotnet test Fabrik3D/Fabrik3D.Server.Tests/Fabrik3D.Server.Tests.csproj --filter "FullyQualifiedName~DeploymentConfigurationValidatorTests|FullyQualifiedName~DeploymentHttpTests|FullyQualifiedName~SchemaMigrationRunnerTests|FullyQualifiedName~SecretRedactorTests|FullyQualifiedName~SupportBundleBuilderTests"`. They cover fail-fast configuration validation, version/liveness/readiness endpoints, support-bundle authorization and redaction, and migration ordering/idempotence. The container-level procedures and their recorded evidence are in [docs/operations/VALIDATION.md](operations/VALIDATION.md).

The S49 observability, security, accessibility and performance checks:

```powershell
# Backend observability + security-hardening unit/HTTP tests (no Docker required)
dotnet test Fabrik3D/Fabrik3D.Server.Tests/Fabrik3D.Server.Tests.csproj --filter "FullyQualifiedName~Observability|FullyQualifiedName~SecurityHardening"

# Client frame-sampler tests and the recorded sampling benchmark
npm --prefix Fabrik3D/fabrik3d.client run test -- src/observability
npm --prefix Fabrik3D/fabrik3d.client run test -- src/observability/frameMetrics.performance.test.ts --reporter=verbose

# Recorded WebGL frame time (headless; included in test:visual)
npm --prefix Fabrik3D/fabrik3d.client run test:visual

# Concurrent SignalR client load harness (Testing-mode orchestrator on 127.0.0.1:7249)
npm --prefix Fabrik3D/fabrik3d.client run load:signalr

# WCAG 2.2 AA matrix across Chromium/Chrome/Edge/Firefox/WebKit (server + served HMI build)
npm --prefix Fabrik3D/fabrik3d.hmi run test:a11y
```

The S49 observability and performance methodology, reference hardware and recorded numbers are in [docs/operations/OBSERVABILITY.md](operations/OBSERVABILITY.md), [PERFORMANCE.md](operations/PERFORMANCE.md), [SECURITY_HARDENING.md](operations/SECURITY_HARDENING.md), [ACCESSIBILITY.md](operations/ACCESSIBILITY.md) and [BROWSER_SUPPORT.md](operations/BROWSER_SUPPORT.md).

For the end-to-end tests, start the server in the `Testing` environment with an isolated MongoDB database, then run:

```powershell
$env:ASPNETCORE_ENVIRONMENT = 'Testing'
$env:ASPNETCORE_URLS = 'http://127.0.0.1:7249'
$env:MongoDb__ConnectionString = 'mongodb://localhost:27017'
$env:MongoDb__DatabaseName = 'Fabrik3D_e2e'
$env:VITE_ORCHESTRATOR_URL = 'http://127.0.0.1:7249'   # rendered HMI preview proxies the API/hub
dotnet run --project Fabrik3D/Fabrik3D.Server/Fabrik3D.ServerTaskManager.csproj --no-launch-profile

# The HMI project must be built once; Playwright serves it with `vite preview`.
npm --prefix Fabrik3D/fabrik3d.hmi run build
npm --prefix Fabrik3D/fabrik3d.hmi run test:e2e
```

The rendered `hmi-ui` specs (including the accessibility checks) load through the HMI preview server, which proxies `/api` and `/hubs` to `VITE_ORCHESTRATOR_URL` (default `https://localhost:7249`). Set it to the HTTP Testing server (`http://127.0.0.1:7249`) so the connection badge reaches its steady connected state.

The suite runs in two Playwright projects:

- `orchestrator-api` exercises the live API: health, the complete job lifecycle, the simulator claim flow, and cell-template persistence.
- `hmi-ui` serves the built HMI with `vite preview` and checks the rendered navigation hierarchy. Screenshot baselines are stored per platform; visual comparison runs on the platform that owns the baseline (`win32`) and is skipped elsewhere, while the rendering check still runs.

Override the targets with `E2E_BASE_URL` (orchestrator) and `E2E_HMI_URL` / `E2E_HMI_PORT` (served HMI) when needed. Set `E2E_VISUAL=1` to force screenshot comparison on other platforms.

## Docker

The production-style stack can also be validated locally:

```bash
docker compose -f Fabrik3D/compose.production.yaml config --quiet
node scripts/lifecycle/verify-config.mjs
docker compose -f Fabrik3D/compose.production.yaml up --build -d
```

`verify-config.mjs` asserts that every service declares a healthcheck and that dependent services use `condition: service_healthy`, in addition to the profile/CORS/secret checks. It exposes the simulator on `http://localhost:8081`, the HMI on `http://localhost:8082`, and the orchestration API on `http://localhost:8080`, each with a healthcheck. A production-like profile requires a configured OIDC authority to start. Backup/restore are exercised with `node scripts/lifecycle/backup.mjs` and `node scripts/lifecycle/restore.mjs --file <archive> --yes`. The Docker workflow in `.github/workflows/docker.yml` validates the compose file and builds the same images on every push.

## CI

The GitHub Actions workflow in `.github/workflows/ci.yml` builds the backend projects in Release, runs the backend, contracts, and infrastructure tests, type-checks and builds both clients, and runs the orchestration and HMI end-to-end suites for every pull request and push to `main`. Failed test reports and the server log are retained as workflow artifacts. A separate Docker workflow builds the container images.
