# Testing Fabrik3D

Fabrik3D uses layered tests so a change can be checked without relying on a developer's local database or a manually running frontend.

## Local commands

```powershell
dotnet test Fabrik3D/Fabrik3D.slnx
npm --prefix Fabrik3D/fabrik3d.client run test
npm --prefix Fabrik3D/fabrik3d.hmi run test
```

The infrastructure integration tests start their own disposable MongoDB container through Testcontainers. Docker must be running; they never use the local `Fabrik3D` database.

For the end-to-end smoke test, start the server in the `Testing` environment with an isolated MongoDB database, then run:

```powershell
$env:ASPNETCORE_ENVIRONMENT = 'Testing'
$env:ASPNETCORE_URLS = 'http://127.0.0.1:7249'
$env:MongoDb__ConnectionString = 'mongodb://localhost:27017'
$env:MongoDb__DatabaseName = 'Fabrik3D_e2e'
dotnet run --project Fabrik3D/Fabrik3D.Server/Fabrik3D.ServerTaskManager.csproj --no-launch-profile

npm --prefix Fabrik3D/fabrik3d.hmi run test:e2e
```

The smoke journey verifies the API health check and the complete job lifecycle: create, start, pause, resume, stop, and delete.

## CI

The GitHub Actions workflow in `.github/workflows/ci.yml` runs restore, type checks, unit tests, builds, the MongoDB-backed repository test, and the orchestration smoke journey for every pull request and push to `main`. Failed test reports and the server log are retained as workflow artifacts.
