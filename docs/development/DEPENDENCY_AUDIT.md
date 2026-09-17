# Dependency audit baseline

Recorded on 2026-09-17 during sprint S01.

## Result

| Area | Command | Result |
| --- | --- | --- |
| Simulator | `npm --prefix Fabrik3D/fabrik3d.client audit` | 0 known vulnerabilities |
| HMI | `npm --prefix Fabrik3D/fabrik3d.hmi audit` | 0 known vulnerabilities |
| Contracts | `dotnet list ... package --vulnerable --include-transitive` | No vulnerable packages |
| Domain | `dotnet list ... package --vulnerable --include-transitive` | No vulnerable packages |
| Infrastructure | `dotnet list ... package --vulnerable --include-transitive` | No vulnerable packages |
| Server | `dotnet list ... package --vulnerable --include-transitive` | No vulnerable packages |

The full baseline can be reproduced from the repository root with:

```powershell
npm run audit
```

## Remediation performed

- Refreshed both npm lockfiles using non-forced compatible updates.
- Upgraded `MongoDB.Driver` from `2.30.0` to `3.11.2` to remove the vulnerable transitive `SharpCompress` and `Snappier` versions.
- Rebuilt the full solution and smoke-tested the API after the MongoDB driver upgrade.

This file records a point-in-time result, not a permanent security guarantee. Run the audit again whenever dependencies change.
