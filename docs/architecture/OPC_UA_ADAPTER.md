# Optional OPC UA adapter

The OPC UA boundary is an infrastructure module, disabled by default. It maps the educational sample namespace `ns=2;s=Fabrik3D/{Equipment}/{Field}` to protocol-independent state records; no vendor namespace compatibility is claimed.

Configuration includes endpoint, security policy, certificate trust store, reconnect delay, subscription sampling, and an explicit write allow-list. Default configuration is disabled and read-only. Writes require all of: connector enabled, `AllowWrites=true`, and an exact allow-list match. The connector reports unavailable health rather than crashing the orchestrator.

For a live deployment, provide a trusted certificate store and an OPC UA transport implementation/fixture; this repository deliberately keeps that runtime dependency outside core simulation behavior.
