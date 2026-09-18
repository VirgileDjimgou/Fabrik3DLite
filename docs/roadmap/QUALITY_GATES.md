# Quality gates

## Definition of done for every sprint

- The current implementation was inspected before changes were made.
- Existing public behavior is preserved or an explicit migration is documented.
- Acceptance criteria in the sprint brief are satisfied.
- New logic has automated tests at the lowest useful level.
- Relevant application builds and type checks pass.
- Error paths and boundary conditions are covered.
- Documentation and examples reflect the resulting implementation.
- Generated artifacts and dependencies are not committed unless intentionally required.

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
| Performance | Targeted benchmarks | Render loop, event throughput, database query latency |
| Connector integration | Docker-based test fixtures | OPC UA/MQTT reconnect, mapping, invalid payloads |

## Baseline commands

These commands are the target baseline. Early stabilization sprints may create or repair missing commands.

```powershell
dotnet build Fabrik3D/Fabrik3D.slnx
dotnet test Fabrik3D/Fabrik3D.slnx
npm --prefix Fabrik3D/fabrik3d.client run type-check
npm --prefix Fabrik3D/fabrik3d.client run test
npm --prefix Fabrik3D/fabrik3d.client run build
npm --prefix Fabrik3D/fabrik3d.hmi run type-check
npm --prefix Fabrik3D/fabrik3d.hmi run test
npm --prefix Fabrik3D/fabrik3d.hmi run build
```

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
