# S76 - Revision 5 validation and flagship demonstration

## Outcome

Validate Revision 5 (S72-S75) as a measured release candidate, capture the improved scenes in
reproducible media, and update release/documentation coherence. Introduce no new architecture.

## Demonstration scope

- Capture all five flagship scenarios (palletizing, vision sorting, assembly/inspection, safety
  training, CNC) with the new surfaces, lighting/post-processing, assembled modules and state-driven
  motion, using the deterministic visual protocol and license-safe media.
- Preserve the authoritative HMI-to-server-to-simulator CNC workflow and historian evidence in the CNC
  capture.

## Validation scope

- Run `npm run sprint:validate`, the .NET build/tests, contract check, simulator type-check/tests/build/
  visual tests, HMI type-check/tests/build/e2e, docs check, audit, security scan, repository policy and
  production compose validation, plus every applicable gate in `docs/roadmap/QUALITY_GATES.md`.
- Re-run the real hardware GPU benchmark and compare Revision 4 with Revision 5 for triangles, draw
  calls, texture memory, load time, FPS and frame p50/p95/p99, with honest hardware/acceleration
  classification.
- Produce `docs/operations/VALIDATION_REVISION_5.md`, `docs/releases/RELEASE_NOTES_REVISION_5.md` and
  `docs/operations/RELEASE_PREPARATION_REVISION_5.md`.
- Update release-era coherence: `README.md`, `docs/DOCUMENTATION_INDEX.md`,
  `docs/operations/LIMITATIONS.md`, `docs/roadmap/README.md` and `docs/architecture/OVERVIEW.md`, plus
  `scripts/docs/check-docs.mjs` and `scripts/tests/product-coherence.test.mjs`, to distinguish Revision 5
  while keeping all Revision 4 artifacts intact.
- Update `scripts/tests/autopilot-wiring.test.mjs` to the completed Revision 5 roadmap state.
- Separate automated, visual, hardware-benchmark, fixture, manual and deferred evidence.

## Non-goals and boundaries

- No new architecture, protocol, database, scenario family or HMI module.
- Do not fabricate screenshots, benchmarks, comparisons or industrial claims.
- Real PLC/PLCSIM remains deferred; no safety certification or OEM emulation is claimed.

## Acceptance criteria

1. Reproducible captures show the improved visuals and live execution stages in all five flagship
   scenarios.
2. Every applicable mandatory gate is green; unresolved red gates keep S76 open.
3. Revision 4 versus Revision 5 performance is reported with measured, reproducible evidence and no
   unmeasured improvement claim.
4. Validation/release documents accurately separate evidence classes and preserve all non-claims.
5. Documentation and roadmap state are coherent for Revision 5 with S01-S76 history preserved.

## Evidence expected for completion

Record exact commands/results, five execution captures, GPU benchmark artifacts and comparison, release
and validation document links, repository policy/security/audit results, and explicit deferred/non-claim
status.
