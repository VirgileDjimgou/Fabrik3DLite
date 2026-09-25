# Fabrik3DLite

[![Fabrik3D CI](https://github.com/VirgileDjimgou/Fabrik3DLite/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/VirgileDjimgou/Fabrik3DLite/actions/workflows/ci.yml)
[![Docker](https://github.com/VirgileDjimgou/Fabrik3DLite/actions/workflows/docker.yml/badge.svg?branch=main)](https://github.com/VirgileDjimgou/Fabrik3DLite/actions/workflows/docker.yml)
[![.NET 8](https://img.shields.io/badge/.NET-8.0-512BD4)](https://dotnet.microsoft.com/)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20.19%2B-5FA04E)](https://nodejs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7%2F8-47A248)](https://www.mongodb.com/)

Fabrik3DLite is an educational industrial-software demonstrator for designing, simulating, supervising, and understanding a robotic cell. It brings together a 3D robotic-cell simulator, an orchestration backend, and a dedicated operator HMI around an explicit digital-twin model.

It is intended for learning, technical demonstrations, and prototyping. It is **not** a safety-certified control system, an OEM robot-program emulator, or a substitute for commissioning a physical cell.

## Live demo

The public demonstration runs the complete Docker stack simulator, operator HMI, ASP.NET Core orchestrator, and MongoDB on Hetzner and is published through Cloudflare Tunnel. Both interfaces use the same live orchestration backend.

| Interface        | Link                                                      | Use it for                                                                       |
| ---------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **3D simulator** | [Open the simulator](https://fabrik3d.patrickdjimgou.dev) | Run scenes, guided learning scenarios, fault exercises, and cell editing.        |
| **Operator HMI** | [Open the HMI](https://fabrik3d-hmi.patrickdjimgou.dev)   | Create and supervise jobs, inspect machine state, and follow execution progress. |

### Demo limitations

- This is a shared public training environment: jobs, simulated machine state, and learning data may be changed or reset by other visitors.
- Every robot, CNC, alarm, safety condition, and production signal is simulated; the hosted demo is not connected to physical equipment.
- OPC UA, MQTT and Modbus TCP integrations are implemented but disabled in the public deployment. No command is sent to an industrial controller.
- Availability is best-effort. The instance can be restarted or updated without notice during maintenance and development.

### Product walkthrough

https://github.com/user-attachments/assets/29b87539-a47f-4b07-9dd0-f6e0fa9c2436

_The walkthrough covers a completed scenario, CNC fault recovery, cell editing, and orchestration through the backend API._

## What is implemented

### 3D simulation and learning

- A Three.js robotic CNC-tending cell: pallet feed, six-axis robot, CNC door and machining cycle, part return, and runtime dashboard.
- Five versioned industrial scene presets: CNC tending, vision sorting, palletizing, assembly/inspection, and robot-safety training.
- Eleven guided scenarios, from robot axes and coordinate frames to complete pallet processing and fault-recovery exercises.
- Selectable compact, medium, and heavy generic six-axis robot profiles with reach, payload, joint-limit, tool-compatibility, kinematic, and safety data.
- Deterministic FK/IK-oriented kinematics, SI units, cell/work-object frames, reachability checks, collision primitives, and swept-path checks.
- A training fault lab with typed simulated faults, acknowledgement/reset/retry rules, ordered timeline, deterministic replay, and local learning reports.
- Advanced signal/equipment fault injection (S38): deterministic, seeded overlays (forced/frozen/inverted/delayed/noisy/drifting/intermittent/disconnected/degraded, plus actuator jam/slow, motor overload, vacuum loss, sensor contamination, communications loss) that propagate through the I/O chain, never mutate canonical signal definitions, and are authority-gated so they can never write to a connector.

#### CNC reference-cell walkthrough

The `cnc-machine-tending` preset is the flagship, deep reference cell. Its complete
flow is deterministic and signal-driven:

1. **Pallet feed** — the conveyor brings a raw-material pallet to the work
   position; the infeed and station photoeyes, encoder count and raw/machined slot
   counts are published as signals.
2. **Robot load** — the pallet workflow picks a raw part, approaches the CNC and
   inserts it. Gripper open/closed, payload, dwell and workflow-step signals track
   the motion.
3. **CNC cycle** — a deterministic cycle machine runs door close → fixture clamp →
   spindle spin-up → feed (coolant on) → spindle spin-down → unclamp → door open.
   `cnc-1.CycleStep`, `SpindleSpeed`, `SpindleAtSpeed`, `FeedActive`, `CoolantOn`,
   `FixtureClamped`, `PartPresent`, `DoorLocked` report the exact state the visuals
   render.
4. **Part return** — the robot retrieves the machined part and returns it to the
   same pallet slot; the slot transitions raw → in-process → machined.
5. **Abnormal conditions** — jams, blocked sensors, door/spindle faults, vacuum
   loss and communications loss are injected through the S38 fault lab, propagate
   through the signals, refuse unsafe commands, and recover deterministically when
   the overlay is cleared. The simulated E-stop aborts the cycle and only resets
   once the light curtain and scanner are clear and the gate is closed.

Every state-bearing CNC visual maps to a runtime state/signal
(`equipment/visuals/referenceCellVisualMap.ts`), and the geometry, disposal and
cycle determinism budgets are covered by tests. Measured geometry budgets and
the reference-cell performance notes are in
[3D_ASSETS.md](./docs/architecture/3D_ASSETS.md).

### Industrial signal foundation

- A versioned, protocol-independent signal model (schema `1.0`) with typed values, engineering units, direction semantics, quality, update origin, source arbitration, range/enum validation and read-time staleness.
- A deterministic `SignalRegistry` with stable ids, discovery by equipment and equipment-SDK integration through optional signal declarations.
- A signal-driven CNC reference cell: 54 vendor-neutral signals across robot, CNC, conveyor and safety equipment, bound to the actual runtime. Command signals (Start/Stop/Reset, door, cycle start, conveyor run/speed, safety reset) drive the same workflow, CNC, conveyor and interlock paths as the operator controls, and status signals are derived from real state each frame.
- An engineering I/O signal inspector (`?view=signals` or the expert dock panel) with filters, live quality/source/timestamp and binding-coverage diagnostics.
- A signal mapping studio (`?view=mapping-studio`, engineering mode only) that connects internal signals to OPC UA / MQTT / Modbus targets: versioned `1.0` mapping files, deterministic serialization, import/export, legacy migration, row-level validation, conflict detection, an explicit all-or-nothing apply, and a live signal monitor. Mapping files are data only and never bypass connector write policy. See [Signal mapping studio](./docs/architecture/SIGNAL_MAPPING_STUDIO.md).
- Deterministic snapshot serialization, schema-version validation and a documented migration mechanism. The server-side C# mirror (schema `1.0`) backs the real OPC UA, MQTT and Modbus TCP transports; samples carry an optional control-authority scope/mode context (S36).

### Cell authoring

- Visual editor with grid snapping, overlap detection, undo/redo, reference reset, and 2D plan view.
- Versioned portable cell files (`1.0`) with deterministic import/export, validation, legacy `0.9` migration, and compact/medium/heavy samples.
- Equipment, scene, visual-asset, collision-proxy, port, anchor, parameter, and telemetry-extension registries.
- Named cell-template persistence through the orchestrator.

### Orchestration and supervision

- ASP.NET Core server with MongoDB persistence, OpenAPI/Swagger, SignalR, shared contracts, correlation IDs, and optimistic concurrency.
- Explicit job claim model: the HMI creates work, a simulator claims it, and only that simulator can update its tasks, session, heartbeat, or machine state.
- Job, task, session, machine-state, alarm, message, and cell-template APIs.
- Heartbeat monitoring and faulted-session recovery.
- Separate, multilingual operator HMI (English, French, German) for jobs, active execution, alarms, messages, operating modes, and settings.
- Optional OPC UA, MQTT and Modbus TCP boundaries, kept outside core domain behavior and disabled by default.
- Real OPC UA client transport (S33, implemented): session/subscription lifecycle, bounded-backoff reconnect, explicit certificate trust (development auto-accept is opt-in and warned), monitored items from an explicit node map, quality/timestamp mapping into the protocol-free signal mirror, fail-closed write policy (`AllowWrites` + exact allow-list + writable signal), health/diagnostics counters and `GET /api/connectors/opcua`. Aligned with selected OPC UA concepts; not IEC 62541 certified.
- Real MQTT client transport (S34, implemented with MQTTnet 4.3.7.1207; MQTT 5 by default with a documented 3.1.1 fallback): disabled by default, bounded-backoff reconnect, declared telemetry/command subscriptions, explicit QoS and retained-message policy, session expiry and Last Will, versioned payload validation with `source`/`quality`/`cellId`/`sessionId`/`correlationId`, mapping into the signal mirror as `observed`, fail-closed command allow-list, health/diagnostics counters and `GET /api/connectors/mqtt`. A retained telemetry value without a fresh valid timestamp is only ever surfaced as historical stale state. Verified with an automated Mosquitto Docker fixture; MQTT is an integration boundary and never the internal orchestration bus.
- Real Modbus TCP client transport (S35, implemented): a small self-contained Modbus TCP client based on the public specification, disabled by default, polling coils, discrete inputs, input registers and holding registers into the signal mirror with explicit address convention, unit id, data width, byte order, word order, bit index, scaling, signedness and direction. No byte order is ever guessed; mapping validation rejects ambiguous endianness, invalid widths, addresses, scales and unsafe overlaps. Bounded-backoff reconnect, illegal-address and timeout accounting, fail-closed writes (`AllowWrites` + writable point + exact allow-list), health/diagnostics counters and `GET /api/connectors/modbus`. Verified with an automated in-process Modbus TCP fixture (`Fabrik3D.Modbus.Fixture`, no Docker). Based on the public Modbus TCP specification; not conformance-certified. A Fabrik3D-side Modbus server/slave endpoint is deliberately out of scope.
- Explicit control authority and arbitration (S36, implemented): modes `local-simulation`, `external-controller`, `observed-twin` and `replay`; exactly one authority per equipment/actuator scope; explicit, precondition-checked, quiesced and audited handover; lease heartbeat with a documented degraded mode that never silently reverts to another authority. REST under `/api/control-authority` and the `ControlAuthorityChanged` SignalR event; continuously visible EN/FR/DE authority indicator in the HMI; the simulator cannot command actuators without authority and replay can never command. Verified end-to-end with the in-process Modbus fixture driving a virtual actuator and sensor in a closed loop. This is a training/VC arbitration mechanism, not a certified safety authority.
- Bounded telemetry and event historian (S40, implemented): durable, versioned `telemetrySamples` and `historizedEvents` documents with source, quality, timestamp and correlation id; conservative per-signal sampling (on-change/periodic/deadband); validated, rate-limited batch ingestion (`POST /api/historian/telemetry|events`); read-only filtered, paginated, deterministic queries (`GET /api/historian/telemetry|events|status`); intentional indexes; age/count retention with a background pruner. Disabled by default and fully additive: a disabled or failing historian never breaks live orchestration, and there is no command path from history. Measured on the sprint workstation: 20,000 samples ingested at ~24,000 samples/s, representative query p95 18 ms, ≈270 bytes/sample. See [`docs/architecture/TELEMETRY_HISTORIAN.md`](./docs/architecture/TELEMETRY_HISTORIAN.md).
- Deterministic industrial time travel (S41, implemented): a framework-independent reconstruction engine folds the local timeline or an S40 historian window into a versioned, read-only cell snapshot at a selected time — robot joints/pose (exact, interpolated or held, reported explicitly), CNC sub-state, equipment, material/pallet/slot, signals, alarms, fault overlays, job/session and control-authority state. A replay controller provides play/pause/step/jump-to-event/speed/timeline markers with frame-rate-independent stepping, and a hard code-level isolation gate blocks every OPC UA/MQTT/Modbus write and authority acquisition while replaying. An engineering/instructor surface (`?view=time-travel`) shows unmistakable LIVE/SIMULATION/REPLAY mode indication, a scrubber, event markers and reconstructed state panels; the operator HMI is unchanged. See [`docs/architecture/TIME_TRAVEL.md`](./docs/architecture/TIME_TRAVEL.md).
- Authentication, identity and RBAC (S42, implemented): every mutating REST endpoint and SignalR hub method is enforced server-side through ASP.NET Core JWT bearer authentication and named policies (`Read`, `Operate`, `Engineer`, `Instruct`, `Admin`) over the roles Learner, Instructor, Engineer, Operator and Administrator (plus an opt-in read-only PublicDemo). Production uses a standards-oriented OIDC provider; CI/local use a clearly-labelled, rate-limited `Test`/`Development` identity mode that the server refuses to start with in Production. Audit records carry the authenticated subject, tokens are never placed in URLs or logs, CORS is explicit-origin outside Production, response security headers are applied, and the HMI/simulator login surfaces return to explicit re-authentication on `401` instead of silently degrading to anonymous. The former `CellTemplateAuthorizationPlaceholder` (`X-Operator-Id`) is removed. See [`docs/architecture/IDENTITY_AND_RBAC.md`](./docs/architecture/IDENTITY_AND_RBAC.md).

## Operator HMI

The HMI is the operator-facing surface of Fabrik3D. It provides a touch-oriented command area, a live machine-status sidebar, job preparation and supervision views, and a persistent action bar. The same orchestration state is shared with the simulator through the ASP.NET Core backend and SignalR.

<p align="center">
  <img src="./media/HMI_Home.png" alt="Fabrik3D HMI home screen with operator commands and live machine status" width="31%" />
  <img src="./media/HMI_Jobs.png" alt="Fabrik3D HMI job list with execution state and actions" width="31%" />
  <img src="./media/HMI_CurrentJob.png" alt="Fabrik3D HMI current job view with session and machine state" width="31%" />
</p>

| View            | Purpose                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| **Home**        | Access to start, pause, resume, jobs, positions, messages, and settings, with continuous production context. |
| **Jobs**        | Work queue, state, mode, progress, creation time, and operator actions.                                      |
| **Current job** | Job, session, task, pallet, CNC, robot, and progress details for the active execution.                       |

## Demonstrations and evidence

| Scenario              | Evidence                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| Basic guided scenario | `Robot axes` completed at 100% with its five expected activities.                                     |
| Fault recovery        | A simulated CNC fault requires acknowledgement and reset before retry.                                |
| Cell editor           | A medium six-axis cell with robot, CNC, conveyor, and pallet station validates without schema errors. |
| Backend               | The live orchestration API exposes alarms, templates, jobs, sessions, tasks, and state endpoints.     |

<p align="center">
  <img src="./docs/evidence/simulation-2026-09-18/01-scenario-basic-completed.png" alt="Completed Robot axes scenario" width="420" />
  <img src="./docs/evidence/simulation-2026-09-18/02-cnc-fault-recovery-ready.png" alt="CNC fault recovery procedure" width="420" />
</p>

<p align="center">
  <img src="./docs/evidence/simulation-2026-09-18/03-editor-medium-valid.png" alt="Validated medium robot cell in the editor" width="420" />
  <img src="./docs/evidence/simulation-2026-09-18/04-backend-api-active.png" alt="Active Fabrik3D orchestration API" width="420" />
</p>

The latest evidence set is available in [docs/evidence/simulation-2026-09-18](./docs/evidence/simulation-2026-09-18/).

## Architecture

```mermaid
flowchart LR
    HMI["Operator HMI\nVue 3"] -->|REST + SignalR| Server["Orchestrator\nASP.NET Core"]
    Simulator["3D Simulator\nVue 3 + Three.js"] -->|REST + SignalR| Server
    Server --> Contracts["Shared contracts"]
    Server --> Mongo[(MongoDB)]
    OpcUa["OPC UA (optional)"] -. telemetry .-> Server
    Mqtt["MQTT (optional)"] -. telemetry .-> Server
    Modbus["Modbus TCP (optional)"] -. telemetry .-> Server
```

The server is the orchestration source of truth. In connected mode, a simulator claims a server-side job and reports its state through the shared contracts. If no job is claimed, the simulator explicitly identifies the run as local and never writes simulated execution state to the server.

## Core workflow

```mermaid
sequenceDiagram
    participant Operator as Operator
    participant HMI as Operator HMI
    participant API as ASP.NET Core orchestrator
    participant Simulator as 3D simulator
    participant Mongo as MongoDB

    Operator->>HMI: Create and prepare job
    HMI->>API: REST: create/start job
    API->>Mongo: Persist job and tasks
    Simulator->>API: Claim runnable job
    API->>Simulator: Job, session, task assignment
    loop Each pallet slot
        Simulator->>API: Task, machine, session and heartbeat updates
        API-->>HMI: SignalR state changes
    end
    Operator->>HMI: Pause, resume or stop
    HMI->>API: Command job transition
    API-->>Simulator: SignalR command/state update
```

1. The operator prepares a job through the HMI or API; jobs may carry pallet-slot tasks.
2. The simulator claims the runnable job, processes the physical-cell model, and reports progress through the backend.
3. The HMI remains the operator interface and receives the resulting state changes in real time.

The backend enforces ownership: a foreign or offline simulator cannot overwrite an active session.

## Repository layout

```text
Fabrik3DLite/
├─ Fabrik3D/
│  ├─ fabrik3d.client/          # 3D simulator, editor, scenarios, safety
│  ├─ fabrik3d.hmi/             # Operator HMI
│  ├─ Fabrik3D.Server/          # API, SignalR hub, orchestration services
│  ├─ Fabrik3D.Contracts/       # C# contracts and generated TS contract source
│  ├─ Fabrik3D.Domain/          # Domain entities and transition rules
│  ├─ Fabrik3D.Infrastructure/  # MongoDB persistence and optional adapters
│  └─ Fabrik3D.slnx
├─ docs/                        # Architecture, setup, testing, roadmap, evidence
├─ media/                       # Demo video, GIF, and legacy screenshots
└─ scripts/                     # Contract, asset, and roadmap automation
```

## Run locally

### Prerequisites

- .NET 8 SDK
- Node.js 20.19+ or 22.12+
- MongoDB running locally at `mongodb://localhost:27017`

### Start the services

```powershell
# Terminal 1 — server and Swagger
cd Fabrik3D/Fabrik3D.Server
dotnet run

# Terminal 2 — simulator
cd Fabrik3D/fabrik3d.client
npm install
npm run dev

# Terminal 3 — HMI
cd Fabrik3D/fabrik3d.hmi
npm install
npm run dev
```

Swagger is available from the server launch profile, usually at `/swagger`. For detailed configuration, URL troubleshooting, and environment overrides, see [local setup](./docs/development/SETUP.md) and [troubleshooting](./docs/development/TROUBLESHOOTING.md).

### Run with Docker

The production-style stack — MongoDB, orchestrator, simulator, and HMI behind Nginx — is described by [`Fabrik3D/compose.production.yaml`](./Fabrik3D/compose.production.yaml). Docker Engine with Compose v2 is the only prerequisite; images are built locally from this repository.

```bash
# Build and start the whole stack
docker compose -f Fabrik3D/compose.production.yaml up --build

# Stop (add -v to also reset the MongoDB volume)
docker compose -f Fabrik3D/compose.production.yaml down
```

| Service           | URL                   |
| ----------------- | --------------------- |
| Simulator         | http://localhost:8081 |
| Operator HMI      | http://localhost:8082 |
| Orchestration API | http://localhost:8080 |

The Docker [workflow](./.github/workflows/docker.yml) validates the compose file and builds the same images on every push, so the Docker badge above reflects whether the container setup still builds.

## Verification

The project has deterministic tests for contracts, state transitions, geometry, kinematics, safety checks, editor persistence, scenarios, visual regressions, and orchestration ownership.

```powershell
# From the repository root
npm run contracts:check
npm --prefix Fabrik3D/fabrik3d.client run type-check
npm --prefix Fabrik3D/fabrik3d.client run test
npm --prefix Fabrik3D/fabrik3d.client run test:visual
npm --prefix Fabrik3D/fabrik3d.hmi run type-check
npm --prefix Fabrik3D/fabrik3d.hmi run test
npm --prefix Fabrik3D/fabrik3d.hmi run build
dotnet test Fabrik3D/Fabrik3D.slnx --no-build
```

See [the testing guide](./docs/TESTING.md) for test layers, isolated MongoDB integration tests, and the connected E2E configuration.

### Autonomous sprint batches (maintainers)

`Start Next Sprint` (or `/start-next-sprint` in OpenCode) starts the bounded autopilot: up to **10** sprints implemented one at a time in fresh child sessions, each independently verified before the following sprint may start, with immediate stops for human gates, external blockers or unresolved failures.

```powershell
npm run sprint:batch:dry-run   # preview the sprints that would run; mutates nothing
npm run sprint:batch:start     # launch the detached bounded batch
npm run sprint:batch:status    # read-only progress, lock and human-gate state
npm run sprint:batch:stop      # graceful stop after the current worker returns
```

The full contract, stop conditions and human-gate procedure are documented in [the sprint autopilot guide](./docs/roadmap/AUTOPILOT.md).

## Scope and boundaries

- All educational fault, safety, and learning data are explicitly simulated.
- Safety visuals and motion guards are engineering/teaching aids, not certified safety functions.
- Robot profiles are vendor-neutral generic profiles, not exact OEM models.
- Replay is read-only: replayed telemetry cannot issue commands to a connector.
- OPC UA, MQTT and Modbus TCP writes remain disabled unless deliberately enabled and allow-listed in local configuration.
- Control authority (S36) is an explicit, audited arbitration mechanism for training and virtual commissioning, not a certified safety function; an external controller that loses its lease degrades safely and never silently reverts to another authority.
- The `Development`/`Test` authentication modes exist for local development, CI and the clearly-labelled public demo. They are refused in Production, where an external OIDC provider must be configured; no configuration silently accepts anonymous mutations in Production.

## Further documentation

- [Orchestration and traceability](./docs/architecture/ORCHESTRATION.md)
- [Identity, authentication and RBAC](./docs/architecture/IDENTITY_AND_RBAC.md)
- [Control authority and arbitration](./docs/architecture/CONTROL_AUTHORITY.md)
- [Industrial signal core](./docs/architecture/INDUSTRIAL_SIGNAL_CORE.md)
- [Reference cell signal catalog](./docs/architecture/REFERENCE_SIGNAL_CATALOG.md)
- [Kinematics and frames](./docs/architecture/KINEMATICS_AND_FRAMES.md)
- [Cell files and editor boundaries](./docs/architecture/CELL_FILES.md)
- [Faults, timeline, and replay](./docs/architecture/FAULTS_TIMELINE_REPLAY.md)
- [Instructor fault lab](./docs/architecture/FAULT_LAB.md)
- [Digital-twin telemetry](./docs/architecture/DIGITAL_TWIN_TELEMETRY.md)
- [Telemetry and event historian](./docs/architecture/TELEMETRY_HISTORIAN.md)
- [Deterministic industrial time travel](./docs/architecture/TIME_TRAVEL.md)
- [Optional OPC UA adapter](./docs/architecture/OPC_UA_ADAPTER.md)
- [MQTT transport](./docs/architecture/MQTT_SHOWCASE.md)
- [Modbus TCP adapter](./docs/architecture/MODBUS_TCP_ADAPTER.md)
- [Signal mapping studio](./docs/architecture/SIGNAL_MAPPING_STUDIO.md)
- [Predefined industrial scenes](./docs/architecture/PREDEFINED_INDUSTRIAL_SCENES.md)
- [HMI design system](./docs/architecture/HMI_DESIGN_SYSTEM.md)
- [Roadmap](./docs/roadmap/README.md)
