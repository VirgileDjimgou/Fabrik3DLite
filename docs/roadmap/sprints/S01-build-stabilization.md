# S01 - Repository and build stabilization

## Outcome

Produce a clean, reproducible workspace where the existing server, simulator, and HMI can be restored and built from a fresh clone without relying on tracked generated files.

## Scope

- Preserve all current application behavior and scenes.
- Repair the simulator dependency/build corruption and confirm that third-party packages are not modified in place.
- Correct `.gitignore` paths and remove generated artifacts from source control: `node_modules`, `dist`, `.vs`, archives, temporary backups, `bin`, and `obj`.
- Add workspace-level restore/build/check commands without moving application code.
- Document supported Node.js, npm, .NET, MongoDB, and browser versions.
- Add a local environment template for orchestrator URLs and MongoDB configuration.

## Deliverables

- Reproducible clean install and builds for all three applications.
- Repository hygiene documentation and troubleshooting notes.
- No generated package contents used as application source.

## Tests and gates

- Delete local dependencies in a disposable copy, reinstall from lockfiles, then build.
- Run `dotnet build Fabrik3D/Fabrik3D.slnx`.
- Run simulator and HMI type checks and production builds.
- Smoke-start the API and verify `/api/health` and Swagger.
- Record dependency audit results; fix critical/high issues when compatible or document a bounded exception.

## Acceptance criteria

- A clean checkout can be restored and built using documented commands.
- The existing machining scene and HMI still start.
- No application source is stored under `node_modules` or `dist`.

## Non-goals

- No architecture migration and no new product feature.
