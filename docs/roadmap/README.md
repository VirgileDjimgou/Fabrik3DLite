# Fabrik3D delivery roadmap

Fabrik3D is a modular browser-based industrial simulation, training, digital-twin and lightweight virtual-commissioning platform that connects realistic virtual equipment, external controllers, operator interfaces and educational scenarios through explicit versioned contracts. This roadmap evolves the existing repository incrementally toward that platform without restarting or replacing working modules.

It deliberately does not restart the project. Every sprint must preserve working behavior and introduce migrations or compatibility adapters when boundaries change. S01-S64 are historical, completed work; their briefs, evidence and completion records are an audit trail and must never be renumbered, rewritten or deleted. Roadmap Revision 2 added post-1.0 hardening in S51-S57, Roadmap Revision 3 added visual-fidelity and product-polish work in S58-S64, and Roadmap Revision 4 plans industrial visual fidelity and scenario motion in S65-S71.

## One-command workflow

From the repository root:

```powershell
npm run sprint:next
```

The command activates the first pending sprint, or resumes the current active sprint. It generates [`CURRENT_SPRINT.md`](CURRENT_SPRINT.md), which is the execution brief for a human developer or coding agent.

Useful commands:

```powershell
npm run sprint:status
npm run sprint:validate
npm run sprint:show
npm run sprint:complete -- --summary "Implemented ..." --evidence "dotnet test; npm test; npm run build"
```

A sprint can only be marked complete when a summary and test evidence are supplied. The script records them in [`state.json`](state.json). `sprint:validate` checks roadmap structure, unique ids, brief existence, dependencies (including cycles), state references, and active-sprint consistency before any sprint is activated.

## Autonomous multi-sprint mode

`Start Next Sprint` now means the bounded autonomous batch: implement, test, validate and complete the current/next sprint, then continue sequentially for a **maximum of 10 successfully completed sprints**, stopping immediately for any genuine human gate, blocker or unresolved mandatory failure. Use:

```powershell
npm run sprint:batch:start
npm run sprint:batch:watch
npm run sprint:batch:status
```

The bounded orchestrator (`scripts/sprint-batch-runner.mjs`) activates each sprint through the existing `sprint-runner`, runs one fresh `sprint-worker` OpenCode child session per sprint, verifies each sprint independently, and is the only layer allowed to decide whether the following sprint starts. It never skips a sprint and never marks a failing sprint complete. `Start One Sprint` remains the atomic escape hatch for exactly one sprint.

The complete contract, state machine, human gate, repair policy, queue usage and Windows examples are in [`AUTOPILOT.md`](AUTOPILOT.md).

## Human and AI-assisted modes

- **Manual development:** run `npm run sprint:next`, read `CURRENT_SPRINT.md`, implement it, execute the gates, then mark it complete.
- **AI-assisted single sprint:** tell Codex, GitHub Copilot, or OpenCode `Start One Sprint`. Repository instructions require the agent to activate and execute the same brief, then stop.
- **Autonomous batch:** tell OpenCode `Start Next Sprint` (`/start-next-sprint`), or queue `/q /start-next-sprint` while it is busy. The batch orchestrator handles up to 10 sprints internally.
- **Mixed development:** an agent can prepare implementation and tests while a human validates visual, educational, and industrial behavior before completion.

The roadmap source of truth is [`roadmap.json`](roadmap.json). Tool-specific files only point to this common workflow.

## Phases

| Phase | Sprints | Outcome |
|---|---:|---|
| 1. Stabilization | S01-S04 | Reproducible builds, tests, contracts, coherent orchestration |
| 2. Modular equipment | S05-S10 | Equipment SDK, robot catalog, kinematics, safety, cell editor |
| 3. Educational experience | S11-S14 | Scenarios, step mode, faults, replay, learning reports |
| 4. Industrial HMI | S15-S17 | Coherent operator UX, alarm lifecycle, diagnostics |
| 5. Connected digital twin | S18-S20 | Normalized twin state, OPC UA, MQTT, end-to-end showcase |
| 6. Professional 3D ecosystem | S21-S25 | Versioned assets, industrial equipment, import workflow, and production-grade rendering |
| 7. Modular industrial scene library | S26-S30 | Scene presets, industrial component libraries, predefined production cells, and extensible simulation behaviors |
| 8. Industrial signal core | S31-S32 | Versioned signal model/I/O registry and a signal-driven CNC reference cell |
| 9. Industrial connectivity & external control | S33-S37 | Real OPC UA, MQTT and Modbus TCP transports, control authority, mapping studio |
| 10. Deep simulation, faults & historian | S38-S41 | Signal/equipment fault injection, high-fidelity reference cell, telemetry historian, deterministic time travel |
| 11. Commercial training foundation | S42-S45 | Authentication/RBAC, organizations and tenancy, server-side training assessment, instructor dashboard |
| 12. Interoperability, deployment & 1.0 | S46-S50 | PLC showcases, on-premise lifecycle, observability/hardening, 1.0 commercialization baseline |
| 13. Product coherence, visual fidelity & hardening | S51-S57 | Authoritative operator workflow, shared 3D runtime, flagship cell, resilience and security/deployment hardening |
| 14. Visual fidelity, 3D scenarios & product polish | S58-S64 | Real 3D scenario runtime, scenario-specific cells, robot/cell fidelity, HMI polish, deterministic visual QA and GPU evidence, browser OIDC/demo isolation, flagship demo |
| 15. Industrial visual fidelity & scenario motion | S65-S71 | Scenario-specific GLB assets, real six-axis scenario motion, deeper deterministic process flows, PBR/environment fidelity, measured composition/cameras and Revision 4 release validation |

