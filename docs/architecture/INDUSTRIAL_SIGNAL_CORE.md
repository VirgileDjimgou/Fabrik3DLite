# Industrial signal core

The industrial signal core is the protocol-independent, versioned representation of machine I/O delivered by S31. It decouples equipment behaviour from controllers: equipment declares typed signals, a deterministic registry validates and arbitrates values, and future transports (OPC UA, MQTT, Modbus) map wire data onto the same vocabulary instead of leaking protocol concepts into the equipment model.

The reference implementation lives in the simulator at `Fabrik3D/fabrik3d.client/src/signals/`. It is pure TypeScript with no Vue, Three.js, browser or network dependency, so it is unit-testable and can be reused by future adapters.

## Position in the architecture

```text
Equipment definition (EquipmentDefinition.signals)
        │
        ▼
Industrial signal core  ──  SignalRegistry (types, quality, arbitration, staleness)
        │
        ├── Simulation runtime   (S32 binding: runtime publishes and consumes signals)
        ├── External controller  (S33-S36 adapters map wire data onto signals)
        └── Live machine         (S33-S35 observed twin values)
```

The signal core is equipment I/O, not a distributed state authority. The ASP.NET Core orchestrator stays the orchestration source of truth, and the simulator remains the execution and visualization layer.

## Schema of record (version 1.0)

`SIGNAL_SCHEMA_VERSION = '1.0'`.

### SignalDefinition

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Stable id, pattern `[A-Za-z0-9][A-Za-z0-9._-]*`. Bridge convention: `<equipmentId>.<name>`. |
| `equipmentId` | string | yes | Owner equipment instance. |
| `name` | string | yes | Machine name, unique per equipment. |
| `displayName` | string | yes | Human label; engineering metadata, not localized here. |
| `description` | string | no | Purpose and expected behaviour. |
| `direction` | `input-to-controller` \| `output-from-controller` \| `internal` \| `telemetry-only` | yes | Relative to the controller boundary. |
| `dataType` | `bool` \| `int` \| `uint` \| `float` \| `enum` \| `string` | yes | Strings are only justified for identifiers/recipes, never for numeric process values. |
| `engineeringUnit` | string | no | SI unit string where a physical quantity exists. |
| `writable` | boolean | yes | Controller/operator origins are rejected when false. |
| `min` / `max` | number | no | Numeric ranges only; validated against the default value. |
| `enumValues` | string[] | enum only | Unique, non-empty for enums. |
| `defaultValue` | boolean \| number \| string | yes | Seeded at registration with `uncertain` quality. |
| `safeValue` | boolean \| number \| string | no | De-energized/safe state used by future degraded-mode policy. |
| `semanticCategory` | `command` \| `status` \| `measurement` \| `safety` \| `diagnostic` \| `configuration` | no | Semantic grouping for UI/mapping filters. |
| `staleAfterMs` | number | no | Read-time staleness threshold; falls back to the registry default. |

### SignalSample

| Field | Type | Notes |
|---|---|---|
| `signalId` | string | References the definition. |
| `value` | boolean \| number \| string | Type-validated on every update. |
| `quality` | `good` \| `stale` \| `bad` \| `uncertain` \| `invalid` | Never upgraded silently. |
| `source` | `commanded` \| `simulated` \| `observed` \| `replay` | Mirrors the normalized twin sources. |
| `origin` | `simulation` \| `controller` \| `scenario` \| `fault-injection` \| `operator` \| `import` \| `replay` | What produced the value. |
| `timestamp` | string | ISO 8601 UTC. |

## Direction semantics

- `input-to-controller`: a sensor/feedback value an external controller reads (for example `conveyor-1.PhotoeyeStation`).
- `output-from-controller`: an actuator command the controller writes (for example `robot-1.Start`).
- `internal`: equipment-internal state that is not part of the controller contract.
- `telemetry-only`: observation and diagnostics; never writable as a command.

## Quality model

| Quality | Meaning |
|---|---|
| `good` | Fresh value from an accepted update. |
| `stale` | Derived at read time when a `good` value is older than the staleness threshold. The stored sample is not modified. |
| `bad` | The producer reported a bad value (for example a disconnected sensor). Propagated unchanged. |
| `uncertain` | Initial value after registration, before any real update. |
| `invalid` | Reserved for values that failed integrity checks downstream. |

Mapping to the twin model (`src/twin`): `good`/`stale` map directly; `bad` and `uncertain` are more granular and should be surfaced as `degraded` availability by consumers, never silently coerced to `good`.

## Source arbitration

Sources use the same priority as the normalized twin store:

```text
commanded (0)  <  replay (1)  <  simulated (2)  <  observed (3)
```

An update is rejected when:

1. `timestamp` is not a valid ISO date (`invalid-timestamp`);
2. `timestamp` is older than the stored sample (`stale-timestamp`);
3. the timestamp is equal and the incoming source has a lower priority (`lower-priority-source`);
4. a `controller` or `operator` origin writes a `writable: false` signal (`not-writable`);
5. the value does not match the declared data type (`type-mismatch`), range (`out-of-range`) or enum (`invalid-enum`);
6. the quality is not a known quality (`invalid-quality`).

Rejected updates never mutate the stored sample.

### Authority context (S36)

Source arbitration decides *which value wins* for a signal. Control authority decides *who may drive
an actuator*; it is a separate concern documented in
[`CONTROL_AUTHORITY.md`](./CONTROL_AUTHORITY.md). When a value is produced under an authority (for
example the external-controller closed loop), the sample carries an optional `authorityScope` and
`authorityMode` so a trace can be correlated to the authority that allowed it. The C# mirror stores
the same optional fields. Authority never changes the source priority rules above.

