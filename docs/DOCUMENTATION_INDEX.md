# Fabrik3D documentation index

Status: 1.0 baseline. This index is the map of the documentation set. Every link below resolves to a
file in this repository; broken documentation links fail the `npm run docs:check` gate.

Notation: **implemented** = built and tested; **simulated** = modeled, explicitly training data;
**experimental** = opt-in and documented as such; **manual** = a documented human procedure;
**placeholder** = present but not functional.

## Start here

| Document | Audience |
| --- | --- |
| [Repository README](../README.md) | Everyone |
| [Architecture overview](architecture/OVERVIEW.md) | Everyone |
| [Learner quick start](guides/LEARNER_QUICKSTART.md) | Learner |
| [1.0 reference sample project](samples/fabrik3d-1.0-reference-project/README.md) | Learner / instructor |
| [Release notes 1.0](releases/RELEASE_NOTES_1.0.md) | Everyone |
| [Limitations and non-claims](operations/LIMITATIONS.md) | Everyone |
| [Setup](development/SETUP.md) | Developer |
| [Testing](TESTING.md) | Developer |

## Guides by audience

### Learner

- [Learner quick start](guides/LEARNER_QUICKSTART.md)
- [Scenarios](architecture/SCENARIOS.md)
- [Step mode](architecture/STEP_MODE.md)
- [Fault lab guide](guides/FAULT_LAB_GUIDE.md)
- [Learning assessment and reports](architecture/LEARNING_ASSESSMENT_REPORTS.md)

### Instructor

- [Instructor guide](guides/INSTRUCTOR_GUIDE.md)
- [Instructor dashboard](architecture/INSTRUCTOR_DASHBOARD.md)
- [Training sessions and assessment](architecture/TRAINING_SESSIONS.md)
- [Fault lab architecture](architecture/FAULT_LAB.md)
- [Organizations and tenancy](architecture/ORGANIZATIONS_AND_TENANCY.md)

### Operator

