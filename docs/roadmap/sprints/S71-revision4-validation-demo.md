# S71 - Revision 4 validation and flagship demonstration

## Outcome

Validate Revision 4 as a measured release candidate and produce a reproducible demonstration of actual
execution in all five flagship scenarios. Introduce no new architecture.

## Demonstration scope

- Palletizing: visibly capture robot approach, pick, transfer, place and pallet progression.
- Vision sorting: capture infeed, sensing/inspection, classification, diverter actuation and accepted/rejected
  routing.
- Assembly/inspection: capture robot handling, fixture loading, clamping, inspection and completion or rework.
- Safety training: capture unsafe state, gate/scanner/E-stop response, motion inhibition, recovery and
  controlled restart.
- CNC: preserve and capture the HMI Job Composer -> Create -> Start -> targeted dispatch -> simulator ACK ->
  automatic 3D execution -> completion -> historian/time-travel workflow.
- Capture execution, not only idle cells, using the deterministic visual protocol and license-safe media.

## Validation scope

- Run `npm run sprint:validate`, .NET build/tests, contract check, simulator type-check/tests/build/visual tests,
  HMI type-check/tests/build/e2e, docs check, audit, security scan, repository policy and production compose
  validation, plus every applicable gate in `QUALITY_GATES.md`.
- Re-run the real hardware GPU benchmark after final assets and compare Revision 3 with Revision 4 for
  triangles, draw calls, load time, FPS and frame p50/p95/p99. Identify hardware and acceleration honestly.
- Create `docs/operations/VALIDATION_REVISION_4.md` and
  `docs/releases/RELEASE_NOTES_REVISION_4.md`, linked from current documentation.
- Separate automated, visual, hardware benchmark, fixture, manual and deferred evidence.

## Non-goals and boundaries

- No new architecture, protocol, database, scenario family or HMI module.
- Do not fabricate screenshots, benchmarks, comparisons, connector proof or industrial claims.
- Real PLC/PLCSIM remains deferred; safety certification and OEM emulation are not claimed.

## Acceptance criteria

1. Reproducible captures show the specified live execution stages in all five flagship scenarios.
2. The CNC capture preserves the authoritative HMI-to-server-to-simulator workflow and historian evidence.
3. Every applicable mandatory gate is green; unresolved red gates keep S71 open.
4. Revision 3 versus Revision 4 performance is reported with measured, reproducible evidence and no
   unmeasured improvement claim.
5. Validation and release-notes documents accurately separate evidence classes and preserve all non-claims.
6. The release candidate immediately communicates Fabrik3D's existing simulation, training and lightweight
   virtual-commissioning purpose without adding product scope.

## Evidence expected for completion

Record exact commands/results, five execution captures, GPU benchmark artifacts and comparison, release and
validation document links, repository policy/security/audit results, and explicit deferred/non-claim status.

