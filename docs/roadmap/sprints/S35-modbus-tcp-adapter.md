# S35 - Modbus TCP adapter

## Outcome

Fabrik3D gains a proper Modbus TCP integration suitable for PLC training: configurable mapping between Fabrik3D signals and coils, discrete inputs, input registers, and holding registers, with explicit addressing, data width, endianness, scaling, signedness, and engineering-unit conversion. No byte order is ever guessed. Client and server roles, if both exist, stay clearly separated.

## Motivation

Modbus TCP is the most accessible protocol for PLC training labs and low-cost hardware. The core domain must stay protocol-independent while trainees connect a real or simulated PLC to the virtual cell.

## Current-state assumptions to verify

- S33/S34 delivered the server-side signal mirror and connector health/pattern.
- No Modbus library is referenced; `Fabrik3D.Infrastructure` has no Modbus code.
- Equipment signals are declared in the simulator; the server mirror is the transport-facing view.
- Tests can use Testcontainers/Docker fixtures and must not require proprietary software.

## Scope

- Research and document the transport role(s) justified by training/commissioning scenarios (client/polling master, server/slave endpoint, or both). Record the decision in an ADR. If both roles are implemented, keep them in clearly separated classes and configuration.
- Implement the adapter with a maintained .NET Modbus TCP library compatible with .NET 8, or a small, well-tested implementation if licensing/maintenance constraints require it; document the choice.
- Provide a versioned mapping configuration between Fabrik3D signals and Modbus points:
  - area (coil, discrete input, input register, holding register);
  - zero-based vs one-based address convention stated explicitly;
  - unit/slave id;
  - data width (1, 16, 32, 64 bit as applicable);
  - endianness policy (byte order and word order) stated per point; never inferred;
  - scaling (gain/offset) and engineering-unit conversion with documented direction;
  - signedness for integer points;
  - bit mapping for booleans in registers where applicable;
  - read/write direction;
  - quality/stale policy and polling interval.
- Integrate with the signal mirror: reads map into `observed`; writes are allowed only for writable, allow-listed points and only when writes are explicitly enabled.
- Implement health/diagnostics: connection state, poll latency, error counters, illegal address handling, timeout handling, reconnect.
- Provide a deterministic Modbus fixture (Docker Testcontainers image or a small purpose-built fixture project used only by tests) and document it.
- Add REST/SignalR-visible connector health consistent with S33/S34.

## Non-goals

- No Modbus RTU/serial support.
- No assumption about vendor register maps; all maps are user configuration.
- No control arbitration (S36) or mapping studio (S37).
- No claim of conformance certification; document "based on the public Modbus TCP specification".

## Architecture boundaries

- Adapter is Infrastructure; Domain stays protocol-free.
- Mapping files are data, never executable code.
- Address/endianness/scaling transforms are pure functions with unit tests.
- Fail closed: writes disabled by default.

## Domain and data model changes

- Versioned Modbus mapping schema (with migration strategy) and its validation rules.
- Integration into the S33/S34 signal mirror.

## Backend changes

- New package or fixture project, connector classes (client/server kept separate if both), mapping parser/validator, scaling/endianness codec, DI and hosted-service lifecycle, health endpoints/DTO additions, tests.

## Simulator changes

None required beyond regenerated contracts.

## HMI and UX changes

None in S35. The mapping studio (S37) will later edit this configuration through validated files, not arbitrary code.

## 3D and visual requirements

Not applicable.

## Protocol and security requirements

- Writes disabled by default with explicit enable flag and per-point allow-list.
- Mapping validation rejects ambiguous endianness, overlapping points where unsafe, out-of-range addresses, invalid widths/scales.
- Timeouts and illegal addresses never crash the server.
- Reload of mapping configuration is explicit and versioned; no silent hot-swap that could change semantics mid-cycle.

## Backward compatibility

- No existing Modbus behavior exists to preserve; new configuration is additive.
- Other connectors and contracts stay compatible.

## Migration requirements

- Mapping files carry `schemaVersion`; older versions migrate deterministically through the same migration pattern as S31 cell files.
- Document address convention migrations explicitly.

## Failure and degraded-mode behavior

- PLC unavailable: connector reports `Degraded`/`Error`, retries, values become `stale` after the configured policy, never fabricated.
- Illegal address/timeout: per-point diagnostics; connector continues with remaining points where safe.
- Disconnected PLC: writes fail visibly; no silent fallback to another authority.
- Shutdown: close connections and cancel polling.

## Testing strategy

- Unit tests: mapping validation, address conventions, endianness codec (byte/word order), scaling, signed/unsigned, boolean bit mapping, range checks, invalid configuration.
- Integration tests with the fixture:
  - connect/disconnect/reconnect;
  - read/write coils, discrete inputs, input registers, holding registers;
  - illegal address;
  - timeout behavior;
  - Boolean mapping;
  - signed and unsigned values;
  - 32-bit floats if supported by the chosen width policy;
  - disconnected PLC;
  - write policy rejection/acceptance.
- Deterministic tests must not depend on wall-clock randomness.

## Performance requirements

- Poll cycle for the documented point count stays within the configured interval on CI-class hardware; record measured latency and jitter.
- No unbounded queues; overlapping polls are prevented.

## Security considerations

- Fail-closed writes; no broadcast writes unless explicitly configured and documented.
- No credentials in mapping files; network endpoints are configuration.
- Input validation on every received frame before mapping.

## Documentation changes

- Add `docs/architecture/MODBUS_TCP_ADAPTER.md` (role decision, mapping schema, endianness rules, scaling, write policy, fixtures, limitations).
- Add an ADR for the client/server role decision.
- Update `README.md` accurately.
- Document the fixture and CI invocation.

## Acceptance criteria

1. Mapping validation rejects missing/ambiguous endianness, invalid addresses, invalid widths, invalid scale, and overlapping unsafe points with actionable diagnostics.
2. Integration tests prove connect, address-level reads/writes for all four areas, reconnect, illegal address handling, timeout handling, Boolean/signed/unsigned/scaled mapping, and write policy.
3. Default configuration keeps the adapter disabled and writes disabled.
4. Core domain contains no Modbus types or register addresses.
5. `dotnet build`/`dotnet test` pass with the fixture; frontend gates and contracts check pass.

## Evidence expected for completion

```text
dotnet build Fabrik3D/Fabrik3D.slnx (0 warnings 0 errors)
dotnet test Fabrik3D/Fabrik3D.slnx (N passed, listing Modbus integration tests)
fixture evidence (image/project, log excerpt)
npm run contracts:check (pass)
frontend gates (pass)
recorded poll latency measurements
```

## Rollback and failure containment

Adapter disabled by default; reverting the package and connector restores the previous behavior with no persisted impact. Fixture failures must fail or explicitly skip integration tests, never silently pass.

## Follow-up items that must not leak into this sprint

- External controller authority/handover (S36).
- Mapping studio UI, import/export, conflict detection (S37).
- Fault injection over fieldbus (S38).
