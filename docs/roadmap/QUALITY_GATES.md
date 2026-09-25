# Quality gates

## Definition of done for every sprint

- The current implementation was inspected before changes were made, including `git status --short`.
- Existing public behavior is preserved or an explicit migration is documented.
- Acceptance criteria in the sprint brief are satisfied.
- New logic has automated tests at the lowest useful level.
- Relevant application builds and type checks pass.
- Error paths and boundary conditions are covered.
- Documentation and examples reflect the resulting implementation.
- Generated artifacts and dependencies are not committed unless intentionally required.
- Evidence records the exact commands executed and their real results; skipped mandatory checks are reported as skipped, never as passed.
- A sprint is not completed while a mandatory gate fails; pre-existing unrelated failures are reported separately with evidence and are not silently attributed to the sprint.
- A protocol mocker, stub or placeholder is never described as a live integration; documentation distinguishes implemented, experimental, planned, simulated and live.

## Anti-fabrication rules

- Never invent test output, screenshots, benchmark numbers or connector evidence.
- Never mark a sprint complete based on intent or partial work.
- Never hide a failing gate behind documentation changes.
- Never claim safety certification, OEM emulation, IEC/ISA compliance or production readiness without corresponding evidence.
- Never present generated or synthetic industrial data as real machine data.

## Test layers

| Layer | Preferred tools | What it validates |
|---|---|---|
| Backend unit | xUnit | State transitions, validation, mapping, domain rules |
| Backend integration | xUnit + isolated MongoDB/Testcontainers | Repositories, controllers, persistence, concurrency |
| Frontend unit | Vitest | Services, stores, formatting, state reducers |
| Vue components | Vitest + Vue Test Utils | HMI and simulator component behavior |
| End-to-end | Playwright | HMI → server → simulator workflows |
| Geometry/robotics | Vitest with numeric tolerances | Frames, FK/IK, limits, reachability, collision primitives |
| Contract | OpenAPI/schema tests | C# and TypeScript payload compatibility |
| Visual regression | Playwright screenshots | HMI hierarchy, responsive layouts, simulator overlays |
| Performance | Targeted benchmarks with recorded numbers | Render loop, event throughput, database query latency, signaling throughput, memory stability |
| Connector integration | Docker-based test fixtures | OPC UA/MQTT/Modbus reconnect, mapping, invalid payloads, write policy |
| Signal engine | Vitest with deterministic clocks | Types, ranges, quality, staleness, source arbitration, serialization, migration |
| External controller | Fixture controller + Playwright/xUnit E2E | Closed loop, exclusive authority, handover, loss-of-controller |
| Historian | xUnit + Testcontainers MongoDB | Retention, indexes, bounded growth, reconstruction correctness |
| Authentication/tenancy | xUnit integration + mocked OIDC | Server-side authorization, tenant isolation, negative tests |
| Accessibility/UX | Automated checks + manual keyboard/contrast review | WCAG 2.2 AA aims, i18n completeness, loading/error/empty/offline states |
| Security | Dependency audits, secret scan, negative tests | CORS, authz, input validation, traversal, upload validation, write policies |

## Baseline commands

These commands are the target baseline. Early stabilization sprints may create or repair missing commands.

```powershell
node scripts/sprint-runner.mjs validate
dotnet build Fabrik3D/Fabrik3D.slnx
dotnet test Fabrik3D/Fabrik3D.slnx
npm run contracts:check
npm --prefix Fabrik3D/fabrik3d.client run type-check
npm --prefix Fabrik3D/fabrik3d.client run test
npm --prefix Fabrik3D/fabrik3d.client run build
npm --prefix Fabrik3D/fabrik3d.client run test:visual
npm --prefix Fabrik3D/fabrik3d.hmi run type-check
npm --prefix Fabrik3D/fabrik3d.hmi run test
npm --prefix Fabrik3D/fabrik3d.hmi run build
npm --prefix Fabrik3D/fabrik3d.hmi run test:e2e
```

Sprints whose scope touches connectors, deployment, hardening or the 1.0 baseline additionally require:

```powershell
npm run audit
npm run security:scan
docker compose -f Fabrik3D/compose.production.yaml config --quiet
docker compose -f Fabrik3D/compose.production.yaml up --build   # where the environment supports it
```

Connector integration fixtures (OPC UA, MQTT, Modbus) must be started by the tests themselves (Testcontainers or an equivalent documented automated fixture). A hand-started broker is not acceptable evidence for a mandatory gate.

If a command does not exist yet, the sprint responsible for that test layer must add it. Until then, record the missing gate explicitly rather than claiming success.

## Robotics-specific invariants

- SI units internally: meters, radians, seconds, kilograms.
- Coordinate transforms are explicit and testable.
- Joint values remain inside declared limits.
- Reachability failure is reported, not approximated silently.
- Collision tests use deterministic geometry and documented tolerances.
- Visual meshes are not treated as the only source of collision geometry.

