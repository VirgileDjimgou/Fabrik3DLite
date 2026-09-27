# Setup guide — Siemens S7-1500 / PLCSIM Advanced (OPC UA)

This guide reproduces the run with a **Siemens S7-1500 CPU** (real or **PLCSIM Advanced**) exposing
its **OPC UA server**. Everything on the Fabrik3D side is standard connector configuration; no
Siemens-specific server code exists.

> Scope: this is an educational/virtual-commissioning profile on an isolated network. It is not a
> production machine configuration and makes no safety, certification or partnership claim.
> Steps marked **MANUAL** require TIA Portal / PLCSIM and cannot run in CI.

## 0. Prerequisites

- Fabrik3D server reachable (default `http://127.0.0.1:7249`) with an Engineer-capable account.
- **TIA Portal** (V16 or later recommended) and either a real S7-1500 CPU or **PLCSIM Advanced**
  (V3.x or later) with its virtual adapter/PLCSIM interface.
- A CPU firmware that supports the S7-1500 **OPC UA server** (2.x+).
- The mapping from [`io-map.md`](./io-map.md) and the machine-readable [`io-map.json`](./io-map.json).

## 1. TIA Portal — create the data block and enable OPC UA (MANUAL)

1. **Create the data block.** Add a **global DB** named `Fabrik3D_Cell_DB` with exactly the tags and
   types in [`io-map.md`](./io-map.md) (five command fields and nine status fields). Names are
   case-sensitive.
2. **Make the tags OPC UA-accessible.** Open the DB properties → **Attributes** and ensure
   *“Accessible from HMI/OPC UA”* is set, and that the block is **not** optimized for OPC UA access
   (or explicitly expose the tags). Optimized blocks must have per-tag accessibility enabled.
3. **Enable the OPC UA server.** In the CPU properties → **OPC UA → Server**, enable “Activate OPC UA
   server” and note the endpoint URL (for example `opc.tcp://192.168.0.10:4840`).
4. **Choose a security policy.** Prefer `Basic256Sha256` (or `Aes256Sha256RsaPss`). Only enable
   `None` in a fully isolated development setup, and never with writes enabled on an untrusted
   network.
5. **Export the server certificate.** Under OPC UA → Server → Security, use or generate the
   application certificate and export the server certificate for the Fabrik3D trust store (step 2
   below). Do **not** commit the certificate or key to the repository.
6. **(PLCSIM Advanced only)** start the instance, download the project, and put the CPU in RUN. Note
   the virtual adapter IP that Fabrik3D can reach (use the host-only/PLCSIM virtual network).

Record the exact TIA Portal version, PLCSIM Advanced version and CPU firmware for the manual
evidence record (see [`evidence.md`](./evidence.md)).

## 2. Fabrik3D side — trust, enable and allow-list

The default `OpcUa` section is **disabled** and **read-only**:

```jsonc
"OpcUa": {
  "Enabled": false,                         // default; the profile sets this to true
  "Endpoint": "opc.tcp://192.168.0.10:4840",// the S7-1500 / PLCSIM endpoint
  "SecurityPolicy": "Basic256Sha256",       // prefer a secure endpoint
  "CertificateTrustStore": "./data/opcua-trust",
  "AutoAcceptUntrustedCertificates": false, // development-only escape hatch; never production
  "AllowWrites": false,                     // default; the profile sets this to true
  "WriteAllowList": [],                     // default; the profile lists exactly the nine output node ids
  "NodeMap": []
}
```

For the profile:

1. **Import the mapping.** Load [`io-map.json`](./io-map.json) in the engineering **mapping studio**
   (see [`SIGNAL_MAPPING_STUDIO.md`](../../architecture/SIGNAL_MAPPING_STUDIO.md)) and validate it;
   or configure the 14 `NodeMap` entries directly. Applying a mapping requires the OPC UA connector
   to be enabled and is not hot-swapped: reload the validated mapping on restart.
2. **Trust the CPU certificate.** Copy the exported S7-1500 server certificate into the
   `CertificateTrustStore` trusted store (`./data/opcua-trust/trusted`). Never use
   `AutoAcceptUntrustedCertificates` in production; it logs a prominent warning and is a
   development-only setting.
