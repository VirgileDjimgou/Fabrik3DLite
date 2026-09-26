# CODESYS / SoftPLC interoperability showcase (S46)

An educational, reproducible showcase of a **real external controller** (CODESYS or any IEC 61131-3
SoftPLC) driving the Fabrik3D CNC reference cell through **Modbus TCP**, closing the loop:

```text
controller output ─▶ Fabrik3D virtual actuator ─▶ virtual sensor ─▶ controller input
(holding registers)   (showcase.cell.* signals)   (position/status)  (holding registers)
```

The showcase is built entirely on the adapters and arbitration already shipped in S33–S39:

| Capability | Shipped in | Used as |
| --- | --- | --- |
| Real Modbus TCP client connector (disabled by default, fail-closed writes) | S35 | transport |
| Versioned mapping schema / validator / projection | S37 | the committed I/O map |
| Exclusive control authority, lease, degraded mode | S36 | ownership of the cell during the run |
| Reference-cell signals and deterministic sequence | S32/S39 | virtual cell behavior |
| In-process Modbus TCP fixture | S35 | automated CI substitute for a real PLC |

## What this package contains

| File | Purpose |
| --- | --- |
| [`io-map.json`](./io-map.json) | The committed, versioned (schema `1.0`) S37 mapping document: Fabrik3D signal ↔ Modbus holding register. It is the single source of truth the automated fixture projects into the connector. |
| [`io-map.md`](./io-map.md) | Human-readable I/O table, direction/endianness conventions and the per-signal meaning. |
| [`plc-program.md`](./plc-program.md) | A self-authored IEC 61131-3 Structured Text reference program implementing the sequence, with license/attribution notes. |
| [`setup.md`](./setup.md) | Step-by-step CODESYS / SoftPLC setup, protocol selection, security settings and write enablement. |
| [`sequence.md`](./sequence.md) | The expected state sequence: permissives, start, pallet detection, robot cycle, CNC cycle, completion, stop/fault, reset, controller loss. |
| [`evidence.md`](./evidence.md) | Captured automated-fixture evidence, recorded latency, authority audit, and the manual real-run validation checklist (explicitly marked as not executed in CI). |
| [`troubleshooting.md`](./troubleshooting.md) | Common problems and how to diagnose them from the connector diagnostics. |

## Supported configuration

- **Protocol:** Modbus TCP (client/polling master in Fabrik3D, server/slave role for the PLC). One
  unit id (`1`), zero-based holding registers. This is the only protocol exercised end to end in CI.
- **Mapping:** the committed [`io-map.json`](./io-map.json). OPC UA and MQTT entries could be added to
  the same schema and are supported by the mapping studio, but this showcase and its evidence use
  Modbus only.
- **Writes:** explicitly enabled and allow-listed for the nine showcase output signals only. Connectors
  remain **disabled by default**; nothing in this package changes the default posture.
- **Authority:** the PLC acquires `ExternalController` authority explicitly before driving (S36).

## Reproduce the automated substitute for CI (no CODESYS required)

```powershell
dotnet build Fabrik3D/Fabrik3D.Slnx
dotnet test Fabrik3D/Fabrik3D.Server.Tests/Fabrik3D.Server.Tests.csproj --filter "FullyQualifiedName~ReferenceCellShowcaseTests"
```

The four tests validate the committed I/O map, drive the full closed-loop sequence through the real
Modbus connector against the in-process fixture, prove authority acquire/release/loss, and prove the
write policy fails closed. See [`evidence.md`](./evidence.md) for captured output.

## Security posture (read this before enabling anything)

- Writes are enabled **only** for the showcase mapping and only for the exact allow-listed output
  signals. A signal that is not allow-listed, or a read-only input, is refused before any network
  traffic (see [`../architecture/MODBUS_TCP_ADAPTER.md`](../../architecture/MODBUS_TCP_ADAPTER.md), “Write policy”).
- The configuration in this package is suitable for an isolated training/commissioning network. It is
  **not** suitable for uncontrolled production use: an educational reference is not a safety function.
- No credentials, certificates or keys are committed. A real SoftPLC deployment must authenticate and,
  where supported, secure the endpoint itself; Modbus TCP has no native transport security.
- The public demo and the default configuration keep all connectors disabled and read-only.

## Claims and limitations

- This showcase does **not** claim CODESYS certification, vendor partnership or any standards
  compliance. “CODESYS” is named only to describe an example environment; the program is
  vendor-neutral IEC 61131-3 Structured Text.
- No CODESYS project file is committed: redistribution/licensing was not verified, so the package
  contains a self-authored equivalent program description instead (see [`plc-program.md`](./plc-program.md)).
- The automated fixture is a deterministic substitute, clearly labelled as such. A real CODESYS/SoftPLC
  run is a **manual** validation step; the checklist in [`evidence.md`](./evidence.md) is marked as not
  executed in CI so no live-integration claim is implied.
- The sequence model is a training/virtual-commissioning mechanism, not a certified controller.

## Related documentation

- [Modbus TCP adapter](../../architecture/MODBUS_TCP_ADAPTER.md)
- [Signal mapping studio](../../architecture/SIGNAL_MAPPING_STUDIO.md)
- [Control authority and arbitration](../../architecture/CONTROL_AUTHORITY.md)
- [Reference cell signal catalog](../../architecture/REFERENCE_SIGNAL_CATALOG.md)
