# S53 - Complete operator HMI and role-aware product surfaces

## Outcome

Remove remaining operator placeholders, deliver an authoritative Robot Positions/manual-jog workflow, and make Operator, Engineering, Training and Administration surfaces visibly distinct without splitting Fabrik3D into unnecessary applications.

## Motivation

The `/robot-positions` route is incomplete and the navigation exposes specialized tools too uniformly. Operators need a focused hierarchy and trustworthy command feedback, while engineering/training/admin functions need explicit policy boundaries.

## Current-state assumptions to verify

- Inspect current routes, guards, role policies, HMI navigation, simulator twin-state payloads and pose/frame conventions.
- Locate the existing manual-jog, dead-man, limit, collision/motion-safety and control-authority implementation; it must be reused.
- Audit EN/FR/DE strings, touch breakpoints, reduced-motion and accessibility coverage.

## Scope

- Implement Robot Positions from authoritative simulator/twin state: J1-J6, TCP X/Y/Z, existing orientation convention, active/base/tool frames, current tool, robot status and control authority.
- Integrate role/mode/authority-gated manual jog through existing safety infrastructure.
- Organize navigation into clear Operator, Engineering, Training and Administration groupings using existing views where possible.
- Standardize critical-command target, permission/authority, confirmation and pending/success/failure feedback.
- Complete empty/loading/offline/degraded states and EN/FR/DE/a11y/touch behavior.

## Non-goals

- No new robot controller, kinematics stack or duplicate jog implementation.
- No direct HMI manipulation of Three.js, no jog during replay and no claim of functional safety.
- No unnecessary application split or duplicated views.

## Architecture boundaries

- The server authorizes roles/tenants and owns control authority; route hiding is not authorization.
- The simulator is the source for executed pose/motion state and enforces motion safety.
- The HMI presents state and operator intent using generated contracts.
- `Definition ≠ Runtime ≠ Visual ≠ Collision ≠ Telemetry` remains explicit.

## Backend and contract changes

- Reuse or add only the minimal scoped read/command contracts required for robot state and jog authority.
- Enforce policies, tenant/cell target validation, command correlation and audit records server-side.
- Stop/expire jog commands on disconnect or authority loss; avoid broad SignalR broadcasts.

## Simulator changes

- Publish authoritative joints, TCP/orientation, frames/tool, motion status and authority with documented units and cadence.
- Route jog intent into the existing dead-man/limit/collision/control-authority path.
- Stop motion on dead-man release, lost focus/connection, mode change, authority loss or safety fault.

## HMI and information architecture

- Operator: Home, Current Job, Jobs, Robot, Alarms, Messages.
- Engineering: Cell Editor, Signal Mapping, Connectors, Diagnostics, Time Travel, Asset Catalog.
- Training: Scenarios, Step Mode, Fault Lab, Assessment, Instructor Dashboard.
- Administration: identity/context, system health and deployment/support diagnostics.
- Adapt placement to existing route ownership; role users see only relevant entries and direct navigation is guarded.
- Robot view is usable on touch and desktop and clearly states units, frames, target cell/robot and stale/offline state.

## Backward compatibility

- Existing route URLs remain redirectable/bookmark-compatible unless a documented migration is necessary.
- Existing simulator engineering jog workflows continue through the shared controller.

## Failure and degraded modes

- Stale/disconnected telemetry is visibly stale and disables commands.
- Authority/mode/policy change mid-jog stops motion and explains why.
- Unsupported robot/frame/tool data shows bounded unavailable states, not fabricated zeros.
- Replay is always read-only.

## Testing strategy

- Role visibility and direct-route guard tests for every persona.
- Robot Positions rendering/units/frame/status and stale/offline tests.
- Jog authorization, compatible mode, dead-man, limit, authority loss, disconnect and replay-denial tests.
- Touch layouts, keyboard/focus, screen-reader labels, contrast, i18n completeness and visual regression.
- Live E2E with an assigned S51/S52 Job where appropriate and all applicable quality gates.

## Performance and security considerations

- Throttle/render telemetry without hiding state changes; document update cadence.
- Server policies remain authoritative; audit sensitive jog actions without logging tokens or secrets.
- Never allow a client-crafted robot/cell id to cross tenant or authority boundaries.

## Documentation changes

- Update HMI design/persona guidance, route matrix, Robot/jog operating instructions, units/frames, accessibility notes and limitations.

## Acceptance criteria

1. `/robot-positions` shows authoritative joint, TCP, orientation, frame/tool, status and authority data.
2. Authorized jog works only in compatible mode with dead-man and existing safety checks.
3. Jog stops on release, disconnect, authority loss or safety state and is impossible in replay.
4. Each persona has a clear, guarded navigation surface without duplicated functionality.
5. Critical commands expose target and lifecycle feedback; EN/FR/DE, touch and accessibility gates pass.

## Evidence expected for completion

Record route/RBAC negatives, robot-state fixtures, jog safety/authority tests, E2E/a11y/visual results and applicable build/contract/security gates.

## Rollback and failure containment

Navigation changes must be reversible through route metadata. If live robot state is unavailable, disable jog and retain read-only degraded UI; never fall back to unguarded local control.

## Follow-up items

- Scene-wide asset ownership and LOD are S54.
