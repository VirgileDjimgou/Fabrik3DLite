# S64 - Flagship demo, documentation and release polish

## Outcome

Make the repository visibly demonstrate the quality already present in the implementation through one deterministic flagship demonstration, refreshed media, a product-oriented README and an honest Revision 3 validation record. No significant new architecture.

## Motivation

S58-S63 deliver scenario 3D runtime, credible cells, HMI polish, deterministic visual evidence, OIDC and demo isolation. S64 makes all of it obvious to a first-time visitor and records what is automated, visual, measured, fixture-based and manually validated.

## Current-state assumptions to verify

- Verify the authoritative server dispatch → simulator ACK → 3D execution flow works end to end without a simulator-local Start action.
- Inventory existing screenshots, videos, releases and their staleness.
- Inspect the current README opening and the documentation index.
- Confirm the applicable release gates and the S56/S62 performance evidence that can be cited.

## Scope

### Demo workflow

Create one deterministic flagship demonstration:

```text
HMI
 ↓
New Job
 ↓
select scenario/cell/pallet
 ↓
Create
 ↓
Start
 ↓
server targeted dispatch
 ↓
simulator ACK
 ↓
3D execution begins automatically
 ↓
robot/CNC/conveyor
 ↓
live HMI
 ↓
fault / recovery
 ↓
Job 100 %
 ↓
Completed
 ↓
historian / time travel
```

No simulator-local Start action. The server remains the orchestration authority and the simulator executes on dispatch.

### Scenario showcase

Also capture short sequences from:

```text
Vision Sorting
Palletizing
Assembly / Inspection
Safety Training
```

Each capture must visibly show its scenario-specific 3D equipment.

### README

Make the beginning of README product-oriented. Within the first screen explain:

```text
What Fabrik3D is
Architecture
Main workflow
3-5 strongest capabilities
Live demo
Flagship video
```

Keep detailed technical documentation elsewhere.

### Media

Refresh obsolete screenshots/videos. Prefer a small curated set over dozens of redundant images. Provide representative captures of:

```text
hero CNC cell
scenario cells
HMI
Job Composer
Robot view
fault/recovery
historian/time travel
```

Do not commit unnecessarily large generated video files when GitHub Releases or hosted media is more appropriate.

### Final validation

Run the full applicable release gates. Create a concise:

```text
docs/operations/VALIDATION_REVISION_3.md
```

separating:

```text
automated
visual
hardware benchmark
fixture
manual
deferred real PLC
```

Real PLC/PLCSIM remains explicitly deferred.

## Non-goals

- No significant new architecture, protocol, database or feature.
- No fabricated benchmark, screenshot, video or industrial evidence.
- No claim of safety, OEM emulation or standards compliance without evidence and licensing.
- No oversized generated media committed when release/hosted media is more appropriate.

## Architecture boundaries

- Preserve server orchestration authority, simulator execution/visualization and HMI operator interface.
- Preserve `Definition ≠ Runtime ≠ Visual ≠ Collision ≠ Telemetry`.
- The demonstration uses the real orchestration flow; it is not a scripted UI mock.

## Changes

- Add a deterministic, reproducible flagship demo script/runbook (and automated coverage where feasible).
- Capture the scenario showcase sequences deterministically.
- Rewrite the README opening as product-oriented; move or link detailed technical content.
- Refresh/curate media and remove obsolete duplicates.
- Run the full applicable release gates and write `docs/operations/VALIDATION_REVISION_3.md`.

## Backward compatibility

- Existing documentation, runbooks and samples remain valid or are updated in place.
- No behavior or contract change is introduced by documentation/media work.

## Failure and degraded modes

- If hardware-accelerated capture is unavailable, record the software-rendering classification honestly and defer the GPU capture rather than fabricate it.
- The validation document states explicitly which gates were run, their results and which items are deferred or manual.

## Testing strategy

- Automated end-to-end coverage of the flagship workflow: HMI job creation → server dispatch → simulator ACK → execution → completion → historian/time travel.
- A test asserting no simulator-local Start action exists in the demo path.
- Documentation link/consistency checks (`npm run docs:check`).
- Applicable release gates from `QUALITY_GATES.md`.
- Existing suites remain green.

## Performance requirements

- Cite measured S62/S56 evidence; do not re-claim unmeasured numbers.
- Demonstration/storyboarding must not degrade measured runtime performance.

## Security and licensing considerations

- No secret, token or personal datum in media, README or validation records.
- Only license-safe assets and media; record provenance where relevant.
- Keep the deferred real-PLC status explicit.

## Documentation changes

- Product-oriented README opening with architecture, main workflow, strongest capabilities, live demo and flagship video.
- Curated media set with accurate captions and boundary statements.
- `docs/operations/VALIDATION_REVISION_3.md` with the required evidence classes.
- Update the documentation index and release notes as appropriate.

## Acceptance criteria

1. One deterministic flagship demonstration follows the full workflow above with no simulator-local Start action.
2. Short showcase captures exist for Vision Sorting, Palletizing, Assembly/Inspection and Safety Training, each visibly showing scenario-specific 3D equipment.
3. The README opening is product-oriented and covers the six required elements.
4. Media is refreshed and curated; obsolete redundant captures are removed or superseded.
5. `docs/operations/VALIDATION_REVISION_3.md` separates automated, visual, hardware benchmark, fixture, manual and deferred real-PLC evidence with actual commands/results.
6. All applicable release gates pass.
7. Real PLC/PLCSIM remains explicitly deferred.

## Evidence expected for completion

Record the flagship workflow run, scenario capture references, README review, media list, the full gate results and the validation document. Do not fabricate evidence.

## Rollback and failure containment

Documentation and media changes are independently revertible; the flagship demo uses existing orchestration and does not alter runtime behavior.

## Follow-up items

- Real PLC/PLCSIM validation remains deferred until suitable licensed software or hardware is available.
