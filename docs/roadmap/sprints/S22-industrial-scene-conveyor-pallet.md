# S22 - Industrial rendering, conveyor, and pallet station

## Outcome

Validate the complete asset pipeline with a realistic industrial scene and professional conveyor/pallet-station vertical slice.

## Scope

- Upgrade the shared renderer with explicit sRGB color management, PBR-ready environment lighting, ACES tone mapping, configurable shadow quality, and documented low/medium/high quality tiers.
- Improve the factory floor with restrained concrete PBR materials, joints and operational markings while keeping overlays readable.
- Generate modular conveyor assets with frame profiles, continuous belt/rollers, motor-reducer, tensioners, adjustable legs, guides, stops, sensors, guards, and connection anchors.
- Generate pallet-station assets with pallets, locators, datum pins, stops, clamps, presence sensors, work-object frames, and robot grasp/loading anchors.
- Bind belt/roller animation and sensor/status visuals to the existing conveyor/pallet runtime instead of embedding behavior in meshes.
- Supply LODs and simplified deterministic collision proxies derived from declared dimensions, not detailed triangles.
- Preserve the existing cell layout and procedural variants as fallbacks.

## Tests and gates

- Deterministic tests for asset dimensions, anchors, ports, transforms, animation bindings, and collision-proxy alignment.
- Visual regression screenshots for idle, running, stopped-pallet, and sensor-active states.
- Performance measurement for frame time, draw calls, triangles, texture memory, cache reuse, and teardown/reload.
- Simulator type-check, unit tests, visual tests, production build, and applicable workspace baseline gates.

## Acceptance criteria

- Conveyor and pallet station render from manifest-backed assets in the reference cell and retain current simulation outcomes.
- Their dimensions, material flow, sensor positions, and collision geometry agree in SI coordinates.
- The scene remains usable at the documented medium quality target and degrades predictably on low quality.
- Status and safety colors remain semantic rather than decorative.

## Non-goals

- No robot or CNC visual replacement yet.
- No photorealistic effects that obscure educational or operator information.
