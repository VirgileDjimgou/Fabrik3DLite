# Fabrik3D 1.0 release notes

Release: **1.0** (S50 commercialization baseline)
Status: educational/training demonstrator. Not safety-certified, not an OEM emulator, not a
certified digital twin.

These notes summarize what the 1.0 baseline contains, what changed from the last pre-1.0 state, the
supported upgrade path, and the known limitations. Every claim here is backed by the documentation
and automated tests linked throughout.

## Highlights

Fabrik3D 1.0 is a browser-based industrial simulation, training, digital-twin and lightweight
virtual-commissioning platform for a robotic CNC-tending cell. It brings together:

- a **3D simulator** (Vue 3 + Three.js) with five scene presets, a cell editor, guided scenarios,
  step mode, kinematics/safety checks, a fault lab, a signal inspector, a mapping studio and
  read-only time travel;
- an **operator HMI** (Vue 3) for job preparation and supervision, alarms, messages and settings;
- an **ASP.NET Core orchestrator** with MongoDB persistence, shared generated contracts, SignalR and
  server-side identity, tenancy, assessment and audit;
- optional, disabled-by-default **OPC UA, MQTT and Modbus TCP** conduits with fail-closed write
  policy and explicit control authority;
- a **bounded telemetry/event historian** and deterministic, read-only **time travel**;
- **server-assessed training sessions** with an instructor dashboard;
- a **hardened on-premise Docker stack** with profiles, healthchecks, backup/restore and schema
  migrations;
- **observability, security and accessibility hardening** with recorded evidence.

## What is real, simulated and planned

- **Real / implemented:** the orchestrator, persistence and migrations, RBAC and tenancy, the real
  OPC UA/MQTT/Modbus clients (with in-process fixtures for verification), the historian, time-travel
  reconstruction, control authority, deployment tooling and training assessment.
- **Simulated:** the robot, CNC cycle, conveyor, faults, safety conditions, signals and all learning
  data. Labelled as training data everywhere.
- **Experimental / manual:** OPC UA development certificate auto-accept (explicit opt-in); real
  CODESYS/PLCSIM runs (manual checklists over the same mapping).
- **Not in scope:** new protocols, OEM emulation, billing/marketplace, safety certification. See
  [LIMITATIONS.md](../operations/LIMITATIONS.md).

## Feature summary by phase

| Phase | Sprints | Delivered |
| --- | --- | --- |
| Stabilization | S01-S04 | Reproducible builds, test foundation, generated contracts, coherent orchestration. |
| Modular equipment | S05-S10 | Equipment SDK, robot catalog, kinematics, motion safety, cell editor and persistence. |
| Educational experience | S11-S14 | Scenario engine, step mode, faults/timeline/replay, learning reports. |
| Industrial HMI | S15-S17 | Design system, alarm lifecycle, operations diagnostics. |
| Connected twin | S18-S20 | Normalized twin state, optional OPC UA, MQTT showcase. |
| Professional 3D | S21-S25 | Versioned GLB assets, industrial equipment, import hardening. |
| Scene library | S26-S30 | Scene presets, safety/infrastructure and material-flow libraries, predefined cells. |
| Industrial signals | S31-S32 | Versioned signal core and the signal-driven CNC reference cell (54 signals). |
| Connectivity & authority | S33-S37 | Real OPC UA/MQTT/Modbus transports, control authority, mapping studio. |
| Deep simulation | S38-S41 | Fault injection, high-fidelity reference cell, historian, time travel. |
| Training foundation | S42-S45 | Auth/RBAC, organizations/tenancy, server assessment, instructor dashboard. |
| Interop, deployment, 1.0 | S46-S50 | PLC showcases, on-prem lifecycle, observability/hardening, 1.0 baseline. |

## Changes since the last pre-1.0 release

The last pre-1.0 state was S49 (observability and hardening). 1.0 (S50) is a **validation and
documentation baseline**; it introduces no new product features and preserves S01-S49 public
behavior. Changes:

- a consolidated [architecture overview](../architecture/OVERVIEW.md) and
  [documentation index](../DOCUMENTATION_INDEX.md);
