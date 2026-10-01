# S59 - Scenario-specific industrial 3D cells

## Outcome

Turn the existing industrial scenario presets into visually and functionally credible 3D scenarios, each containing the equipment its scenario logic actually requires, using the S58 scenario scene/runtime bindings.

## Motivation

S58 makes every `simulation-ready` scenario execute in a real Three.js scene. S59 gives each existing scenario the industrial equipment and visible behaviors that make its simulated logic understandable to an operator or learner, without expanding the scenario catalogue.

## Current-state assumptions to verify

- Inspect the five presets `vision-sorting`, `robot-palletizing`, `assembly-inspection`, `robot-safety-training` and `cnc-machine-tending`, their scenario definitions, expected events and existing equipment.
- Inventory existing generic assets, procedural fallbacks and `EquipmentAssetRuntime` usage.
- Record which scenario states are currently visible versus only logical.
- Confirm S58 resolution chain and host lifecycle are in place before extending them.

## Scope

Improve these existing cells only. Do not add more scene categories.

### Vision sorting

The 3D cell must visibly contain:

```text
infeed conveyor
inspection/vision station
camera/sensor
diverter
accepted bin
reject bin
control cabinet
HMI pedestal
workpieces
```

Animate from authoritative runtime events:

```text
part movement
inspection
classification
diverter
accepted/rejected routing
jam condition
recovery
```

### Palletizing

Include:

```text
6-axis robot
vacuum gripper
infeed conveyor
boxes/workpieces
empty pallet
completed pallet
buffers
fencing
light curtain
controller cabinet
```

Animate real pick → travel → placement → layer progression. The vacuum-loss scenario must visibly affect the cell.

### Assembly / inspection

Include:

```text
robot
fixture
clamps
part
inspection sensor/camera
assembly station
accepted/rework buffer
operator station
```

### Safety training

Include:

```text
robot
fence
interlocked gate
area scanner
E-stop
stack light
operator access area
safety zones
```

Gate, scanner and E-stop state changes must be visible.

### CNC machine tending

Keep the existing S39/S55 reference cell behavior and integrate it with the S58 runtime host without regressing its visuals or bindings.

## Rules

- Use the existing Equipment SDK and `EquipmentAssetRuntime`.
- Do not encode scenario truth in meshes.
- Runtime events remain authoritative; visuals bind to them.
- Add only industrial assets required by existing scenarios.
- Preserve `Definition ≠ Runtime ≠ Visual ≠ Collision ≠ Telemetry`.
- SI units internally; no new protocol, database or framework.

## Non-goals

- No new scenario categories or scenario ids.
- No change to scenario success criteria, difficulty or assessment.
- No photorealism pass; that is S60 scope.
- No asset that exists only for visual spectacle.

## Simulator and 3D changes

- Add the scenario-specific equipment composition data and bindings for the five cells.
- Bind animations to existing deterministic scenario events and equipment runtime state.
- Provide explicit visible states for normal, fault/jam, recovery and safety conditions already modeled by scenario logic.
- Keep procedural fallbacks for all critical assets.

## Backend and HMI changes

- None expected. Do not introduce visual-only server truth.
- HMI and scenario selection remain consistent with the rendered cell.

## Backward compatibility

- Existing scenario definitions, expected events, preselected equipment and camera behavior remain valid.
- Existing asset ids, manifests and fallbacks remain readable.

## Failure and degraded modes

- Missing scenario equipment asset falls back to the procedural visual without blocking scenario execution or changing events.
- Asset binding failures are diagnosed and isolated from scenario state.
- A scenario can still be selected and completed if an optional decorative asset is unavailable.

## Testing strategy

- Per-scenario composition tests asserting required equipment classes are present in the resolved cell.
- Binding tests proving visible state follows authoritative runtime events for each animated behavior.
- Fault/jam/recovery and safety-state visibility tests.
- Visual smoke coverage for all five cells.
- Existing scenario, equipment, collision and signal tests must remain green.
- Run applicable build/type-check/unit/visual/docs/security gates.

## Performance requirements

- Record per-cell triangles, draw calls, textures and frame timing; stay within the S60 budget direction.
- Five cells must coexist in the codebase without duplicating asset packages or loaders.

## Security and licensing considerations

- Only generic, license-safe assets; no OEM copies.
- Reuse the shared asset runtime and cache.

## Documentation changes

- Document each scenario cell inventory, its runtime bindings, visible fault/safety states and fallbacks.
- Keep implemented/visual claims accurate.

## Acceptance criteria

1. Each of the five existing scenario cells visibly contains the equipment listed for it.
2. Animated behaviors follow authoritative runtime events; no visual asset defines scenario truth.
3. Fault, jam/recovery and safety state changes are visibly represented where the scenario models them.
4. All five scenarios remain completable with unchanged events and outcomes.
5. No new scenario category, protocol, database or framework was introduced.
6. All applicable gates pass.

## Evidence expected for completion

Record per-scenario composition/binding test results, screenshots or captured frames for normal and fault states, resource measurements and the applicable quality gates.

## Rollback and failure containment

Each cell can fall back to the generic composition from S58 independently; scenario definitions and runtime events are untouched.

## Follow-up items

- Robot and industrial cell visual fidelity is S60.
- Deterministic visual QA for these cells is S62.
