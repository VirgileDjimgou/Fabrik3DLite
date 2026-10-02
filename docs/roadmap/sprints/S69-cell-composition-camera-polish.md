# S69 - Cell composition, scale and camera polish

## Outcome

Correct scale, reach, clearance, alignment and framing across the five flagship cells by extending the existing
measured-layout architecture rather than hand-sizing floors.

## Scope

- Reuse `cellFootprints`, `cellLayout`, equipment bounds, robot reach, service clearances, operator corridor,
  safety clearance and camera framing.
- Review CNC machine tending, vision sorting, robot palletizing, assembly/inspection and robot safety training
  for alignment, gaps, overlap, reach, pallet access, operator access, fence placement, conveyor endpoints,
  camera clipping and dead visual space.
- Correct declared equipment footprints, anchors, work targets and clearances so derived layout remains the
  source of truth.
- Derive camera presets from actual principal scene bounds. Provide overview, operator and robot/workcell
  views where useful, with one clear primary default.
- Keep all dimensions in SI metres and preserve the established Y-up coordinate convention.

## Non-goals and boundaries

- No arbitrary manual floor enlargement, cinematic camera system or new scenario family.
- No mesh-derived runtime, collision or telemetry authority.
- Do not conceal an invalid layout by weakening diagnostics or tolerances.

## Testing and validation

- Composition tests for no invalid overlap, reachable robot work targets, equipment within floor bounds,
  minimum service/operator/safety clearance and camera containment of principal cell bounds.
- Negative fixtures proving each diagnostic detects a real violation.
- Visual regressions for default and useful secondary views in all flagship cells.
- Re-run relevant asset/runtime performance and baseline gates after composition changes.

## Acceptance criteria

1. All five cells pass measured overlap, bounds, reach and clearance checks.
2. Conveyor, robot, fixture, pallet, fence and operator-access relationships are believable and functional.
3. Default cameras frame principal bounds without clipping or excessive dead space.
4. Optional operator and robot/workcell views are derived from scene data and remain deterministic.
5. `cellFootprints`/`cellLayout` remain authoritative; no parallel layout mechanism is introduced.

## Evidence expected for completion

Record derived dimensions, diagnostics, reach/clearance results, camera-containment tests, representative
captures and all applicable quality gates.

