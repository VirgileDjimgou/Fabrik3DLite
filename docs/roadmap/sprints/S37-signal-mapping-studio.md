# S37 - Signal mapping studio

## Outcome

Fabrik3D gains an engineering-oriented mapping experience that connects internal equipment signals to external controller addresses across OPC UA, MQTT, and Modbus: mapping list, protocol, source, target, direction, datatype, scaling, unit, connection status, quality, last update, validation, conflict detection, import/export, versioned files, deterministic serialization, migration, and human-readable diagnostics. A live signal monitor completes the workflow, and engineering screens stay separate from the operator HMI.

## Motivation

S33-S36 can move values but mapping them is currently hand-edited configuration. Real training and VC work needs a validated, inspectable, exportable mapping artifact and diagnostics that a technician can act on.

## Current-state assumptions to verify

- S33-S36 merged: connectors, signal mirror, authority service, and connector health surfaces exist.
- The simulator signal catalog from S32 is authoritative for internal signals.
- Cell files (S10) and mapping files follow a versioned, validated, non-executable pattern (`src/cell-files`, `docs/architecture/CELL_FILES.md`).
- The HMI is a separate app with its own routes; engineering surfaces live in the simulator.
- No mapping editor or live monitor exists.

## Scope

- Define a versioned mapping-file schema (`1.0`) covering:
  - mapping id/name/description;
  - protocol (`opcua` | `mqtt` | `modbus`);
  - internal signal id and equipment id;
  - external target descriptor per protocol (node id, topic + payload field, area/address/width/endianness/scaling/unit/signedness);
  - direction (read, write, read-write);
  - datatype and engineering unit;
  - enabled flag and notes.
- Implement deterministic serialize/parse with human-readable validation diagnostics; reject ambiguous endianness, unknown internal signals, duplicate targets where unsafe, direction incompatible with signal `writable`, and unsupported protocol/version.
- Implement conflict detection: two mappings writing the same external target, or mapping the same internal signal to incompatible targets, are flagged with severity and an explanation.
- Provide import/export and deterministic migration from a previous schema version; mappings are data, never executable code.
- Build the studio UI as an engineering surface in the simulator:
  - mapping list with protocol, source, target, direction, datatype, scaling, unit, connection status, quality, last update;
  - add/edit/remove/validate/import/export/save actions with target-confirmed destructive actions;
  - validation panel with errors/warnings and jump-to-row;
  - live signal monitor showing internal signals and external values with quality, source, timestamp, and health, filterable by equipment/protocol;
  - responsive at desktop (1280x800) and engineering laptop (1366x768) resolutions;
  - EN/FR/DE chrome; canonical engineering identifiers untranslated.
- Apply mappings to connectors through a validated server endpoint/file flow, respecting write policy and authority; no arbitrary code execution.
- Keep a strict boundary: engineering screens are reachable from the simulator engineering view only; the operator HMI gets no mapping controls (at most a read-only connector health summary if already designed in S17/S36 surfaces).

## Non-goals

- No free-form script/function mapping ("compute" expressions) in mapping files.
- No marketplace or cloud sync.
- No changes to operator HMI workflows.
- No new protocols beyond S33-S35.

## Architecture boundaries

- Mapping files are versioned data validated by a dedicated module; connectors consume validated mappings.
- Domain and connector code must not depend on UI.
- Mapping application is explicit; saving a file does not silently reconfigure a running connector without a documented apply/reload action.

## Domain and data model changes

- Mapping document types and (if persisted server-side) a versioned entity/store with optimistic concurrency and indexes.
- No changes to existing cell/signal schemas beyond additive references.

## Backend changes

- Mapping validation/serialization module (shared rules with the client where practical; document any duplication).
- Optional mapping persistence endpoints with validation and authorization placeholder consistent with existing boundaries.
- Connector reload/apply endpoint with health and audit; contracts regenerated.

## Simulator changes

- New `src/mapping/` module (schema, validation, conflicts, migration, deterministic serialization).
- Studio UI components, live monitor, and engineering route.
- Wiring to fetch/apply mappings and display connector health.

## HMI and UX changes