## Determinism guarantees

- Registration, definition listings and snapshots are stable-sorted by signal id.
- The registry uses an injectable clock; tests and replay obtain identical timestamps.
- Snapshot serialization uses a fixed key order, so the same registry always produces byte-identical output.
- No randomness, locale or wall-clock dependency exists in the core.

## Serialization and migration

`serializeSignalSnapshot` / `parseSignalSnapshot` implement a versioned document:

```json
{
  "schemaVersion": "1.0",
  "generatedAt": "2026-01-01T00:00:00.000Z",
  "signals": [
    {
      "signalId": "robot-1.ServoOn",
      "value": true,
      "quality": "good",
      "source": "simulated",
      "origin": "simulation",
      "timestamp": "2026-01-01T00:00:01.000Z"
    }
  ]
}
```

- Unknown/newer schema versions are rejected with diagnostics; documents are never partially applied.
- Older versions migrate through migrations registered with `registerSignalSnapshotMigration(from, to, migrate)`, applied in order and reported as `migration-applied` diagnostics.
- Malformed JSON, non-object roots, missing versions, invalid entries and migration failures produce explicit diagnostics and no snapshot.

## Equipment SDK integration

`EquipmentDefinition` gained an optional `signals?: EquipmentSignalDeclaration[]` field. Existing definitions without signals stay valid; `validateEquipmentDefinition` rejects duplicate names and invalid declarations (type, range, enum, default, safe value, staleness).

`signalDefinitionsForEquipment(definition, equipmentId?)` derives full definitions with stable ids (`<equipmentId>.<name>`, defaulting to the definition id), and `registerEquipmentSignals` registers them. `createReferenceCellSignalRegistry` walks the scene equipment registry and registers every declared signal under its scene instance id.

## Runtime binding pattern (S32)

`ReferenceCellSignalBinding` (`src/signals/binding.ts`) connects the reference-cell runtime to the registry without importing Vue or Three.js:

- **Readers**: on `tick()` the binding derives every status signal from the actual runtime (workflow phase and run state, CNC state and door position, conveyor belt/pallet state, simulated safety interlocks, active faults) and publishes them with `source: 'simulated'`, `origin: 'simulation'` and the current timestamp. A value that fails validation is skipped, never fabricated.
- **Writers**: `write(signalId, value, origin?)` requires a bound command signal, validates the value against the definition, asks the runtime to apply it, and only then records it with `source: 'commanded'`. A runtime refusal returns `runtime-rejected` and leaves the stored value and machine state unchanged.
- **Coverage**: `coverageDiagnostics()` reports declared signals with no reader/writer (`missing-writer`) or an equipment id the binding does not manage (`unbound-equipment`). The inspector displays them as an engineering warning.
- **Lifecycle**: the registry and binding are created per scene load in `SingleConveyorCellLayout.vue`; `onBeforeUnmount` disposes the binding and clears the registry so a scene reload never retains stale values. Command writes made by the workflow use `origin: 'simulation'`; operator actions use `origin: 'operator'`.

The complete signal table, drivers, units and routing are documented in [REFERENCE_SIGNAL_CATALOG.md](REFERENCE_SIGNAL_CATALOG.md).

## Deliberate deferrals

- **S33 (done)** introduced the first real transport (OPC UA) and mirrored this schema in C#: `Fabrik3D.Domain/Signals/IndustrialSignal.cs`, `Fabrik3D.Infrastructure/Signals/SignalMirrorStore.cs` and the OPC UA adapter described in [OPC_UA_ADAPTER.md](OPC_UA_ADAPTER.md). The C# mirror references this document, uses the same wire names/reason codes and is covered by drift tests; the schema documented here remains the contract of record.
- **S34/S35** map MQTT and Modbus onto the same mirror.
- **S38** applies fault overlays on top of canonical definitions without modifying them. `ReferenceCellSignalBinding` accepts an optional `SignalOverlayHook`; `tick()` applies the overlay chain to the value on its way out, and the canonical definition and stored sample stay untouched so removing an overlay restores the exact pre-fault value/quality. Overlays carry a deterministic seed for noise/intermittent/drift patterns. See [FAULTS_TIMELINE_REPLAY.md](FAULTS_TIMELINE_REPLAY.md) and [FAULT_LAB.md](FAULT_LAB.md).
- **S40/S41** historize and reconstruct samples through this model.

## Decision record (ADR summary)

**Context.** Equipment simulation is client-side; real controllers connect through server-side transports that browsers cannot open directly. Both sides must share one signal vocabulary.

**Decision.** Define the versioned signal schema once, implement the reference registry in the simulator, and defer the server-side mirror until the first transport needs it (S33) to avoid an unused abstraction. Protocol adapters map wire data to this model; they never leak protocol identifiers into equipment definitions.

**Consequences.** S31 has no backend changes and no dead server code. S33 must keep the C# mirror aligned with this document and add a drift test or generated contract. The registry is framework-independent, so connectors, faults, historian and replay can all reuse it.

**Alternatives considered.** (a) Server-side registry first: rejected because the simulator must work offline and carries equipment behaviour. (b) Generated shared TypeScript from C#: rejected because no server consumer exists yet and generated code would be unused.

## Verification

`npm --prefix Fabrik3D/fabrik3d.client run test` covers registration, duplicates, invalid definitions, type/range/enum validation, timestamp ordering, source arbitration, write policy, read-time staleness, deterministic snapshots/serialization, schema versioning, migration, source alignment with the twin model, equipment SDK integration and a bounded 10,000-signal benchmark.
