# S31 - Versioned industrial signal model and I/O registry

## Outcome

The simulator gains a protocol-independent, versioned Industrial Signal Core: typed signal definitions, a deterministic `SignalRegistry` with validation, quality, source arbitration and stale detection, integration with the existing equipment SDK, and deterministic serialization with a documented migration strategy. Equipment behavior still runs exactly as today; S32 is the sprint that binds the reference cell to signals.

## Motivation

Today the reference cell moves through scripted workflow phases and exposes at most an ad-hoc boolean `sensor-state` event. There is no canonical representation of machine I/O, so no real controller, fault overlay or historian can observe or influence the machine through explicit signals. The Industrial Signal Core is the keystone that makes the S32-S50 work possible (equipment binding, OPC UA, MQTT, Modbus, external-controller arbitration, fault injection, historian, time travel).

## Current-state assumptions to verify

Before coding, verify in the repository (do not trust this list blindly):

- `Fabrik3D/fabrik3d.client/src/equipment/types.ts` defines `EquipmentDefinition`, `EquipmentPort`, `EquipmentInstance`, and `EquipmentRuntimeAdapter`; `validateEquipmentDefinition` and `EquipmentRegistry` live in `src/equipment/EquipmentRegistry.ts`.
- `Fabrik3D/fabrik3d.client/src/twin/types.ts` defines `TwinSource = 'commanded' | 'simulated' | 'observed' | 'replay'` and priority `{ commanded: 0, replay: 1, simulated: 2, observed: 3 }` in `src/twin/store.ts`, with `staleAfterMs` defaulting to 10 s.
- `src/equipment/materialFlow.ts` contains unwired `BinarySensorRuntime`, `BinaryActuatorRuntime`, and `ConveyorRuntime` primitives; `src/equipment/fixtures/singleConveyorCell.ts` defines the reference cell definitions.
- `src/equipment/ExtensionRegistry.ts` enforces that runtime installation is code-owned and trusted.
- Simulator imports are relative; the `@` alias exists but is only used for generated contracts. Strict TypeScript with `noUncheckedIndexedAccess` and `verbatimModuleSyntax` is enabled. Tests are co-located `*.test.ts` run by Vitest (jsdom).

If any assumption is false, record the divergence in the sprint completion summary and adapt the smallest compatible design.

## Scope

- Create `Fabrik3D/fabrik3d.client/src/signals/` with:
  - `types.ts`: `SIGNAL_SCHEMA_VERSION = '1.0'`, `SignalDataType` (`bool`, `int`, `uint`, `float`, `enum`, `string`), `SignalDirection` (`input-to-controller`, `output-from-controller`, `internal`, `telemetry-only`), `SignalQuality` (`good`, `stale`, `bad`, `uncertain`, `invalid`), `SignalSource` mirroring the twin sources, `SignalUpdateOrigin`, `SignalSemanticCategory`, `SignalDefinition`, `SignalSample`, `SignalSnapshot`, `SignalDiagnostic`, and type guards/validation helpers.
  - `SignalRegistry.ts`: deterministic register/update/read/snapshot with duplicate detection, definition validation, type/range/enum validation, writable-write-policy enforcement for controller/operator origins, timestamp ordering, source arbitration, and read-time stale marking using an injectable clock.
  - `serialization.ts`: deterministic snapshot serialization (sorted ids, fixed key order), parsing with schema-version validation, structured diagnostics, and a migration registry usable for future versions.
  - `equipmentBinding.ts`: `signalDefinitionsForEquipment(definition)` producing stable ids `<equipmentId>.<signalName>`, plus `registerEquipmentSignals(registry, definition)`.
  - `index.ts` barrel exporting the public surface.
- Extend `EquipmentDefinition` with an optional `signals?: readonly EquipmentSignalDeclaration[]` field and validate declarations in `validateEquipmentDefinition` without breaking existing definitions.
- Document signal semantics, arbitration rules, quality model, serialization, and migration in `docs/architecture/INDUSTRIAL_SIGNAL_CORE.md`, with the schema of record and a short ADR section for the client-side reference implementation.
- Keep the signal core free of Vue, Three.js, protocol clients, and browser-only APIs so it is unit-testable in Node and reusable by future adapters.