- Engineering UI follows the industrial design system: clear hierarchy, no decorative color, explicit pending/success/failure on apply, accessible form semantics, keyboard navigation.
- Operator HMI untouched except an optional read-only connector-health indication if it already exists.

## 3D and visual requirements

- Not applicable to the studio itself; the live monitor must not degrade 3D frame budget when open (measure).
- Visual regression coverage for studio screens at desktop and laptop sizes.

## Protocol and security requirements

- Mapping files cannot execute code and cannot reference arbitrary filesystem paths.
- Write mappings require explicit protocol write enable plus allow-list; the studio never bypasses server policy.
- Imported files are validated and size-bounded; traversal/absolute paths rejected.
- Diagnostics never leak secrets configured for connectors.

## Backward compatibility

- Connector configurations from S33-S35 remain valid; a mapping file can represent them.
- Existing cell files and signal catalogs unchanged.
- Operator HMI unchanged.

## Migration requirements

- Schema version `1.0` plus a registered migration path for a documented earlier shape (or a documented plan if none exists yet).
- Deterministic serialization (stable ordering, stable formatting) with a round-trip test.

## Failure and degraded-mode behavior

- Invalid mapping: cannot be applied; errors shown with row references; running connector keeps its previous validated mapping.
- Apply failure: explicit failure feedback and audit; no partial application.
- Connector unhealthy: mapping rows show disconnected/poor quality; values marked stale rather than fabricated.

## Testing strategy

- Unit tests: schema validation, deterministic round-trip, conflict detection, migration, direction/writable compatibility, protocol-descriptor validation, endianness rules.
- Integration tests: apply a validated mapping against the connector fixtures from S33-S35 and observe internal↔external value flow.
- Component tests: mapping list, validation panel, live monitor filtering, apply feedback.
- E2E: import → validate → fix conflict → apply → live monitor shows value → export round-trip.
- Visual regression at desktop/laptop.
- Security tests: malformed/oversized mapping, path traversal attempts, unknown protocol, executable-looking payloads rejected.

## Performance requirements

- Studio list renders 500 mappings within the documented interaction budget; validation of 500 mappings stays below a recorded bound.
- Live monitor updates are throttled/coalesced; no measurable impact on simulator frame time when open.

## Security considerations

- Treat mapping files as untrusted input: size bounds, schema validation, no execution, no paths.
- Authorization: mapping apply is a privileged engineering action; until S42, use the documented placeholder boundary and do not expose it publicly by default.

## Documentation changes

- New `docs/architecture/SIGNAL_MAPPING_STUDIO.md` (schema, validation rules, conflicts, apply/reload, security model, examples for OPC UA/MQTT/Modbus).
- Update connector docs with mapping examples; update `README.md`.
- Include a sample mapping file for the reference cell.

## Acceptance criteria

1. A valid mapping file imports, validates, serializes deterministically, round-trips, exports, and applies to a connector fixture with observed value flow.
2. Invalid mappings (ambiguous endianness, unknown signal, unwritable write direction, duplicate unsafe target) are rejected with row-level diagnostics.
3. Apply is explicit, reports pending/success/failure, and never partially applies.
4. Live monitor shows value, quality, source, timestamp, and connector health, filtered by equipment/protocol.
5. Mapping files cannot execute code, traverse paths, or bypass write policy.
6. Studio UI is usable at 1280x800 and 1366x768, keyboard accessible, EN/FR/DE.
7. All builds, unit/integration/E2E tests, contracts, and visual regression pass.

## Evidence expected for completion

```text
simulator type-check/test/build (N passed, including mapping + component tests)
E2E mapping workflow evidence
connector fixture value-flow evidence
visual regression results at both resolutions
npm run contracts:check (pass)
HMI gates (pass)
dotnet build/test (pass)
security tests for mapping import
```

## Rollback and failure containment

Mapping application is explicit and versioned; reverting the mapping file restores the previous connector behavior. Studio is isolated in `src/mapping` and engineering routes; removing it does not affect operator or workflow code.

## Follow-up items that must not leak into this sprint

- Signal fault overlays and advanced diagnostics (S38).
- Historian/time travel (S40/S41).
- Authentication/RBAC hardening (S42).
