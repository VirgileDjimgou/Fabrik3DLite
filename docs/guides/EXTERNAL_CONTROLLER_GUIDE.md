# External controller guide

Status: verified against the 1.0 build. The Fabrik3D cell is a **simulation**; connecting an external
controller drives virtual actuators and sensors. Nothing in this guide makes Fabrik3D a certified
safety authority.

This guide covers virtual commissioning and digital-twin use: driving the simulated cell from a real
PLC/SoftPLC or an external client through OPC UA, MQTT or Modbus TCP, with explicit control
authority. It complements the [control authority architecture](../architecture/CONTROL_AUTHORITY.md)
and the two showcase profiles: [CODESYS / SoftPLC](../showcases/codesys-softplc/README.md) (Modbus)
and [Siemens / PLCSIM](../showcases/siemens-plcsim/README.md) (OPC UA).

## Concepts

- **Control authority** — exactly one owner per equipment/actuator scope at a time. Modes are
  `local-simulation`, `external-controller`, `observed-twin` and `replay`.
- **Handover** — explicit, precondition-checked (the previous owner must quiesce), audited and
  visible in the UI. There is no implicit takeover.
- **Lease and degraded mode** — an external controller holds a lease via heartbeats. If the lease
  expires, the scope degrades to the documented safe state and **never silently reverts** to another
  authority during a cycle.
- **Replay** — read-only; it can never acquire authority or emit a protocol write.

## 1. Enable the connector (fail-closed by default)

All connectors are disabled by default and writes are disabled by default. A write additionally
requires `AllowWrites` **and** an exact allow-list match **and** a writable signal/point. Configure
the relevant options for your environment (see the protocol documents). Certificate trust is never
silently bypassed; development auto-accept is explicit, warned and never a production default. For a
local lab endpoint an untrusted certificate is refused unless you deliberately opt in.

## 2. Map the signals

Use the [signal mapping studio](SIGNAL_MAPPING_GUIDE.md) to map internal signals to your controller's
tags/registers/topics. Validate before applying; apply is explicit and all-or-nothing.

## 3. Acquire authority

Acquire the scope through the HMI authority indicator (Acquire / Release / Takeover buttons) or the
REST API. Takeover requires the engineer role.

```text
GET  /api/control-authority/{scope}
POST /api/control-authority/{scope}/acquire
POST /api/control-authority/{scope}/takeover
POST /api/control-authority/{scope}/release
POST /api/control-authority/{scope}/heartbeat
GET  /api/control-authority/{scope}/audit
```

The `ControlAuthorityChanged` SignalR event broadcasts transitions. The HMI shows mode, state, owner
and target scope continuously, with pending/success/failure feedback. While a scope is owned
externally, the simulator cannot command its actuators; a conflicting local command is refused with
`authority_conflict`.

## 4. Run the closed loop

With the controller authoritative, command the mapped actuator outputs. The values flow through the
signal mirror into the simulated actuator; the simulated sensor value is published back to the
controller input. The [CODESYS showcase](../showcases/codesys-softplc/README.md) proves this loop
with an automated substitute fixture over the real Modbus connector, and the
[Siemens profile](../showcases/siemens-plcsim/README.md) does the same over the real OPC UA
connector.

## 5. Handle loss and recovery

- If the controller stops sending heartbeats, the lease expires and the scope degrades. The
  documented degraded mode applies; the actuator is held, not silently re-driven.
- Release authority explicitly to return control to local simulation.
- Review the audited transition history with `GET /api/control-authority/{scope}/audit`.

## Honesty and scope

- The CODESYS and Siemens profiles are **documentation plus deterministic automated substitute
  fixtures**. A real PLC/PLCSIM run is an explicitly manual checklist; no vendor project file,
  binary, license or secret is committed, and no vendor partnership or certification is claimed.
- Control authority is a training/virtual-commissioning arbitration mechanism, not a certified
  safety function.
- Fault injection never propagates arbitrary writes into live machinery.

## Related documents

- [Control authority](../architecture/CONTROL_AUTHORITY.md)
- [OPC UA adapter](../architecture/OPC_UA_ADAPTER.md)
- [MQTT transport](../architecture/MQTT_SHOWCASE.md)
- [Modbus TCP adapter](../architecture/MODBUS_TCP_ADAPTER.md)
- [Signal mapping guide](SIGNAL_MAPPING_GUIDE.md)
- [Security model](../operations/SECURITY_MODEL.md)
