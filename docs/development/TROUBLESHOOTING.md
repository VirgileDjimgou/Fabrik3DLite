# Troubleshooting

## Simulator build parses TypeScript inside `three.module.js`

This indicates a corrupted local dependency installation. Application code must never be appended to files under `node_modules`.

Restore from the lockfile:

```powershell
npm --prefix Fabrik3D/fabrik3d.client ci
npm run build:simulator
```

If corruption returns, inspect editor extensions, code-generation commands, and scripts that write files. Do not patch the third-party module as a permanent fix.

## SignalR negotiates against the wrong port

Both clients use relative `/api` and `/hubs` URLs by default. Vite resolves the backend target from environment variables and the backend `launchSettings.json`.

For deterministic local development, create `.env.local` from `.env.example` and set:

```text
VITE_ORCHESTRATOR_URL=https://localhost:7249
```

Use the URL of the launch profile that is actually running. Confirm the backend health endpoint before debugging SignalR.

## HTTPS certificate errors

Trust the .NET development certificate:

```powershell
dotnet dev-certs https --clean
dotnet dev-certs https --trust
```

Restart browsers and development servers afterward.

## MongoDB is unavailable

Confirm that MongoDB is listening on the configured address and that the database name matches the environment or user-secret configuration. MongoDB creates collections lazily, so an empty database may not appear until the first successful write.