3. **Enable writes for the profile only.** Set `AllowWrites = true` and list **exactly** the nine
   output node ids in `WriteAllowList`:
   `ns=3;s="Fabrik3D_Cell_DB"."Ready"`, `…"Running"`, `…"RobotCycleComplete"`,
   `…"CncCycleComplete"`, `…"CycleComplete"`, `…"Fault"`, `…"ActuatorPosition"`,
   `…"SensorPosition"`, `…"PartsCompleted"`. A tag that is not allow-listed, or any read-only input,
   is refused before network traffic.
4. **Set `Enabled = true`** and restart the server so the validated configuration is loaded.

> Least privilege: use a dedicated OPC UA user if the CPU supports one, and keep the allow-list
> minimal. Fabrik3D only needs to read the five command tags and write the nine status tags.

## 3. Acquire control authority (required before the cell moves)

The cell refuses to move without an explicit external authority lease (S36). From the engineering
surface or the API:

```powershell
# Acquire external-controller authority for scope "siemens-cell", owner "siemens-plc".
$body = '{"mode":"ExternalController","ownerId":"siemens-plc","ownerKind":"connector","leaseSeconds":120}'
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:7249/api/control-authority/siemens-cell/acquire `
  -ContentType 'application/json' -Body $body
```

Local simulation is refused while the PLC holds authority; releasing the lease (or letting it expire)
returns the scope to implicit local simulation and demonstrates the documented degraded mode.

## 4. Observe the run

Watch the run through existing surfaces — no new operator UI is added by the profile:

- the **control-authority indicator** (HMI/simulator) shows `external-controller` / `held`;
- the **signal monitor / mapping studio live monitor** shows `showcase.cell.*` observed and commanded
  values;
- the connector status endpoint exposes diagnostics:
  `GET http://127.0.0.1:7249/api/connectors/opcua`.

## 5. Automated substitute (CI, no TIA Portal / PLCSIM required)

The proprietary steps above are **manual**. CI uses an automated substitute that speaks the same map
through the same OPC UA adapter and an in-process real OPC UA fixture:

```powershell
dotnet test Fabrik3D/Fabrik3D.Server.Tests/Fabrik3D.Server.Tests.csproj --filter "FullyQualifiedName~SiemensPlcsimProfileTests"
```

The fixture is a real in-process OPC UA server (`Fabrik3D.OpcUa.Fixture`), not a proprietary
emulator. If the fixture fails, the test fails — it never skips silently.

## 6. Troubleshooting

See [`diagnostics.md`](./diagnostics.md) for the full table. The most common profile issues are:

- **`state = Disabled`** — `OpcUa.Enabled` is still `false`. Enable and restart.
- **Certificate/trust error** — the CPU certificate is not trusted. Add it to the trust store; do not
  globally disable validation.
- **`monitoredItemCount < 14`** — a DB tag is missing or not OPC UA-accessible. Re-export the block
  and confirm the tags are exposed.
- **Writes rejected `not-allow-listed`** — add exactly the nine output node ids to `WriteAllowList`.
- **`Degraded` + rising `reconnectCount`** — the CPU is in STOP or the link is down; authority stays
  `degraded` until an explicit operator action.

## Alternative: Modbus TCP gateway

Where OPC UA is not available on the CPU (for example an older S7-1200 without the OPC UA licence),
a **Modbus TCP** gateway is a documented alternative. The S7 acts as a Modbus TCP server (or a
protocol gateway presents the DB tags as holding registers) and Fabrik3D polls it. Reuse the S46
register mapping ([`../codesys-softplc/io-map.md`](../codesys-softplc/io-map.md)):

- unit id `1`, zero-based holding registers, big-endian, one register per numeric value;
- the same direction convention (`read` = PLC → Fabrik3D, `write` = Fabrik3D → PLC);
- writes enabled and allow-listed for the nine output signals only.

**Network assumptions:** Modbus TCP has no native transport security. Run it only on an isolated
training network; if a TLS-over-Modbus or VPN gateway is available, terminate there and keep the
Fabrik3D connector on the trusted segment. Do not enable writes on an untrusted network. This path is
documented but is **not** the interface the automated S47 substitute exercises.
