# Predefined industrial scenes (S29)

The built-in scene catalog contains five versioned, data-only presets: CNC machine tending, vision sorting, robot palletizing, assembly and inspection, and robot safety training. Each has a declared runtime capability, floor/camera data, equipment identifiers and only compatible scenario identifiers.

Scenarios state their prerequisites and expected simulated events. Their identifiers are stable session inputs at the orchestration boundary. Material-flow presets expose a deterministic training runtime: it publishes an explicit simulated session identifier, advances through its declared process event, then requires an explicit recovery acknowledgement. They do not represent OEM robot programs or certified safety behavior. Scene selection is revisioned by `SceneSelectionController`, so the host remounts and drops transient state when switching presets.
