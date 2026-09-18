# MQTT adapter and final connected showcase

MQTT is an optional infrastructure boundary. Telemetry uses `fabrik3d/v1/cells/{cellId}/equipment/{equipmentId}/telemetry`, QoS 1, versioned JSON payloads, and non-retained live values. A retained value must be treated as stale until its timestamp passes the normalized twin freshness policy.

The local broker fixture is [mosquitto.conf](../demo/mosquitto.conf) and the deterministic publisher data is [mqtt-telemetry.fixture.json](../demo/mqtt-telemetry.fixture.json). Start a local Mosquitto broker with `mosquitto -c docs/demo/mosquitto.conf`; keep `Mqtt:Enabled=false` for the default demonstration.

## Showcase checklist

1. Run MongoDB, server, simulator, and HMI using the repository setup guide.
2. Create and explicitly start a job; observe the simulated pallet cycle.
3. Inject, acknowledge, reset, and retry a simulated fault; inspect the timeline and export a learning report.
4. Import a recorded telemetry fixture for replay, then compare source/freshness in the twin diagnostics.
5. Optionally enable OPC UA or MQTT in local configuration; leave writes disabled unless a reviewed topic/node is allow-listed.

The showcase covers construction, simulation, supervision, learning, replay, and optional connected-twin boundaries. It is educational and never safety-rated control.