## HMI-specific invariants

- Color communicates status rather than decoration.
- Critical actions identify the target job/cell before confirmation.
- Text remains readable in English, French, and German.
- Operator actions provide success, pending, and failure feedback.
- Core views are keyboard accessible and usable on target touch-panel sizes.

## 3D asset-specific invariants

- Visual meshes remain replaceable and do not become the runtime or orchestration source of truth.
- Every asset declares meters, Y-up orientation, origin convention, version, license, bounds, and required semantic nodes.
- Detailed visual meshes and deterministic collision proxies remain separate.
- Missing or invalid assets fall back to the existing procedural representation with a useful diagnostic.
- Asset loaders cache shared resources and dispose instance-owned resources without leaking GPU memory.
- LOD, texture, draw-call, and frame-time budgets are measured on the documented reference scene.
- Visual regression screenshots cover the reference cell and state-dependent safety colors.

## Scene-library invariants

- A scene preset is versioned data and never executes arbitrary code.
- Scene, scenario, runtime behavior, collision authority, and visual asset remain separate concerns.
- Loading a new scene disposes the previous scene's listeners, animation callbacks, GPU instances, and transient runtime state.
- Equipment connects through declared material, signal, safety, energy, or data ports and semantic anchors.
- Layout-only equipment is visibly distinguished from simulation-ready equipment.
- The existing CNC reference cell remains a supported preset and compatibility baseline.

## Signal-engine invariants (S31+)

- Signals use stable ids and typed data; a value never changes type silently.
- Updates are deterministic: out-of-order timestamps and lower-priority sources are rejected without mutating stored state.
- Quality and staleness are explicit; a stale or bad value is never surfaced as good.
- Canonical signal definitions are immutable; fault overlays and mappings are separate, inspectable data.
- Serialization is deterministic and versioned; migrations are explicit and tested.
- A declared signal must have a real runtime driver; UI-only or fabricated signals are not accepted.
- Signals never bypass the workflow/safety guards they represent.

## Industrial-connector invariants (S33+)

- Every protocol is an optional adapter; no protocol type or node id leaks into the core domain.
- Connectors are disabled by default; writes are disabled by default and fail closed without an explicit allow-list.
- A real transport requires real fixture evidence: connect, disconnect, reconnect, subscription/read, write policy, malformed input, stale/bad quality, graceful shutdown.
- Mock-only tests do not satisfy a connector gate when an inexpensive Docker fixture can exercise the real protocol.
- Certificate validation never silently accepts arbitrary certificates; insecure development modes are explicit and documented.
- Retained or duplicated broker data never becomes trusted fresh state without a valid, fresh timestamp.
- Byte order, scaling, signedness and address conventions are explicit per mapping; never guessed.

## External-controller invariants (S36+)

- Exactly one control authority owns an actuator at a time; concurrent ownership fails closed.
- Handover is explicit, precondition-checked, audited and visible in the UI.
- Loss of an external controller never silently reverts to another authority during a cycle; the documented degraded mode applies.
- Replay is read-only and can never acquire authority or emit a protocol write.
- Fault injection never propagates arbitrary writes into live machinery.

## Historian and time-travel invariants (S40+)

- Storage is bounded by documented sampling and retention policies with intentional indexes.
- Stored records carry source, quality, timestamp and correlation id.
- Reconstruction is deterministic for identical inputs; interpolation and exactness are documented.
- Missing history is reported as a gap, never fabricated.
- Historian failure never breaks live orchestration.

## Authentication and tenancy invariants (S42+)

- Authorization is enforced server-side on every mutating endpoint and hub method; hidden UI is not a control.
- Tenant boundaries are enforced in server repositories/queries, never by client-side filtering.
- Development/test authentication cannot be mistaken for production security and is refused in Production.
- Audit records carry the authenticated subject and organization where applicable.
- Cross-organization access is rejected without leaking existence.

## Visual, UX and accessibility invariants

- HMI color communicates status, not decoration; critical actions identify their target and report pending/success/failure.
- Loading, empty, error, offline and degraded states are designed, not incidental.
- Operator, engineering and instructor personas use distinct surfaces; diagnostics are dense, operator screens are not.
- EN/FR/DE completeness is tested; no critical control is untranslated.
- Accessibility aims toward WCAG 2.2 AA: keyboard reachability, visible focus, labels, contrast, target sizes; findings are recorded.
- Every state-bearing visual derives from runtime state; decorative animation must not contradict the simulation.
- 3D performance is measured on documented reference hardware (frame time, draw calls, triangles, texture memory, memory stability) rather than asserted.

## Performance and security evidence

- Performance claims require recorded measurements with reference hardware/browser and methodology.
- Security statements require executed tests (dependency audits, secret scan, auth/authorization and tenant negative tests, upload/path validation, write-policy misconfiguration tests), not static inspection alone.
- Standards language uses "inspired by", "aligned with selected concepts" or "designed around" unless formal compliance has been established.