## Non-goals

- Do not bind the reference cell to signals (that is S32).
- Do not add OPC UA, MQTT, or Modbus code (S33-S35).
- Do not change workflow phases, kinematics, safety checks, scene presets, or HMI screens.
- Do not add a server-side signal mirror yet; the first server consumer arrives with S33, and duplicating the schema now would create dead code.
- Do not introduce a global store, event bus, or reactivity layer.

## Architecture boundaries

- The signal core is a pure, framework-independent TypeScript domain module in the simulator.
- It depends on `src/equipment` types (declarations live in `src/signals/types.ts`; `src/equipment/types.ts` imports these types). `src/signals` must not import Vue components or Three.js.
- The schema documented in `docs/architecture/INDUSTRIAL_SIGNAL_CORE.md` is the contract of record. S33+ may mirror it in C# DTOs, but must reference this document and must not silently diverge.
- The server remains the orchestration authority; the signal registry is equipment I/O, not distributed state authority.

## Domain and data model changes

- `SignalDefinition` metadata: `id`, `equipmentId`, `name`, `displayName`, `description?`, `direction`, `dataType`, `engineeringUnit?`, `writable`, `min?`, `max?`, `enumValues?`, `defaultValue`, `safeValue?`, `semanticCategory?`, `staleAfterMs?`.
- `SignalSample`: `signalId`, `value`, `quality`, `source`, `origin`, `timestamp` (ISO 8601 UTC).
- `SignalSnapshot`: `schemaVersion`, `generatedAt`, and deterministically ordered `signals`.
- No existing type is removed or renamed. The equipment SDK change is additive and optional.

## Backend changes

None. The .NET solution must still build and test unchanged. The C# signal mirror is deliberately deferred to S33, where a real transport becomes the first consumer; this is recorded in the architecture document to avoid an unused server abstraction.

## Simulator changes

- New `src/signals` module described above.
- `src/equipment/types.ts`: add optional `signals` to `EquipmentDefinition` and export `EquipmentSignalDeclaration` derived from the signal core.
- `src/equipment/EquipmentRegistry.ts`: validate declarations (unique names, valid ranges, default within range, enum values present) and keep registration of existing definitions byte-compatible.
- `src/equipment/index.ts`: re-export the new declaration type only.
- No component, workflow, or runtime behavior changes.

## HMI and UX changes

None in S31. A signal inspector is delivered in S32 and must not pollute the operator HMI.

## 3D and visual requirements

Not applicable: S31 introduces no visual or runtime behavior. Existing visual regression baselines must remain unchanged.

## Protocol and security requirements

- Signal definitions are data, never executable behavior.
- The registry rejects controller/operator writes to read-only signals and rejects malformed or out-of-range values; this is the seed of the S33+ write allow-list policy.
- Serialization accepts only JSON data with a supported `schemaVersion`; unknown newer versions are rejected with diagnostics rather than partially applied.

## Backward compatibility

- All existing equipment definitions remain valid because `signals` is optional.
- No import outside `src/signals` changes behavior.
- The HMI, workflows, scene presets, and generated contracts are untouched.

## Migration requirements

- Snapshot documents carry `schemaVersion`.
- A migration registry maps `from → to` versions; parsing applies registered migrations in order and reports each applied migration as a diagnostic.
- A migration test proves the mechanism with a fixture representing an older document shape; unsupported or downgrade versions are rejected.

## Failure and degraded-mode behavior

- Invalid definitions throw a typed `SignalRegistryError` at registration time (fail fast, no partially registered signal).
- Rejected updates return a structured rejection reason and leave the previous sample untouched.
- Read-time staleness never mutates the stored sample; it derives a `stale` quality for the caller.
- Parsing malformed JSON returns diagnostics and no snapshot.

## Testing strategy

Vitest unit tests co-located in `src/signals/`:

