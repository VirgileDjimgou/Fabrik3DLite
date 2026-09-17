# Robot catalog

The simulator ships a small robot catalog that lets the operator choose among multiple robot profiles while every profile exposes the same runtime controller interface (`RobotController`). Swapping a profile changes configuration, never the scene.

## Concepts

- `RobotDefinition` — pure data: payload (`payloadKg`), reach (`reachMeters`), six `JointDefinition` limits, base/tool frames, procedural `dimensions`, `visualAsset` / `collisionModel` asset keys, and a `controllerProfile` name.
- `JointDefinition` — one revolute joint (`minRad` / `maxRad`); every profile declares exactly six joints.
- `ToolDefinition` — an end effector with `massKg`, a flange `mount`, and a `workingPayloadKg`. A tool is compatible with a robot when the robot payload covers tool mass + working payload.
- `VendorMetadata` — optional, license-safe vendor/family/note fields used only for educational comparison. It never implies OEM controller emulation.

All lengths are meters, angles radians, masses kilograms.

## Profiles

Three generic six-axis profiles are registered in `src/robot/catalog/definitions.ts`:

| Id | Payload | Reach | Notes |
|---|---|---|---|
| `compact-6axis` | 3 kg | 0.7 m | Small footprint, tighter wrist limits |
| `medium-6axis` | 12 kg | 1.4 m | Default compatibility profile; reproduces the pre-catalog robot (same dimensions and joint limits) |
| `heavy-6axis` | 50 kg | 2.0 m | Wider base/wrist rotation for heavy workpieces |

## Assets

Visual and collision representations are generated procedurally at runtime (no OEM meshes are shipped). Each definition references one `visualAsset` (`procedural-6axis`) and one `collisionModel` (`capsule-6axis`) by key. `validateRobotAssets` resolves those keys against the known asset set and fails with a diagnostic such as `Robot 'x' references unknown visual asset 'y'`.

## Catalog service

`RobotCatalogService`:

- `registerRobot` / `registerTool` — validate schema, joint limits, assets, and reject duplicate ids.
- `resolveDimensions` / `resolveJointLimits` — produce the values used to build the visual arm and drive the generic controller.
- `isToolCompatible(robotId, toolId)` — payload vs. tool mass check.
- `createDefaultRobotCatalog()` — a ready-to-use catalog with the three profiles and the default two-finger gripper.

`validateRobotDefinition` enforces exactly six joints, `min < max`, finite limits within a sane bound, positive payload/reach, and a controller profile.

## Selection UI and scene integration

`RobotCatalogPanel.vue` is an HTML overlay that lists the profiles with payload and reach and lets the operator switch. In `SingleConveyorCellLayout.vue` the panel drives a `selectedRobotId` ref; the single `ScaledRobotComponent` re-mounts with the new `RobotDefinition` (via `:key`) and emits a fresh `RobotController` bound to that profile's joint limits. The scene template is unchanged — this is configuration, not a rewrite.

A WebGL-free harness (`/?view=robot-catalog`, see `RobotCatalogPanelPage.vue` and `main.ts`) renders the same panel for deterministic visual regression at target screen sizes.
