# Limitations, legal constraints and non-claims

## Explicit non-claims

This profile and its material do **not** claim, and must not be read as claiming:

- **Siemens certification, validation or approval.** No Siemens product has been certified or
  validated here.
- **An official partnership or OEM relationship.** “Siemens”, “SIMATIC”, “S7-1500”, “TIA Portal” and
  “PLCSIM” are trademarks of Siemens AG, named only to describe example environments.
- **Product support or compatibility guarantees.** The profile describes one configuration that uses
  a documented standard interface (OPC UA, and optionally Modbus TCP via a gateway). It is not a
  statement that any specific firmware, module or licence will behave identically.
- **Safety, functional-safety or standards compliance.** This is a training / virtual-commissioning
  reference, not a safety function. `Fault`, `Stop` and the sequence are educational diagnostics, not
  safety-rated signals.
- **A live integration.** The committed evidence is an automated OPC UA substitute. No real
  PLCSIM/TIA Portal run has been performed; see [`evidence.md`](./evidence.md).

## Scope limits

- One normalized `0..100` transfer axis, a fixed deterministic sequence and a perfect virtual sensor
  (`SensorPosition` mirrors `ActuatorPosition`). A real cell has real kinematics, dynamics, sensor
  noise and material flow that this profile does not model.
- One OPC UA endpoint per connector instance; no redundancy, load balancing or hot standby.
- The mapping is a static, versioned document; it is validated and applied explicitly and is never
  hot-swapped mid-cycle.
- Writes are limited to the nine allow-listed output node ids. Any other write fails closed.
- No new protocol is introduced. The profile uses only the S33 OPC UA and S35 Modbus adapters.

## Legal and licensing constraints

- **No Siemens project or binary is committed.** Redistribution/licensing of TIA Portal project
  files (`.ap*`, `.zap*`), PLCSIM images and Siemens binaries was **not** verified, so this package
  documents the required DB/tag configuration and setup steps instead. Do not commit such artifacts
  to the repository; keep them in your own licensed environment.
- **OPC UA is an open standard.** The profile relies on the CPU's built-in OPC UA server, which is
  governed by Siemens' own licensing for the controller; enabling OPC UA may require a licence on
  some CPU models. Verify licensing for your hardware.
- **No reverse engineering or protocol emulation.** The profile uses only the documented OPC UA
  surface. It does not reverse-engineer, emulate or circumvent any proprietary protocol or licence.
- **No secrets are committed.** Certificates, keys, user names and passwords are runtime secrets and
  live outside the repository (configuration, environment or a secret store).

## Deliberate deferrals (must not leak into this sprint's scope)

The following belong to later roadmap sprints and are **not** addressed here:

- On-premise packaging and lifecycle (S48);
- observability/hardening and release candidate (S49);
- the 1.0 commercialization baseline (S50).
