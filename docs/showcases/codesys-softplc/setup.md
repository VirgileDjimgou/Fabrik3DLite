# Showcase setup

This guide reproduces the run with **CODESYS or a SoftPLC** over **Modbus TCP**. Everything on the
Fabrik3D side is standard connector configuration; no showcase-specific server code exists.

> Scope: this is an educational/virtual-commissioning showcase on an isolated network. It is not a
> production machine configuration and makes no safety or certification claim.

## 0. Prerequisites

- Fabrik3D server reachable (default `http://127.0.0.1:7249`), an Engineer-capable account.
- A CODESYS (or other IEC 61131-3) environment on the same network, able to run a Modbus TCP server
  (slave) and to download the reference program from [`plc-program.md`](./plc-program.md).
- The Modbus unit id agreed (`1` in this showcase) and the register map from [`io-map.md`](./io-map.md).

## 1. Fabrik3D side — enable the connector (write-enabled, allow-listed)

The showcase must be explicitly enabled. The default `Modbus` section is disabled with writes off:

```jsonc
"Modbus": {
  "Enabled": false,        // default; the showcase sets this to true
  "Host": "127.0.0.1",     // the SoftPLC / CODESYS host
  "Port": 502,             // Modbus TCP
  "UnitId": 1,
  "PollIntervalMilliseconds": 50,
  "StaleAfterMilliseconds": 30000,
  "ReconnectDelaySeconds": 1,
  "MaxReconnectDelaySeconds": 1,
  "AllowWrites": false,    // default; the showcase sets this to true
  "WriteAllowList": [],    // default; the showcase lists exactly the nine output signals
  "AddressConvention": "zero-based",
  "Points": []
}
```

For the showcase:

1. Set `Enabled = true`, `Host`/`Port` (and `UnitId` if different) to reach your PLC.
2. Set `AllowWrites = true` and list **exactly** the nine showcase output signals in `WriteAllowList`:
   `showcase.cell.Ready`, `Running`, `RobotCycleComplete`, `CncCycleComplete`, `CycleComplete`,
   `Fault`, `ActuatorPosition`, `SensorPosition`, `PartsCompleted`.
3. Add the 14 points from [`io-map.json`](./io-map.json). They can be entered directly, or the same
   document can be imported and validated in the engineering **mapping studio** (see
   [`SIGNAL_MAPPING_STUDIO.md`](../../architecture/SIGNAL_MAPPING_STUDIO.md)). Applying a mapping
   requires the connector to be enabled and is not hot-swapped: the connector reloads the validated
   mapping on restart.
4. Restart the server so the validated configuration is loaded (a mapping is never silently
   hot-swapped mid-cycle).

> Write enablement is scoped to this configuration only. A read-only telemetry setup leaves
> `AllowWrites = false`; the public demo and default configuration stay disabled.

## 2. PLC side — CODESYS or SoftPLC

1. **Add a Modbus TCP server (slave) device** to the project. Give it unit id `1`, bind it to the
   network interface reachable by Fabrik3D, and enable the holding register bank covering `HR0..HR13`.
2. **Export the register bank as symbols** using the address table in [`io-map.md`](./io-map.md):
   - `%MW0` command bits (`Start`/`Stop`/`Reset` at bits 0/1/2),
   - `%MW1.0` simulated pallet photo-eye,
   - `%MW2` transfer-axis setpoint,
   - `%MW10` status bits (`Ready`/`Running`/robot/CNC/cycle complete/`Fault`),
   - `%MW11` actuator position, `%MW12` sensor position, `%MW13` parts completed.
3. **Port the reference program** from [`plc-program.md`](./plc-program.md) (`FB_Fabrik3DShowcaseSequence`)
   into a POU and bind its inputs/outputs to those registers.
4. **Download and run** the program. Confirm the CODESYS Modbus server is listening on port `502`
   (or your configured port).
5. **Security settings.** Modbus TCP has no native transport security; run it only on an isolated
   training network. Since this showcase enables writes, do not expose the endpoint to an untrusted
   network. If your SoftPLC supports TLS-over-Modbus or a secure gateway, terminate there and keep
   this connector on the trusted segment. Do not put credentials in the repository; use environment
   variables or your deployment's secret store.

## 3. Acquire control authority (required before the cell moves)

The cell refuses to move without an explicit external authority lease (S36). From the engineering
surface or the API:

```powershell
# Acquire external-controller authority for scope "showcase-cell", owner "showcase-plc".
$body = '{"mode":"ExternalController","ownerId":"showcase-plc","ownerKind":"connector","leaseSeconds":120}'
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:7249/api/control-authority/showcase-cell/acquire `
  -ContentType 'application/json' -Body $body
```

Local simulation is refused while the PLC holds authority; releasing the lease (or letting it expire)
returns the scope to implicit local simulation and demonstrates the documented degraded mode.

## 4. Observe the run

Watch the run through existing surfaces — no new operator UI is added by the showcase:

- the **control-authority indicator** (HMI/simulator) shows `external-controller` / `held`;
- the **signal monitor / mapping studio live monitor** shows `showcase.cell.*` observed and commanded
  values;
- the connector status endpoint exposes poll/write counters:
  `GET http://127.0.0.1:7249/api/connectors/modbus`.

## 5. Automated substitute (CI, no CODESYS required)

The proprietary step above is **manual**. CI uses an automated substitute that speaks the same map
through the same adapter and fixture:

```powershell
dotnet test Fabrik3D/Fabrik3D.Server.Tests/Fabrik3D.Server.Tests.csproj --filter "FullyQualifiedName~ReferenceCellShowcaseTests"
```

The fixture is a real in-process Modbus TCP server (`Fabrik3D.Modbus.Fixture`), not a proprietary
emulator. If the fixture fails, the test fails — it never skips silently.
