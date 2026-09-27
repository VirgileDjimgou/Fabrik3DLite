# Siemens / PLCSIM interoperability profile (S47)

An educational, reproducible integration profile for **Siemens training environments**: a Siemens
S7-1500 (real or **PLCSIM Advanced**) exposing an **OPC UA server** drives the Fabrik3D CNC reference
cell, closing the loop:

```text
PLC DB tag (write) ─▶ Fabrik3D virtual actuator ─▶ virtual sensor ─▶ PLC DB tag (read)
(S7-1500 OPC UA)       (showcase.cell.* signals)   (position/status)   (S7-1500 OPC UA)
```

The profile is built entirely on the shipped S33–S39 adapters, mapping schema, authority model and
reference-cell signals. It adds **documentation, a versioned mapping file and automated tests** — no
new protocol and no production server change.

| Capability | Shipped in | Used as |
| --- | --- | --- |
| Real OPC UA client connector (disabled by default, fail-closed writes) | S33 | transport |
| Versioned mapping schema / validator / projection | S37 | the committed OPC UA I/O map |
| Exclusive control authority, lease, degraded mode | S36 | ownership of the cell during the run |
| Reference-cell signals and deterministic sequence | S32/S39 | virtual cell behavior |
| In-process OPC UA fixture (real transport) | S33 | automated CI substitute for PLCSIM/TIA Portal |
| CODESYS / SoftPLC showcase (Modbus TCP) | S46 | sibling profile; same mapping/state machine, different transport |

## What this package contains

| File | Purpose |
| --- | --- |
| [`io-map.json`](./io-map.json) | The committed, versioned (schema `1.0`) S37 mapping document: Fabrik3D signal ↔ Siemens OPC UA DB tag. It is the single source of truth the automated substitute projects into the real OPC UA connector. |
| [`io-map.md`](./io-map.md) | Human-readable tag table, data types, scaling, direction and Siemens DB conventions. |
| [`handshake.md`](./handshake.md) | Session/authority acquisition, start, permissives, fault/reset handshake. |
| [`sequence.md`](./sequence.md) | The expected machine-state sequence from idle through load/machining/unload/complete, plus stop/fault/reset/controller-loss. |
| [`diagnostics.md`](./diagnostics.md) | Health, last error, counters, node/address validation and how to read them. |
| [`setup.md`](./setup.md) | TIA Portal + PLCSIM Advanced setup, OPC UA security (certificates/trust), write enablement and troubleshooting. |
| [`evidence.md`](./evidence.md) | Captured automated-substitute evidence, recorded timings, and the manual real-run validation checklist with its documented blocker. |
| [`limitations.md`](./limitations.md) | Scope limits, explicit non-claims and legal/licensing constraints. |

## Supported environment and scope

- **Preferred interface:** OPC UA over `opc.tcp`, exposed by the S7-1500 CPU (firmware 2.x+) or by
  PLCSIM Advanced. OPC UA is the documented, secure, officially supported option and the only
  interface exercised end to end in CI.
- **Data model:** a single command/status data block, `Fabrik3D_Cell_DB`, with case-sensitive tags.
  The TIA Portal OPC UA server exports these under namespace index `3` with quoted DB syntax, for
  example `ns=3;s="Fabrik3D_Cell_DB"."Start"`.
- **Alternative interface:** a Siemens Modbus TCP gateway (for example an S7-1200/1500 with a
  Modbus TCP communication module, or a protocol gateway) is documented in
  [`setup.md`](./setup.md#alternative-modbus-tcp-gateway). It reuses the S46 register mapping; the
  OPC UA path is preferred and is the one the automated substitute covers.
- **Writes:** explicitly enabled and allow-listed for the nine Fabrik3D output tags only. Connectors
  remain **disabled by default**; nothing in this package changes the default posture.
- **Authority:** the PLC acquires `ExternalController` authority explicitly before driving (S36).
- **Profile scope:** a normalized `0..100` transfer axis and a fixed educational sequence. It is not
  a machine model, not a safety function and not a claim about any specific Siemens product.

## Reproduce the automated substitute for CI (no TIA Portal / PLCSIM required)

```powershell
dotnet build Fabrik3D/Fabrik3D.slnx
dotnet test Fabrik3D/Fabrik3D.Server.Tests/Fabrik3D.Server.Tests.csproj --filter "FullyQualifiedName~SiemensPlcsimProfileTests"
```

The tests validate the committed I/O map, drive the full closed-loop sequence through the real OPC UA
connector against the in-process OPC UA fixture (real TCP transport, sessions, subscriptions,
monitored items), prove the S36 handshake and controller-loss behavior, prove bad-quality/disconnect
failure handling, and prove wrong tags and writes fail closed. See [`evidence.md`](./evidence.md) for
captured output.

The substitute reads the **same symbolic identifiers** as the documented Siemens profile. Only the
OPC UA namespace index differs (the local fixture uses its own namespace); the connector, direction,
type and scaling are unchanged. This is stated in [`evidence.md`](./evidence.md) so the automated
evidence is never presented as a real PLCSIM run.

## Security posture (read this before enabling anything)

- Writes are enabled **only** for the profile mapping and only for the exact allow-listed output
  tags. A tag that is not allow-listed, or a read-only input, is refused before any protocol write
  (see [`../architecture/OPC_UA_ADAPTER.md`](../../architecture/OPC_UA_ADAPTER.md), “Health,
  diagnostics and the write path”).
- The preferred OPC UA path uses a secure endpoint (`Basic256Sha256` or `Aes256Sha256RsaPss`) with an
  explicit certificate trust store. `AutoAcceptUntrustedCertificates` is documented as a
  development-only escape hatch and is **never** a production setting.
- The configuration in this package is suitable for an isolated training/commissioning network. It is
  **not** suitable for uncontrolled production use: an educational reference is not a safety function.
- No credentials, certificates, keys, Siemens project files or binaries are committed.

## Claims and limitations

- This profile does **not** claim Siemens certification, an official partnership, TIA Portal/PLCSIM
  product support, or any standards compliance. “Siemens”, “S7-1500”, “TIA Portal” and “PLCSIM”
  are named only to describe example environments and their documented OPC UA surface.
- No Siemens project file (`.ap*`, `.zap*`) is committed: redistribution/licensing was not verified,
  so the package contains a description of the required DB/tag configuration instead. See
  [`limitations.md`](./limitations.md).
- The automated fixture is a deterministic OPC UA substitute, clearly labelled as such. A real
  PLCSIM/TIA Portal run is a **manual** validation step; the checklist in
  [`evidence.md`](./evidence.md) is currently **not executed** and the reason is documented.
- The sequence model is a training/virtual-commissioning mechanism, not a certified controller.

## Related documentation

- [OPC UA adapter](../../architecture/OPC_UA_ADAPTER.md)
- [Signal mapping studio](../../architecture/SIGNAL_MAPPING_STUDIO.md)
- [Control authority and arbitration](../../architecture/CONTROL_AUTHORITY.md)
- [Reference cell signal catalog](../../architecture/REFERENCE_SIGNAL_CATALOG.md)
- [Sibling CODESYS / SoftPLC showcase (S46)](../codesys-softplc/README.md)
