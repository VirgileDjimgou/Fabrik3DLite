# S27 - Industrial safety and infrastructure library

## Outcome

Create a reusable industrial cell-perimeter and infrastructure catalog that improves credibility while keeping safety logic deterministic and separate from visuals.

## Scope

- Add modular fence panels, corner posts, kick plates, interlocked access gates, light curtains, area scanners, pedestal emergency stops, stack lights, and operator/maintenance floor markings.
- Add static robot-controller, PLC/electrical cabinet, operator HMI pedestal, utility cabinet, cable-tray, and pneumatic-service visual assets.
- Parameterize dimensions, orientation, status colors, gate state, scanner range, and stack-light state through equipment definitions.
- Provide simple collision proxies and safety ports independently from detailed meshes.
- Extend the editor catalog with grouped Safety and Infrastructure categories, rotation, footprint, snapping anchors, and status indicating static/layout-only equipment.
- Bind interactive safety devices to existing simulated alarm/state workflows without claiming certified behavior.
- Preserve current `SafetyGuardSystem` as a fallback and migration compatibility layer.

## Tests and gates

- Deterministic dimensions, anchor, proxy, and safety-state mapping tests.
- Editor insertion, move, rotate, save/reload, and invalid-overlap tests.
- Visual baselines for gate open/closed, scanner warning, emergency stop, and stack-light states.
- Asset manifest, fallback, disposal, type-check, test, build, and workspace baseline gates.

## Acceptance criteria

- A guarded cell perimeter can be assembled from reusable catalog modules.
- Interactive devices expose typed safety ports and visible simulated states.
- Static infrastructure adds no unnecessary runtime adapter.
- Existing cells continue loading unchanged.

## Non-goals

- No safety certification, exact stopping-distance guarantee, or OEM safety-controller emulation.
