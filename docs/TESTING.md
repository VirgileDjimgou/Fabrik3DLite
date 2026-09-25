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

For the end-to-end tests, start the server in the `Testing` environment with an isolated MongoDB database, then run:

```powershell
$env:ASPNETCORE_ENVIRONMENT = 'Testing'
$env:ASPNETCORE_URLS = 'http://127.0.0.1:7249'
$env:MongoDb__ConnectionString = 'mongodb://localhost:27017'
$env:MongoDb__DatabaseName = 'Fabrik3D_e2e'
dotnet run --project Fabrik3D/Fabrik3D.Server/Fabrik3D.ServerTaskManager.csproj --no-launch-profile

# The HMI project must be built once; Playwright serves it with `vite preview`.
npm --prefix Fabrik3D/fabrik3d.hmi run build
npm --prefix Fabrik3D/fabrik3d.hmi run test:e2e
```

The suite runs in two Playwright projects:

- `orchestrator-api` exercises the live API: health, the complete job lifecycle, the simulator claim flow, and cell-template persistence.
- `hmi-ui` serves the built HMI with `vite preview` and checks the rendered navigation hierarchy. Screenshot baselines are stored per platform; visual comparison runs on the platform that owns the baseline (`win32`) and is skipped elsewhere, while the rendering check still runs.

Override the targets with `E2E_BASE_URL` (orchestrator) and `E2E_HMI_URL` / `E2E_HMI_PORT` (served HMI) when needed. Set `E2E_VISUAL=1` to force screenshot comparison on other platforms.

## Docker

The production-style stack can also be validated locally:

```bash
docker compose -f Fabrik3D/compose.production.yaml up --build
```

It exposes the simulator on `http://localhost:8081`, the HMI on `http://localhost:8082`, and the orchestration API on `http://localhost:8080`. The Docker workflow in `.github/workflows/docker.yml` validates the compose file and builds the same images on every push.

## CI

The GitHub Actions workflow in `.github/workflows/ci.yml` builds the backend projects in Release, runs the backend, contracts, and infrastructure tests, type-checks and builds both clients, and runs the orchestration and HMI end-to-end suites for every pull request and push to `main`. Failed test reports and the server log are retained as workflow artifacts. A separate Docker workflow builds the container images.