## Product modes targeted by S31-S71

- **Training:** scenario → abnormal condition → diagnosis → recovery → assessment, with instructor-led sessions and reports.
- **Virtual commissioning:** real PLC/SoftPLC ↔ Fabrik3D I/O ↔ virtual machine, with explicit control authority.
- **Digital twin:** physical machine → OPC UA/MQTT → Fabrik3D twin → HMI/3D, with observed state distinct from simulated and commanded state.

## Recommended feature priorities

1. Robot catalog and equipment architecture: S05-S08.
2. Cell editor: S09-S10.
3. Educational step-by-step mode: S11-S12.
4. HMI redesign using industrial conventions: S15-S17.
5. Timeline, fault injection, and replay: S13 and S18.
6. OPC UA and MQTT connectors: S19-S20.
7. Professional, replaceable 3D assets and scene realism: S21-S25.
8. Multiple modular industrial scenes and reusable smart equipment: S26-S30.
9. Industrial signal core and a signal-driven reference cell: S31-S32.
10. Real protocol transports and external-controller authority: S33-S37.
11. Signal/equipment faults, historian, and time travel: S38-S41.
12. Identity, tenancy, training assessment, instructor workflows: S42-S45.
13. PLC showcases, on-prem lifecycle, hardening, and the 1.0 baseline: S46-S50.
14. Post-1.0 product coherence, visual fidelity, sustained reliability and deployment/security hardening: S51-S57.
15. Real 3D scenarios, industrial visual fidelity and product polish: S58-S64.
16. Industrial assets, real scenario robot motion, deeper process timing and release validation: S65-S71.

## Sprint count and ceiling

Roadmap Revision 4 contains exactly 71 sprints. S50 remains the immutable Fabrik3D 1.0 baseline; S51-S57 are completed Revision 2 work; S58-S64 are completed Revision 3 work; and S65-S71 are the planned Revision 4 industrial visual-fidelity and scenario-motion work. Real PLC/PLCSIM proof is deliberately deferred until suitable licensed software or physical hardware is available. `MAX_BATCH_SPRINTS = 10` is unchanged, so the bounded autopilot can execute S65-S71 sequentially in a single invocation. Future roadmap work requires another explicitly approved revision that preserves S01-S71 history.

## 1.0 baseline

S50 completes phase 12 and delivers the Fabrik3D 1.0 training/virtual-commissioning baseline: holistic
re-validation of the S01-S49 feature set plus the complete documentation set. See the
[release notes](../releases/RELEASE_NOTES_1.0.md), the
[architecture overview](../architecture/OVERVIEW.md), the
[documentation index](../DOCUMENTATION_INDEX.md) and the
[limitations/non-claims](../operations/LIMITATIONS.md). The 1.0 baseline is **not** a safety,
compliance or competence certification.

## Post-1.0 product hardening

**Phase 13 — Product coherence, visual fidelity and hardening (S51-S57).** It closes the remaining
orchestration/operator-flow gaps, deepens the HMI, shares and measures the 3D asset runtime, develops
one flagship visual cell, hardens sustained operation, deployment and security, and preserves explicit
boundaries between simulated, fixture and real industrial evidence.

Real PLC/PLCSIM validation remains a documented future validation target rather than an active roadmap
sprint because the required licensed external environment or physical controller is not currently
available. This does not weaken the implemented OPC UA/MQTT/Modbus fixture evidence or the S51-S57
product-hardening results.

**Phase 14 — Visual fidelity, real 3D scenarios and product polish (S58-S64, complete).** It made every
`simulation-ready` scenario execute inside a credible 3D industrial cell, raised robot and cell visual
quality, polished the operator HMI, made visual validation deterministic with honest hardware-rendered
performance evidence, completed browser OIDC and public-demo isolation, and produced a polished flagship
demonstration. It added no new protocol, database, framework, MES/ERP/SCADA capability or AI feature.
The Revision 3 evidence is recorded in
[VALIDATION_REVISION_3.md](../operations/VALIDATION_REVISION_3.md), the flagship flow in
[FLAGSHIP_DEMO.md](../operations/FLAGSHIP_DEMO.md), and the release summary in
[RELEASE_NOTES_REVISION_3.md](../releases/RELEASE_NOTES_REVISION_3.md).

**Phase 15 — Industrial visual fidelity and scenario motion (S65-S71, planned).** This revision deepens
the existing five flagship scenarios without adding product scope: it promotes license-safe industrial GLB
assets over procedural fallbacks, reuses the existing robot controller and visual binding for visible J1-J6
work, expands deterministic process stages, improves shared PBR materials and factory dressing, and refines
measured cell composition and camera framing. It concludes with product-coherence cleanup and a measured,
reproducible Revision 4 demonstration. Procedural fallback remains supported; scenario state stays authoritative
over visuals; real PLC/PLCSIM, safety certification and OEM emulation remain explicitly deferred or unclaimed.

## Quality policy

Every sprint adds or updates tests appropriate to its scope and runs the applicable baseline gates. See [`QUALITY_GATES.md`](QUALITY_GATES.md). A sprint is not complete if a required gate fails or if an existing feature is silently removed.
