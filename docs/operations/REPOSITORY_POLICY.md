# Repository and binary lifecycle policy

Status: **implemented and tested (S57)**. The policy is enforced by
`scripts/repository/repository-policy.mjs` and the `npm run repo:policy` gate. It prevents accidental
commits of build output, dependencies, temporary recordings and oversized generated binaries **without
rewriting Git history** and **without deleting existing assets**.

## Which binary categories belong where

| Category | Home | Notes |
| --- | --- | --- |
| Hand-authored source assets (cell JSON, mapping JSON, SVG, small icons) | Git | Text or small binaries checked in directly. |
| Runtime visual assets (GLB/GLTF, KTX2 textures) below the LFS threshold | Git | Must declare meters/Y-up/origin/license per the 3D asset invariants. |
| Large binaries (media, demo video, recordings, big GLB) | Git LFS | Tracked through a `filter=lfs` pattern in `.gitattributes`. |
| Generated build output (`bin/`, `obj/`, `dist/`, `node_modules/`) | Never Git | Reproduced from source; ignored by `.gitignore` and blocked by the gate. |
| Temporary/local artifacts (`*.tmp`, `*.bak`, `*.orig`, `*.rej`, `.log`, archives) | Never Git | Blocked by the gate. |
| Release packages, demo video deliverables, large evidence captures | Release packaging / external distribution | Documented in the release checklist; not committed to the source tree. |

## Enforcement rules

The gate classifies every relevant file and reports a violation when:

1. the path contains a forbidden directory segment (`bin`, `obj`, `node_modules`, `dist`, `coverage`,
   `playwright-report`, `test-results`, `.vite`) → `forbidden-build-or-dependency-path`;
2. the path has a forbidden temporary/archive extension (`.tmp`, `.bak`, `.orig`, `.rej`, `.rar`,
   `.7z`, `.tar`, `.tgz`) → `forbidden-temporary-or-archive-extension`;
3. a non-LFS file exceeds the hard size limit of **10 MB** → `exceeds-hard-size-limit`;
4. a non-LFS binary asset exceeds the **1 MB** LFS threshold → `binary-requires-git-lfs`.

Files already tracked by Git LFS are exempt from the size rules: that is precisely what LFS is for.
A binary under the threshold does not need LFS.

## Frozen baseline (no history rewrite)

Before S57 the repository already tracked large demo media and generated recordings. Deleting them or
rewriting history is out of scope for this sprint (the brief explicitly forbids it). The gate therefore
grandfathers those exact paths through
[`repository-policy-baseline.json`](repository-policy-baseline.json), which records each path, its size
and the rule it would otherwise violate.

- Baseline entries are exempt from the **size/LFS** rules only. Forbidden build/dependency/temp paths
  are **never** exempt.
- New files are always checked; the baseline is not a general allow-list.
- Removing grandfathered blobs from history is a separate, explicit **HUMAN_REQUIRED** migration and
  is never performed automatically by the sprint automation.

Regenerate the baseline only when intentionally freezing a reviewed set of new exceptions:

```powershell
npm run repo:policy:baseline   # rewrites the baseline from current tracked offenders
```

## Commands

```powershell
npm run repo:policy           # every tracked file vs the frozen baseline (CI / evidence)
npm run repo:policy:staged    # staged files only (pre-commit preflight)
npm run repo:policy:changed   # working-tree changes plus untracked files (local preflight)
```

The check is fast (a few hundred milliseconds for the full tracked tree) and deterministic.

## Git LFS availability

The gate never assumes Git LFS is installed at runtime: it reads `.gitattributes` to decide whether a
path *is intended* to be LFS-managed. If Git LFS is unavailable in an environment, large binaries must
be moved to release packaging or external distribution instead of being committed raw; the gate then
reports `binary-requires-git-lfs` rather than corrupting assets.

## Related documents

- [Security hardening](SECURITY_HARDENING.md)
- [Threat model](THREAT_MODEL.md)
- [Upgrade and rollback](UPGRADE_ROLLBACK.md)
- [Release-candidate checklist](RELEASE_CANDIDATE_CHECKLIST.md)
