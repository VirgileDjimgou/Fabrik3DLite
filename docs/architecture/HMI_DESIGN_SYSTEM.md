# Industrial HMI design system

The HMI follows an ISA-101-inspired, vendor-neutral approach: a quiet neutral baseline preserves emphasis for operator-relevant state. Blue and dark neutral colours provide structure; green indicates confirmed success, amber indicates attention/pending work, red indicates a fault, and grey means disabled or offline. Colour is accompanied by a labelled Bootstrap icon and text.

## Components and interaction rules

- `HmiStatusIndicator` provides the normal, loading, pending, success, warning, fault, disabled, and offline states.
- `HmiConfirmationDialog` identifies both the command and its target job before an action is submitted.
- `HmiEmptyState` and `HmiErrorState` give absent data and rejected commands a consistent, accessible treatment.
- Dashboard tiles are navigation affordances. They never start the first available job implicitly; operators select a job and confirm commands in the Current Job faceplate.

Controls have a 44px minimum target and visible keyboard focus. Desktop/laptop layouts retain the content/status hierarchy; below the desktop breakpoint the status pane reflows underneath rather than disappearing.

## Information hierarchy (S61)

The five operator surfaces (Overview, Current Job, Job Composer, Robot Positions, Alarms) share one
token-driven hierarchy language defined in `fabrik3d.hmi/src/assets/main.css`. The rules are
presentational only: no new capability, route, workflow or backend contract was introduced, and
colour continues to communicate status rather than decorate.

- **Primary strip** (`.hmi-status-strip`): the first thing an operator reads. It carries the
  surface's most important state and uses a semantic left border (success/warning/fault/offline)
  derived from runtime state.
- **Primary value** (`.hmi-value--primary`): the single most important number or state on a surface
  (cell state, job progress, robot motion state, critical-alarm count).
- **Secondary value** (`.hmi-value`) and **label** (`.hmi-label`): supporting metrics and their
  uppercase labels.
- **Detail** (`.hmi-detail`) and **truncate** (`.hmi-truncate`): muted secondary text; long job ids,
  scenario names and messages truncate gracefully without hiding critical state.
- **Cards** (`.hmi-card`, `.hmi-card__header`, `.hmi-card__body`) and **metrics** (`.hmi-metric`)
  group related information consistently.

Per-surface ranking:

| Surface | Primary | Secondary |
|---|---|---|
| Overview | cell state, operating mode, control authority, current job, progress | robot state, CNC state, parts completed, cycle duration |
| Current Job | progress, current task, pallet, scenario, elapsed | job identity, dispatch state, target cell/simulator, session timeline, machine state |
| Robot Positions | motion state, authority, operating mode, model, units | J1–J6 with limits, TCP pose, frames/tool, manual jog |
| Alarms | critical/warning/unacknowledged counts | timestamp, severity, source, code, message, lifecycle state, ACK |
| Job Composer | numbered step hierarchy, target cell/scenario/slot summary | identity, pallet, slot grid, generated tasks, server-validated review |

The Robot Positions surface is a compact, teach-pendant-inspired layout (`.hmi-pendant`): joint rows
pair the angle with its declared limits, and the jog controls are grouped per joint. It is inspired
by industrial pendants and does not copy any OEM UI.

The Job Composer uses a numbered step list (`.hmi-steps`), a touch-sized slot grid (`.hmi-slot-grid`,
`.hmi-slot`) and a persistent target-cell strip so the operator always sees which cell the job will
run on. Validation feedback (valid/invalid/warnings) is rendered in the review step before creation.

## Persona surfaces and route matrix (S53)

Operator, engineering, training and administration personas use distinct, guarded surfaces. The
navigation is data-driven (`fabrik3d.hmi/src/navigation/navCatalog.ts`): each entry declares its
group, permission and destination, and the rendered menu is filtered by the role helpers that mirror
the documented server permission matrix. Hiding an entry is a usability choice, not a control — the
server re-authorizes every request.

| Group | Destination | Route / workspace | Permission |
|---|---|---|---|
| Operator | Home, Current Job, Jobs, Robot, Alarms, Messages | `/`, `/current-job`, `/jobs`, `/robot-positions`, `/alarms`, `/messages` | read / operate |
| Engineering | Cell Editor, Signal Mapping, Connectors, Diagnostics, Time Travel, Asset Catalog | simulation workspace (`VITE_SIMULATOR_URL`) | engineer |
| Training | Scenarios, Step Mode, Fault Lab, Assessment | simulation workspace (`VITE_SIMULATOR_URL`) | operate |
| Training | Instructor dashboard | `/instructor` | instruct |
| Administration | Identity, system health and deployment/support diagnostics | `/settings` | read |

Engineering and training authoring views live in the separate simulation workspace deployment
(`fabrik3d.client`); the HMI links to them when `VITE_SIMULATOR_URL` is configured and never
duplicates them. A direct navigation to a guarded HMI route is redirected home by
`navigationGuard`, and `canAccessRoute` is unit-tested for every persona.

The instructor and class dashboard (`/instructor`, S45) is role-gated and reuses the same tokens,
semantic status colours, empty/error states and confirmation dialog as the operator surface. Its
workflows, metrics definitions and limitations are documented in
[`INSTRUCTOR_DASHBOARD.md`](INSTRUCTOR_DASHBOARD.md).

## Robot positions and manual jog (S53)

`/robot-positions` renders the authoritative snapshot published by the assigned simulator through
the scoped REST contract (`GET /api/robots/{cellId}/{robotId}/positions`): J1–J6 in radians with
declared limits, TCP X/Y/Z in meters, intrinsic X-Y-Z orientation in radians, base/tool/work-object
frames, current tool, motion status, operating mode and the live control-authority state. Values are
never fabricated: an unpublished robot shows a bounded unavailable state and a stale report is
flagged and disables commands.

Manual jog is a held action. A press sends `POST /api/robots/{cellId}/{robotId}/jog` with a dead-man
token and is only accepted in `manual-training` mode with a held control authority; the server
re-broadcasts it to the assigned simulator's SignalR group only, where the existing
`OperatorJogGateway` re-uses the `ManualJogController` dead-man/limit/timeout path and the
`MotionSafetyEngine` collision/interlock checks. Release is sent on pointer/key up, focus loss,
visibility change, authority loss, disconnect, mode change and view teardown, and is always accepted
so a stop can never be blocked. Replay is read-only and can never jog. This is simulated HMI
behaviour, not a functional-safety function.

## Language and safety boundaries

English, French, and German use the same terminology keys and are tested for completeness. The UI reports request failures and disables commands while pending, but it is not a safety controller: the server remains the orchestration source of truth and must validate every state transition.
