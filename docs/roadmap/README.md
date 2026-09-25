# Fabrik3D delivery roadmap

Fabrik3D is a modular browser-based industrial simulation, training, digital-twin and lightweight virtual-commissioning platform that connects realistic virtual equipment, external controllers, operator interfaces and educational scenarios through explicit versioned contracts. This roadmap evolves the existing repository incrementally toward that platform without restarting or replacing working modules.

It deliberately does not restart the project. Every sprint must preserve working behavior and introduce migrations or compatibility adapters when boundaries change. S01-S30 are historical, completed work; their briefs, evidence and completion records are an audit trail and must never be renumbered, rewritten or deleted.

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

By default exactly one sprint is active at a time and `sprint:next` never skips a sprint. Multiple sprints are only authorized when the user explicitly asks for autonomous execution through S50. Even then, each sprint is activated, implemented, tested, validated, documented and recorded independently; progression stops if a mandatory gate fails.

## Human and AI-assisted modes

- **Manual development:** run `npm run sprint:next`, read `CURRENT_SPRINT.md`, implement it, execute the gates, then mark it complete.
- **AI-assisted development:** tell Codex, GitHub Copilot, or OpenCode `Start Next Sprint`. Repository instructions require the agent to activate and execute the same brief.
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

## Product modes targeted by S31-S50

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

## Sprint count and ceiling

This roadmap contains exactly 50 sprints. There is no S51. New work after S50 must be proposed as a separate, explicitly approved roadmap revision that preserves history.

## Quality policy

Every sprint adds or updates tests appropriate to its scope and runs the applicable baseline gates. See [`QUALITY_GATES.md`](QUALITY_GATES.md). A sprint is not complete if a required gate fails or if an existing feature is silently removed.