- duplicate ids and duplicate equipment signal names;
- invalid definitions (empty id, non-finite bounds, `min > max`, default out of range, enum without values);
- type mismatches (`int` with `1.5`, `uint` with `-1`, `bool` with `1`, non-finite `float`);
- range and enum validation;
- updates from older timestamps and equal-timestamp lower-priority sources;
- read-time stale detection with an injected clock;
- writable policy for controller/operator origins;
- discovery by equipment and stable id;
- deterministic snapshot/serialization independent of insertion order;
- schema-version handling: round-trip, unknown version rejection, registered migration application;
- compile-time/style assertion that `SignalSource` stays aligned with `TwinSource`;
- equipment SDK integration: declarations validate, existing fixtures remain valid, bridge ids are stable.

## Performance requirements

- Update and read are O(1) map operations; snapshot is O(n log n) due to deterministic sorting.
- Add a bounded benchmark test proving 10,000 signals register and snapshot in under [to be measured and recorded] ms on the CI-class machine, without flaky absolute thresholds in normal test runs.

## Security considerations

- No secrets, credentials, endpoints, or certificates are introduced.
- No `eval`, dynamic import, or executable payload in serialized data.
- String signals are supported only when justified; documentation must list the intended engineering use cases and the registry must still enforce declared enum constraints when `dataType` is `enum`.

## Documentation changes

- Add `docs/architecture/INDUSTRIAL_SIGNAL_CORE.md` (purpose, schema tables, direction semantics, quality/source model, arbitration rules, determinism guarantees, serialization example, migration strategy, deliberate deferrals, ADR note).
- Update `README.md` "What is implemented" with one accurate bullet about the simulator-side signal core and keep existing claims unchanged.
- Update `docs/roadmap/README.md` phases if needed for phase 8 context (already updated by the roadmap bootstrap).

## Acceptance criteria

1. `npm --prefix Fabrik3D/fabrik3d.client run type-check` passes.
2. `npm --prefix Fabrik3D/fabrik3d.client run test` passes including at least 25 new signal tests covering every bullet in the testing strategy.
3. `npm --prefix Fabrik3D/fabrik3d.client run build` passes.
4. Serializing the same registry twice, regardless of insertion order, produces byte-identical output.
5. Updating a read-only signal with `origin: 'controller'` is rejected with reason `not-writable` and does not change the stored sample.
6. An out-of-order or equal-timestamp lower-priority update is rejected and the existing sample is preserved.
7. `validateEquipmentDefinition` rejects duplicate or invalid signal declarations while every existing fixture still validates.
8. The .NET solution builds and tests unchanged (`dotnet build`/`dotnet test`) and generated contracts are unchanged.
9. Existing visual regression baselines (`test:visual`) still pass.

## Evidence expected for completion

Record the exact command output in the completion evidence, for example:

```text
npm --prefix Fabrik3D/fabrik3d.client run type-check (pass)
npm --prefix Fabrik3D/fabrik3d.client run test (N passed, including M new signal tests)
npm --prefix Fabrik3D/fabrik3d.client run build (pass)
npm --prefix Fabrik3D/fabrik3d.client run test:visual (N passed)
npm --prefix Fabrik3D/fabrik3d.hmi run type-check/test/build (pass)
dotnet build Fabrik3D/Fabrik3D.slnx (0 warnings 0 errors)
dotnet test Fabrik3D/Fabrik3D.slnx (N passed)
npm run contracts:check (pass)
```

Do not claim a gate that was not executed.

## Rollback and failure containment

The signal core is additive and unimported by the running application, so rollback is limited to reverting the new module, the optional equipment field, and the documentation. No persisted data or contract is involved.

## Follow-up items that must not leak into this sprint

- Binding the reference cell to signals, runtime adapter signal contracts, and the signal inspector (S32).
- Server-side signal mirroring and REST/SignalR contracts (S33).
- Protocol adapters, control arbitration, mapping studio (S33-S37).
- Historian and replay of signal values (S40-S41).
