# Revision 5 release preparation (S76)

Status: **release candidate preparation; Revision 5 validation completed by S76.** This document collects
the version/tag recommendation, migration status, known limitations, validation and media links, and the
repository / binary / provenance / generated-output policy results required before the Revision 5
validation in [S76](../roadmap/sprints/S76-revision5-validation-demo.md). It introduces no new product
capability and does not modify historical evidence.

## Release eras

| Era | Sprints | Status | Record |
| --- | --- | --- | --- |
| 1.0 baseline | S01–S50 | immutable, complete | [VALIDATION_1.0.md](VALIDATION_1.0.md), [RELEASE_NOTES_1.0.md](../releases/RELEASE_NOTES_1.0.md) |
| Roadmap Revision 2 | S51–S57 | complete, tagged `v1.1.0` | [VALIDATION_POST_1.0.md](VALIDATION_POST_1.0.md), [RELEASE_NOTES_1.1.md](../releases/RELEASE_NOTES_1.1.md) |
| Roadmap Revision 3 | S58–S64 | complete | [VALIDATION_REVISION_3.md](VALIDATION_REVISION_3.md), [RELEASE_NOTES_REVISION_3.md](../releases/RELEASE_NOTES_REVISION_3.md) |
| Roadmap Revision 4 | S65–S71 | complete, validated by S71 | [VALIDATION_REVISION_4.md](VALIDATION_REVISION_4.md), [RELEASE_NOTES_REVISION_4.md](../releases/RELEASE_NOTES_REVISION_4.md) |
| Roadmap Revision 5 | S72–S76 | complete, validated by S76 | [VALIDATION_REVISION_5.md](VALIDATION_REVISION_5.md), [RELEASE_NOTES_REVISION_5.md](../releases/RELEASE_NOTES_REVISION_5.md) |

## Version and tag recommendation

- The only existing release tag in the repository is **`v1.1.0`** (Roadmap Revision 2). It must not be
  moved, deleted or re-pointed.
- **Recommendation:** publish the Revision 3 + Revision 4 + Revision 5 candidate as **`v1.3.0`** — the
  next minor release after `v1.1.0`. Revisions 3, 4 and 5 never produced an independent tag, and all of
  them are additive minor releases with no breaking REST/SignalR contract change.
- **Alternative:** if separate per-revision releases are wanted, tag the S64 state `v1.2.0` and the S71
  state `v1.2.1` (new tags on existing, already-completed history — never a rewrite) and publish
  Revision 5 as `v1.3.0`.
- The tag is applied only after S76 records the validation and the measured Revision 4 → Revision 5
  comparison and every mandatory gate is green. No tag is fabricated by this sprint.

## Migration status

- **No manual migration is required.** Revision 5 changes generated visuals, screenshot/capture media and
  additive layout/visual-runtime data only.
- The cell-file schema moves **1.0 → 1.1** (S73) to carry the additive `attachTo` anchor reference. A
  deterministic `1.0 → 1.1` migration is provided (and the older `0.9 → 1.1` path remains), the field is
  optional, and a file without it loads and resolves exactly as before with the declared transform
  fallback. Existing cells, scenarios and the 1.0 reference sample remain valid.
- Scenario ids, expected events and success criteria are unchanged; the S67 `ScenarioActivity` fields
  (`durationSeconds`, `stageId`, `faultPoint`, `recoveryPoint`) remain optional and additive.
- REST/SignalR contracts, persisted document schemas, the historian schema and connector mappings are
  unchanged (verified by `npm run contracts:check`).
- Procedural fallback remains supported: a missing, corrupt or absent GLB degrades to the procedural
  visual with a diagnostic and never blocks scenario logic; the optional `quality=high` composer path
  falls back to the direct renderer on any non-hardware/WebGL1/no-context environment.

## Known limitations and non-claims

The consolidated, current list is [LIMITATIONS.md](LIMITATIONS.md). Revision 5 does not change it:
Fabrik3D is not a safety-certified system or an OEM emulator, connectors and writes are disabled by
default, fault injection and safety behaviour are simulated, and real PLC/PLCSIM proof remains deferred.
The generated assets and procedural surface maps are original generic content under the Fabrik3D
educational license.

## Repository, binary, provenance and generated-output policy

- The policy is enforced by `scripts/repository/repository-policy.mjs`
  ([REPOSITORY_POLICY.md](REPOSITORY_POLICY.md)); large binaries require Git LFS, build output and
  temporary artifacts are always rejected, and the frozen baseline never exempts a forbidden path.
- Executed during S76:
  - `npm run repo:policy` → `passed: 1416 file(s) checked (mode=tracked)`;
  - `npm run repo:policy:changed` → `passed: 113 file(s) checked (mode=changed)`.
- Every S65 scenario package remains under the 1 MB LFS threshold (largest `model.glb` ≈ 104 KB; total
  scenario GLB/thumbnail payload ≈ 0.77 MB), so no new binary requires Git LFS. Revision 5 adds only
  deterministic PNG execution captures under `artifacts/demo/flagship/execution-revision5/`, each well
  below the threshold.
- Provenance: every scenario GLB package is generated in-repository by
  `scripts/generate-industrial-glb-assets.mjs`, with recorded license, SI bounds, semantic-node contract,
  `box` collision proxy and recomputed SHA-256 in each `equipment.asset.json`; there is no OEM, scanned or
  externally downloaded mesh. Regeneration is byte-deterministic. The S72 surface maps are code-generated
  seeded RGBA buffers (`src/equipment/visuals/proceduralSurfaces.ts`), not downloaded images, so no new
  image provenance or license is introduced.
- Generated-output policy: `dist/`, `bin/`, `obj/`, `node_modules/`, `coverage/`, `playwright-report/`,
  `test-results/` and `.vite/` remain out of Git; generated assets that are intentionally shipped live
  under `Fabrik3D/fabrik3d.client/public/assets/equipment/**`.

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
- Revision 5: [VALIDATION_REVISION_5.md](VALIDATION_REVISION_5.md)
- Performance and hardware evidence: [PERFORMANCE.md](PERFORMANCE.md)
- Flagship runbook: [FLAGSHIP_DEMO.md](FLAGSHIP_DEMO.md)
- Release-candidate checklist: [RELEASE_CANDIDATE_CHECKLIST.md](RELEASE_CANDIDATE_CHECKLIST.md)

## Media links

- Curated flagship demonstration media inventory:
  [`artifacts/demo/flagship/README.md`](../../artifacts/demo/flagship/README.md).
- Existing demo captures: [`docs/demo/screenshots/`](../demo/screenshots/) and
  [`docs/evidence/`](../evidence/).
- Revision 5 execution captures were produced by the deterministic visual protocol and the
  `demo-12-revision5-flagship.spec.ts` stage capture in S76 (21 stage stills at the `quality=high`
  preset under
  [`artifacts/demo/flagship/execution-revision5/`](../../artifacts/demo/flagship/execution-revision5/));
  the Revision 4 execution stills remain intact under
  [`artifacts/demo/flagship/execution/`](../../artifacts/demo/flagship/execution/). See
  [VALIDATION_REVISION_5.md](VALIDATION_REVISION_5.md) for the full inventory and provenance.

## Deferred industrial boundary

Real PLC/PLCSIM interoperability, safety certification and OEM emulation remain explicitly deferred or
unclaimed. Fixture-based protocol evidence (in-process Modbus/OPC UA fixtures, Mosquitto Testcontainers)
is labelled as fixture evidence and is never presented as a real industrial-machine integration.