- new audience guides: [learner quick start](../guides/LEARNER_QUICKSTART.md),
  [instructor](../guides/INSTRUCTOR_GUIDE.md),
  [external controller](../guides/EXTERNAL_CONTROLLER_GUIDE.md),
  [signal mapping](../guides/SIGNAL_MAPPING_GUIDE.md), [fault lab](../guides/FAULT_LAB_GUIDE.md);
- new operations documents: [limitations](../operations/LIMITATIONS.md),
  [security model](../operations/SECURITY_MODEL.md),
  [data and privacy](../operations/DATA_AND_PRIVACY.md);
- a self-contained [1.0 reference sample project](../samples/fabrik3d-1.0-reference-project/README.md)
  (cell + scenario + mapping + example training-session report);
- an automated documentation/sample-project integrity gate (`npm run docs:check`);
- updated `README.md` and roadmap status for the 1.0 baseline.

## Upgrade and migration

- **Schema/version matrix.** Cell files support `1.0` (current) and `0.9` (migrated on load). Signal
  snapshots, mappings, twin telemetry, scenarios, scene presets and training reports are versioned
  and validated; migrations are explicit and tested. See
  [CELL_FILES.md](../architecture/CELL_FILES.md) and
  [INDUSTRIAL_SIGNAL_CORE.md](../architecture/INDUSTRIAL_SIGNAL_CORE.md).
- **Database migrations.** Additive, versioned, idempotent migrations run at startup with
  bookkeeping; re-running applies nothing and never rewrites applied timestamps. See
  [UPGRADE_ROLLBACK.md](../operations/UPGRADE_ROLLBACK.md).
- **Single documented path from the last pre-1.0 release.** Follow
  [UPGRADE_ROLLBACK.md](../operations/UPGRADE_ROLLBACK.md): pin images, back up
  ([BACKUP_RESTORE.md](../operations/BACKUP_RESTORE.md)), apply the new images, confirm
  `/api/health/ready` and `/api/version`, and roll back by restoring the previous images and backup
  if needed.
- **Compatibility.** Existing cell files, scenarios, mappings and stored sessions remain readable.
  Intentionally changed behavior since S01 is documented in the sprint records under
  `docs/roadmap/`.

## Verification

The 1.0 baseline is verified by the full gate matrix in
[QUALITY_GATES.md](../roadmap/QUALITY_GATES.md): backend build and tests (including connector
fixtures, historian, authority and migration tests), generated-contract check, simulator and HMI
type-check/test/build, Playwright visual and E2E suites, the accessibility matrix, dependency audits,
secret scan, Docker configuration validation and the documented lifecycle procedures. The S50
transcript is recorded in [VALIDATION_1.0.md](../operations/VALIDATION_1.0.md) and in the S50
completion record.

Performance and load numbers for the 1.0 build are recorded with their reference hardware in
[PERFORMANCE.md](../operations/PERFORMANCE.md) and
[OBSERVABILITY.md](../operations/OBSERVABILITY.md); they are measurements, not guarantees.

## Known limitations

See [LIMITATIONS.md](../operations/LIMITATIONS.md) for the complete list. In short: no safety,
compliance or competence certification; no OEM emulation; connectors disabled by default; the public
demo is shared and best-effort; some HMI surfaces (robot positions) are placeholders; accessibility
targets WCAG 2.2 AA but screen-reader validation is outstanding.

## Documentation

Start at the [documentation index](../DOCUMENTATION_INDEX.md). The
[architecture overview](../architecture/OVERVIEW.md), the [administrator guide](../operations/ADMINISTRATOR_GUIDE.md),
the [learner quick start](../guides/LEARNER_QUICKSTART.md) and the
[1.0 reference sample project](../samples/fabrik3d-1.0-reference-project/README.md) are the fastest
routes into the product.

## Roadmap

S50 is the final sprint of the original 50-sprint roadmap and remains the immutable 1.0 baseline.
Roadmap Revision 2 was subsequently approved for planned post-1.0 product hardening in S51-S58; it
does not retroactively change this release or its evidence.