- [Operator HMI overview](../README.md#operator-hmi)
- [Orchestration and traceability](architecture/ORCHESTRATION.md)
- [Alarm workflows](architecture/ALARM_WORKFLOWS.md)
- [Operations diagnostics](architecture/OPERATIONS_DIAGNOSTICS.md)
- [HMI design system](architecture/HMI_DESIGN_SYSTEM.md)

### Engineer / integrator

- [External controller guide](guides/EXTERNAL_CONTROLLER_GUIDE.md)
- [Signal mapping guide](guides/SIGNAL_MAPPING_GUIDE.md)
- [Industrial signal core](architecture/INDUSTRIAL_SIGNAL_CORE.md)
- [Reference signal catalog](architecture/REFERENCE_SIGNAL_CATALOG.md)
- [Control authority](architecture/CONTROL_AUTHORITY.md)
- [OPC UA adapter](architecture/OPC_UA_ADAPTER.md) — **implemented** (real client, disabled by default)
- [MQTT transport](architecture/MQTT_SHOWCASE.md) — **implemented** (real client, disabled by default)
- [Modbus TCP adapter](architecture/MODBUS_TCP_ADAPTER.md) — **implemented** (real client, disabled by default)
- [Signal mapping studio](architecture/SIGNAL_MAPPING_STUDIO.md)
- [CODESYS / SoftPLC showcase](showcases/codesys-softplc/README.md) — **implemented** fixture, **manual** real run
- [Siemens / PLCSIM profile](showcases/siemens-plcsim/README.md) — **implemented** fixture, **manual** real run
- [Telemetry historian](architecture/TELEMETRY_HISTORIAN.md)
- [Deterministic time travel](architecture/TIME_TRAVEL.md)

### Administrator

- [Administrator guide](operations/ADMINISTRATOR_GUIDE.md)
- [Deployment](operations/DEPLOYMENT.md)
- [Requirements](operations/REQUIREMENTS.md)
- [Backup and restore](operations/BACKUP_RESTORE.md)
- [Upgrade and rollback](operations/UPGRADE_ROLLBACK.md)
- [Support bundle](operations/SUPPORT_BUNDLE.md)
- [Observability](operations/OBSERVABILITY.md)
- [Performance](operations/PERFORMANCE.md)
- [Failure and recovery matrix](operations/RECOVERY_MATRIX.md)
- [Security model](operations/SECURITY_MODEL.md)
- [Threat model](operations/THREAT_MODEL.md)
- [Security hardening](operations/SECURITY_HARDENING.md)
- [Repository and binary policy](operations/REPOSITORY_POLICY.md)
- [Accessibility](operations/ACCESSIBILITY.md)
- [Browser support](operations/BROWSER_SUPPORT.md)
- [Release-candidate checklist](operations/RELEASE_CANDIDATE_CHECKLIST.md)
- [Data and privacy](operations/DATA_AND_PRIVACY.md)
- [Validation evidence](operations/VALIDATION.md)

## Architecture reference

| Document | Topic |
| --- | --- |
| [Overview](architecture/OVERVIEW.md) | Components, boundaries, data flow |
| [Orchestration](architecture/ORCHESTRATION.md) | Jobs, claims, sessions, heartbeats |
| [Contracts](architecture/CONTRACTS.md) | Generated OpenAPI/TypeScript contracts |
| [Equipment SDK](architecture/EQUIPMENT_SDK.md) | Versioned equipment definitions |
| [Robot catalog](architecture/ROBOT_CATALOG.md) | Generic six-axis profiles |
| [Kinematics and frames](architecture/KINEMATICS_AND_FRAMES.md) | FK/IK, frames, units |
| [Motion safety](architecture/MOTION_SAFETY.md) | Collision/reachability guards |
| [Cell editor](architecture/CELL_EDITOR.md) | Visual cell authoring |
| [Cell files](architecture/CELL_FILES.md) | Versioned cell schema and migration |
| [Scenes](architecture/SCENE_PRESETS.md) | Scene preset catalog |
| [Scenarios](architecture/SCENARIOS.md) | Scenario format and runner |
| [Step mode](architecture/STEP_MODE.md) | Guided checkpoints |
| [Faults, timeline, replay](architecture/FAULTS_TIMELINE_REPLAY.md) | Typed faults and replay |
| [Fault lab](architecture/FAULT_LAB.md) | Overlay fault engine |
| [Digital-twin telemetry](architecture/DIGITAL_TWIN_TELEMETRY.md) | Normalized twin state |
| [Industrial signal core](architecture/INDUSTRIAL_SIGNAL_CORE.md) | Versioned signal model |
| [Reference signal catalog](architecture/REFERENCE_SIGNAL_CATALOG.md) | 54 reference-cell signals |
| [Control authority](architecture/CONTROL_AUTHORITY.md) | Exclusive arbitration |
| [Signal mapping studio](architecture/SIGNAL_MAPPING_STUDIO.md) | Mapping files and apply |
| [Telemetry historian](architecture/TELEMETRY_HISTORIAN.md) | Bounded storage and queries |
| [Time travel](architecture/TIME_TRAVEL.md) | Read-only reconstruction |
| [Identity and RBAC](architecture/IDENTITY_AND_RBAC.md) | Authentication and roles |
| [Organizations and tenancy](architecture/ORGANIZATIONS_AND_TENANCY.md) | Tenant boundaries |
| [Training sessions](architecture/TRAINING_SESSIONS.md) | Server assessment |
| [Instructor dashboard](architecture/INSTRUCTOR_DASHBOARD.md) | Instructor surface |
| [3D assets](architecture/3D_ASSETS.md) | GLB asset SDK and budgets |
| [Shared asset runtime](architecture/ASSET_RUNTIME.md) | Cache, refcounting and adaptive LOD |
| [Hero reference cell](architecture/HERO_REFERENCE_CELL.md) | Flagship cell, pipeline and budgets |
| [CNC and safety visuals](architecture/CNC_AND_SAFETY_VISUALS.md) | State-driven visuals |
| [Industrial scene](architecture/INDUSTRIAL_SCENE.md) | Scene composition |
| [Predefined scenes](architecture/PREDEFINED_INDUSTRIAL_SCENES.md) | Built-in cells |
| [Material flow and tooling](architecture/MATERIAL_FLOW_AND_TOOLING.md) | Flow library |
| [Asset import](architecture/ASSET_IMPORT.md) | Trusted package import |
| [Floating panels](architecture/FLOATING_PANELS.md) | Panel system |
| [Decision records](adr/README.md) | ADR 0001-0006 |

## Operations and evidence

- [Validation](operations/VALIDATION.md) — recorded S48 lifecycle transcript
- [Validation 1.0](operations/VALIDATION_1.0.md) — recorded S50 1.0 gate and lifecycle transcript
- [Validation post-1.0](operations/VALIDATION_POST_1.0.md) — automated flagship workflow/fixture evidence plus explicitly deferred real-PLC validation
- [TESTING.md](TESTING.md) — test layers and commands
- [Dependency audit](development/DEPENDENCY_AUDIT.md)
- [Troubleshooting](development/TROUBLESHOOTING.md)
- Demo assets: [`demo/`](demo/) (screenshots, fixtures)

## Roadmap and process

- [Roadmap overview](roadmap/README.md)
- [Quality gates](roadmap/QUALITY_GATES.md)
- [Autopilot contract](roadmap/AUTOPILOT.md)
- [Roadmap source of truth](roadmap/roadmap.json)

## Maturity summary

| Area | Status |
| --- | --- |
| Orchestrator, persistence, migrations, contracts | Implemented |
| RBAC, tenancy, audit | Implemented |
| Real OPC UA / MQTT / Modbus clients | Implemented, disabled by default |
| Historian, time travel, control authority | Implemented |
| Training sessions and instructor dashboard | Implemented |
| Deployment stack, backup/restore, upgrade tooling | Implemented |
| Simulated robot/CNC/conveyor/faults/signals/learning data | Simulated |
| OPC UA dev certificate auto-accept | Experimental (explicit opt-in) |
| Real CODESYS / PLCSIM runs | Manual checklist |
| HMI robot positions and guarded manual jog | Implemented (simulated reference cell) |
