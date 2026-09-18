# Industrial safety and infrastructure library

`src/safety/industrialInfrastructure.ts` declares reusable fence, gate,
protective-device and infrastructure modules in SI units. Each definition has
explicit dimensions, placement anchors, a simple collision proxy, typed ports,
parameters, and a `runtimeCapability`.

Interactive devices (gate interlock, light curtain, scanner, emergency stop and
stack light) declare safety or signal ports. Cabinets, cable trays and pneumatic
services are `static`: they improve layout credibility but receive no runtime
adapter. Renderer meshes in `IndustrialInfrastructureSystem.vue` are visual-only
and can be replaced by versioned GLB assets without changing the definitions,
ports or collision proxies.

`SafetyGuardSystem` remains in place as the compatibility safeguarding layer.
The new infrastructure system supplements it with controller/PLC/utility
cabinets, HMI pedestal, services, emergency-stop pedestal, scanner and status
lights. Its colors are simulated indicators, not a certified safety function.

The editor groups entries into Core equipment, Safety, and Infrastructure, and
shows `layout` for static modules. `nearestInfrastructureAnchor` gives future
placement tools deterministic snap targets; S28 will extend this into material
flow and tool-port connections.
