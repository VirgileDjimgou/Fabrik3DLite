# Material flow and tooling (S28)

The material-flow library is data-first. Straight/curved conveyors, transfers, stops, diverters, sensing, buffers, containers, robot tools, workholding and configurable parts declare SI dimensions, collision proxies, semantic anchors and typed ports. A visual representation is optional and replaceable.

`material`, `signal`, `energy`, `data` and `safety` ports are connected only when their kind matches and their directions are compatible. The editor exposes compatible target ports through `CellEditorModel.compatibleTargets` and rejects malformed connections through `connect`; links are exported as `CellDefinition.connections`.

`ConveyorRuntime`, `BinarySensorRuntime` and `BinaryActuatorRuntime` are small deterministic scenario adapters. They intentionally do not simulate physics and use fixed timestamps, which makes state transitions testable. Status animation bindings should consume their runtime values; collision authority remains the declared proxy, never the visual asset.
