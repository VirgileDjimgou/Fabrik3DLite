# S23 - Professional modular six-axis robot

## Outcome

Replace the generic robot appearance with a professional, articulated six-axis asset while preserving the established controller, kinematics, safety model, and catalog profiles.

## Scope

- Generate a license-safe generic six-axis robot with separate links, articulated housings, motors/reducers, joint covers, cable routing, base plate/bolts, axis markings, warning labels, ISO-style tool flange, and a modular end effector.
- Define and validate the exact `J1` through `J6` pivot hierarchy, base/flange/tool frames, neutral pose, rotation axes, and joint directions in the asset manifest.
- Add a generic visual-binding adapter that maps `RobotController` joint values to semantic asset nodes without duplicating kinematics.
- Support compact, medium, and heavy catalog profiles through versioned asset configuration or controlled parametric variants.
- Add LODs, material variants, selection highlighting, and simplified link collision primitives compatible with the existing safety engine.
- Keep `IndustrialRobot`/the procedural robot as the automatic fallback and migration reference.
- Document how to add another license-safe robot asset without adding robot-specific scene code.

## Tests and gates

- Numeric tests comparing visual joint transforms, catalog frames, FK reference poses, joint directions, limits, and collision proxies.
- Smoke tests for all catalog profiles and supported tools.
- Visual regression screenshots for home, pick, CNC-load, and limit-near poses.
- Performance and repeated mount/unmount leak tests.
- Simulator type-check, unit tests, visual tests, production build, and applicable workspace baseline gates.

## Acceptance criteria

- Existing workflows drive the new robot through the unchanged runtime/controller interfaces.
- All six visible joints remain aligned with the deterministic kinematic and safety models within documented tolerances.
- Robot/tool changes are configuration-driven and a broken asset falls back cleanly.
- The result is explicitly generic and makes no unsupported claim of OEM geometry or controller emulation.

## Non-goals

- No proprietary OEM mesh redistribution.
- No replacement of deterministic safety calculations by mesh collision.
