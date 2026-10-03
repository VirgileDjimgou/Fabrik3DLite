# Revision 4 release preparation (S70)

Status: **release candidate preparation, S70 complete; Revision 4 validation completed by S71.** This
document collects the version/tag recommendation, migration status, known limitations, validation and
media links and the repository / binary / provenance / generated-output policy results required before
the Revision 4 validation in
[S71](../roadmap/sprints/S71-revision4-validation-demo.md). It introduces no new product capability and
does not modify historical evidence.

## Release eras

| Era | Sprints | Status | Record |
| --- | --- | --- | --- |
| 1.0 baseline | S01–S50 | immutable, complete | [VALIDATION_1.0.md](VALIDATION_1.0.md), [RELEASE_NOTES_1.0.md](../releases/RELEASE_NOTES_1.0.md) |
| Roadmap Revision 2 | S51–S57 | complete, tagged `v1.1.0` | [VALIDATION_POST_1.0.md](VALIDATION_POST_1.0.md), [RELEASE_NOTES_1.1.md](../releases/RELEASE_NOTES_1.1.md) |
| Roadmap Revision 3 | S58–S64 | complete | [VALIDATION_REVISION_3.md](VALIDATION_REVISION_3.md), [RELEASE_NOTES_REVISION_3.md](../releases/RELEASE_NOTES_REVISION_3.md) |
| Roadmap Revision 4 | S65–S71 | complete, validated by S71 | [VALIDATION_REVISION_4.md](VALIDATION_REVISION_4.md), [RELEASE_NOTES_REVISION_4.md](../releases/RELEASE_NOTES_REVISION_4.md) |

## Version and tag recommendation

- The only existing release tag in the repository is **`v1.1.0`** (Roadmap Revision 2). It must not be
  moved, deleted or re-pointed.
- **Recommendation:** publish the Revision 3 + Revision 4 candidate as **`v1.2.0`** — the next minor
  release after `v1.1.0`. Revision 3 never produced an independent tag, and both revisions are additive
  minor releases with no breaking contract change.
- **Alternative:** if a separate Revision 3 release is wanted, tag the S64 state `v1.2.0` (a new tag on
  existing, already-completed history — never a rewrite) and publish Revision 4 as `v1.3.0`.
- The tag is applied only after S71 records the validation and the measured Revision 3 → Revision 4
  comparison and every mandatory gate is green. No tag is fabricated by this sprint.

## Migration status

**No migration is required.** Revision 4 changes generated visual assets, additive scenario process
metadata and derived layout/camera values only:

- scenario ids, expected events and success criteria are unchanged;
- the S67 `ScenarioActivity` fields (`durationSeconds`, `stageId`, `faultPoint`, `recoveryPoint`) are
  optional and additive; older scenarios fall back to a documented default duration;
- REST/SignalR contracts, persisted document schemas, the historian schema and connector mappings are
  unchanged;
- procedural fallback remains supported, so a missing or corrupt GLB never blocks scenario logic.
- The legacy cell-file migration (0.9 → 1.0) and the signal/snapshot migrations are untouched.

## Known limitations and non-claims

The consolidated, current list is [LIMITATIONS.md](LIMITATIONS.md). Revision 4 does not change it:
Fabrik3D is not a safety-certified system or an OEM emulator, connectors and writes are disabled by
default, fault injection and safety behaviour are simulated, and real PLC/PLCSIM proof remains
deferred. The generated assets are original generic geometry under the Fabrik3D educational license.

## Repository, binary, provenance and generated-output policy

- The policy is enforced by `scripts/repository/repository-policy.mjs`
  ([REPOSITORY_POLICY.md](REPOSITORY_POLICY.md)); large binaries require Git LFS, build output and
  temporary artifacts are always rejected, and the frozen baseline never exempts a forbidden path.
- Executed during S70:
  - `npm run repo:policy` → `passed: 1266 file(s) checked (mode=tracked)`;
  - `npm run repo:policy:changed` → `passed: 173 file(s) checked (mode=changed)`.
- Every S65 scenario package is under the 1 MB LFS threshold (largest `model.glb` ≈ 104 KB; total
  scenario GLB/thumbnail payload ≈ 0.77 MB), so no new binary requires Git LFS.
- Provenance: every scenario GLB package is generated in-repository by
  `scripts/generate-industrial-glb-assets.mjs`, with recorded license, SI bounds, semantic-node
  contract, `box` collision proxy and recomputed SHA-256 in each `equipment.asset.json`; there is no
  OEM, scanned or externally downloaded mesh. Regeneration is byte-deterministic.
- Generated-output policy: `dist/`, `bin/`, `obj/`, `node_modules/`, `coverage/`,
  `playwright-report/`, `test-results/` and `.vite/` remain out of Git; generated assets that are
  intentionally shipped live under `Fabrik3D/fabrik3d.client/public/assets/equipment/**`.

## Release packaging

- The on-premise stack is defined by `Fabrik3D/compose.production.yaml` and validated by
  `docker compose -f Fabrik3D/compose.production.yaml config --quiet` plus
  `node scripts/lifecycle/verify-config.mjs`.
- Release media (demo video, large captures) is published through `artifacts/`/external distribution,
  never committed as oversized raw binaries, per [REPOSITORY_POLICY.md](REPOSITORY_POLICY.md) and
  [RELEASE_CANDIDATE_CHECKLIST.md](RELEASE_CANDIDATE_CHECKLIST.md).

## Validation links

- Immutable 1.0: [VALIDATION_1.0.md](VALIDATION_1.0.md)
- Revision 2: [VALIDATION_POST_1.0.md](VALIDATION_POST_1.0.md)
- Revision 3: [VALIDATION_REVISION_3.md](VALIDATION_REVISION_3.md)
- Revision 4: [VALIDATION_REVISION_4.md](VALIDATION_REVISION_4.md)
- Performance and hardware evidence: [PERFORMANCE.md](PERFORMANCE.md)
- Flagship runbook: [FLAGSHIP_DEMO.md](FLAGSHIP_DEMO.md)
- Release-candidate checklist: [RELEASE_CANDIDATE_CHECKLIST.md](RELEASE_CANDIDATE_CHECKLIST.md)

## Media links

- Curated flagship demonstration media inventory:
  [`artifacts/demo/flagship/README.md`](../../artifacts/demo/flagship/README.md).
- Existing demo captures: [`docs/demo/screenshots/`](../demo/screenshots/) and
  [`docs/evidence/`](../evidence/).
- Revision 4 execution captures were produced by the deterministic visual protocol and the
  `demo-11-execution-stages.spec.ts` stage capture in S71 (21 stage stills under
  [`artifacts/demo/flagship/execution/`](../../artifacts/demo/flagship/execution/)); see
  [VALIDATION_REVISION_4.md](VALIDATION_REVISION_4.md) for the full inventory and provenance.

## Deferred industrial boundary

Real PLC/PLCSIM interoperability, safety certification and OEM emulation remain explicitly deferred or
unclaimed. Fixture-based protocol evidence (in-process Modbus/OPC UA fixtures, Mosquitto Testcontainers)
is labelled as fixture evidence and is never presented as a real industrial-machine integration.
