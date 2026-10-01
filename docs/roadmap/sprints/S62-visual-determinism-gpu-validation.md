# S62 - Deterministic visual QA and real GPU validation

## Outcome

Make visual evidence reproducible and produce honest, hardware-rendered performance numbers with the existing S56 performance infrastructure.

## Motivation

Visual snapshots that depend on previous test runs or shared backend state create false confidence and noise. Product credibility requires that a screenshot reproduces from a clean state, and that performance claims distinguish real GPU rendering from software rendering.

## Current-state assumptions to verify

- Inspect the existing visual-test suites, snapshot baselines, shared fixtures and known HMI snapshot nondeterminism.
- Inspect the S56 performance infrastructure, acceleration classification and performance-run result format.
- Record which tests currently depend on prior state or a shared database.

## Scope

### Deterministic screenshots

Every visual test must follow:

```text
reset
→ deterministic database/state seed
→ deterministic scene/scenario
→ wait until UI ready
→ freeze expected state
→ screenshot
```

No snapshot may depend on a previous test run. Resolve the existing HMI snapshot nondeterminism rather than updating baselines blindly.

Add representative visual regression for:

```text
CNC cell
vision sorting
palletizing
assembly
safety training
HMI overview
Job Composer
Robot
```

### Real GPU benchmark

Reuse existing S56 performance infrastructure. Add a manually runnable hardware-accelerated browser benchmark. Record:

```text
renderer
resolution
quality profile
FPS
frame p50
frame p95
frame p99
draw calls
triangles
textures
renderer memory where available
load duration
```

Profiles:

```text
Performance
Balanced
Quality
```

At minimum test the hero CNC cell and the most complex secondary scenario.

## Non-goals

- No baseline update without a root cause.
- No Meshopt/Draco/KTX2 unless measurements demonstrate a real need.
- No software rendering presented as GPU evidence.
- No new visual-test framework; extend the existing one.

## Architecture boundaries

- Visual tests remain evidence, not runtime authority.
- Benchmark instrumentation remains read-only and does not alter simulation state or contracts.
- Deterministic seeding uses existing test/demo fixtures; it never touches production profiles.

## Changes

- Add an explicit reset/seed/wait/freeze/screenshot helper or fixture used by all visual tests.
- Fix the HMI shared-state contamination currently affecting snapshot stability.
- Add the representative visual regression set.
- Add the manual hardware benchmark command with machine-readable output and honest acceleration classification.
- Document how to run and interpret the benchmark.

## Backward compatibility

- Existing visual tests are migrated to the deterministic pattern, not deleted.
- Existing performance harness and metrics remain usable.

## Failure and degraded modes

- On a software renderer or unavailable WebGL, the benchmark reports the classification and does not claim GPU numbers.
- Unsupported quality profile falls back to a supported measured profile and records the fallback.
- Visual tests fail closed on a non-deterministic wait rather than capturing a wrong state.

## Testing strategy

- A test proving a snapshot is identical when taken first or after another scenario/test.
- A test proving reset/seed removes prior job/task/machine state from the captured view.
- Benchmark result schema validation and acceleration-classification tests.
- All existing unit/integration/visual/E2E gates remain green.
- Run applicable build/type-check/unit/visual/docs/security gates.

## Performance requirements

- Record the full metric set for the hero CNC cell and the most complex secondary scenario across Performance/Balanced/Quality.
- Report frame p50/p95/p99 and load duration with the actual resolution and renderer string.
- Keep the benchmark reproducible on the documented reference machine.

## Security and licensing considerations

- Benchmark output must not include secrets, tokens or machine-identifying personal data.
- Demo seeding data is deterministic and contains no production or personal data.

## Documentation changes

- Document the deterministic visual-test protocol, baseline ownership, benchmark command, profiles, recorded results and explicit non-claims about software rendering.

## Acceptance criteria

1. Every visual test follows reset → deterministic seed → deterministic scenario → ready wait → freeze → screenshot.
2. No snapshot depends on a previous test run; the former HMI nondeterminism is root-caused and fixed.
3. Representative visual regression exists for the eight listed surfaces.
4. A manually runnable benchmark records the full metric set for three quality profiles on at least the hero CNC cell and the most complex secondary scenario.
5. Software rendering is never classified as GPU evidence.
6. No Meshopt/Draco/KTX2 was introduced without measured justification.
7. All applicable gates pass.

## Evidence expected for completion

Record deterministic reruns in both orders, benchmark output with renderer/resolution/profile/frame percentiles and resource counts, classification results, and the applicable quality gates. Never fabricate GPU results.

## Rollback and failure containment

The benchmark is additive and manual; visual tests keep their prior baselines until the deterministic version is proven stable.

## Follow-up items

- Frontend OIDC and public demo isolation are S63.
