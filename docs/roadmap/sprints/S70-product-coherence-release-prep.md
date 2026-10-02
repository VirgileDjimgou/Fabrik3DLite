# S70 - Product coherence and release preparation

## Outcome

Remove contradictions between implementation, UI and current documentation and prepare an honest, clean
Revision 4 release candidate without rewriting historical evidence.

## Scope

- Audit current product documentation and UI for stale statements, including the `LIMITATIONS.md` 1.0 status,
  Revision 2-only roadmap wording, obsolete Robot Positions placeholders, outdated GPU-open claims in
  `HERO_REFERENCE_CELL.md`, and superseded scenario/visual-fidelity descriptions.
- Remove unused obsolete i18n keys only where references and locale completeness tests prove it safe.
- Clearly distinguish the 1.0 baseline, Revision 2, Revision 3 and Revision 4. Historical documents may remain
  historical; current documents must identify current implementation accurately.
- Prepare a version/tag recommendation, draft release notes, migration notes (or an explicit no-migration
  statement), known limitations, validation links and media links.
- Check the repository binary/asset policy, provenance records, generated-output policy and release packaging.
- Keep real PLC/PLCSIM deferred and simulated/live/fixture/hardware evidence distinctly labelled.

## Non-goals and boundaries

- No new functionality, destructive Git-history rewrite or alteration of S01-S64 completion evidence.
- No PLC hardware requirement, safety certification or OEM-emulation claim.
- Do not delete an apparently stale key or artifact without reference and policy evidence.

## Testing and validation

- Documentation link/claim/version consistency checks and i18n completeness/reference tests.
- Repository policy, binary policy, asset integrity/provenance and release-package checks.
- Run all applicable product gates affected by cleanup; report any genuinely pre-existing failure separately.

## Acceptance criteria

1. Current UI and documentation consistently describe the implemented Revision 4 candidate.
2. The four release eras are clearly distinguished without altering historical evidence.
3. Release notes, migration status, known limitations, validation links, media links and version/tag
   recommendation are ready for final validation.
4. Repository binary and provenance policy passes.
5. Deferred and non-claimed industrial boundaries remain prominent and accurate.

## Evidence expected for completion

Record the stale-claim/i18n audit, changed-document list, repository/binary policy results, draft release
artifacts and all applicable quality gates.

