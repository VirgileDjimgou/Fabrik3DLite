# Local development setup

## Supported toolchain

- Windows 10/11 or a recent Linux/macOS development environment
- .NET SDK 8.x
- Node.js 20.19+ or 22.12+
- npm matching the selected Node.js LTS release
- MongoDB Community Server 7.x or 8.x, locally or in a container
- A current Chromium, Edge, Chrome, or Firefox release with WebGL 2 support

The simulator package declares the authoritative Node.js range. CI should use one of those versions rather than an unpinned “latest” image.

## Restore

From the repository root:

```powershell
npm run restore
dotnet restore Fabrik3D/Fabrik3D.slnx
```

`npm run restore` uses `npm ci` and the committed lockfiles. It intentionally replaces local `node_modules` contents with the exact dependency graph from each lockfile.

## Local configuration

Copy the relevant `.env.example` file to `.env.local` only when a frontend must bypass its Vite proxy:

```powershell
Copy-Item Fabrik3D/fabrik3d.client/.env.example Fabrik3D/fabrik3d.client/.env.local
Copy-Item Fabrik3D/fabrik3d.hmi/.env.example Fabrik3D/fabrik3d.hmi/.env.local
```

For the server, keep secrets outside committed `appsettings.json`. Use environment variables or .NET user secrets:

```powershell
dotnet user-secrets --project Fabrik3D/Fabrik3D.Server set "MongoDb:ConnectionString" "mongodb://localhost:27017"
dotnet user-secrets --project Fabrik3D/Fabrik3D.Server set "MongoDb:DatabaseName" "Fabrik3D"
```

The checked-in `appsettings.Local.example.json` documents the expected shape but is not loaded automatically.

## Build and checks

```powershell
npm run type-check
npm run build
```

Individual builds remain available:

```powershell
npm run build:server
npm run build:simulator
npm run build:hmi
```

## Run locally

Start MongoDB, then use separate terminals:

```powershell
dotnet run --project Fabrik3D/Fabrik3D.Server --launch-profile https
npm --prefix Fabrik3D/fabrik3d.client run dev
npm --prefix Fabrik3D/fabrik3d.hmi run dev
```

Default backend development endpoints are defined in `Fabrik3D.Server/Properties/launchSettings.json`. Swagger is available at `/swagger` when the server runs in the Development environment.

## Dependency audits

```powershell
npm run audit
```

This command audits both npm applications and every .NET project. The projects are audited individually because `dotnet list package` does not support the JavaScript `.esproj` entries in the solution file.

Audit warnings must be assessed in context. Do not use force-upgrades that introduce breaking framework changes without a dedicated migration. The latest recorded baseline is available in [`DEPENDENCY_AUDIT.md`](DEPENDENCY_AUDIT.md).
