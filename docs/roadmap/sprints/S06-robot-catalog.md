# S06 - Robot catalog and selectable profiles

## Outcome

Allow a user to select among multiple robot profiles while preserving one common simulation API.

## Scope

- Define `RobotDefinition`, `JointDefinition`, payload, reach, limits, base/tool frames, visual asset, collision model, and controller profile.
- Provide at least three license-safe generic six-axis profiles: compact, medium, and heavy.
- Add optional vendor metadata for educational comparison without shipping unauthorized ABB/FANUC/KUKA assets or proprietary behavior.
- Add a robot catalog service and selection UI in the simulator/cell configuration.
- Make tools/end effectors separate definitions with compatibility metadata.
- Migrate the current robot into the catalog as the default compatibility profile.

## Tests and gates

- Catalog schema, duplicate ID, joint limit, and asset validation tests.
- Instantiate every robot profile in a headless scene smoke test.
- Verify declared reach and payload metadata are displayed correctly.
- Visual regression screenshots for robot selection at target screen sizes.

## Acceptance criteria

- Changing robot profile requires configuration, not a scene rewrite.
- All catalog robots expose the same runtime controller interface.
- Missing or invalid assets fail with a useful diagnostic.

## Non-goals

- No claim of exact OEM controller emulation.
