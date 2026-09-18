# Fabrik3D delivery roadmap

This roadmap evolves the existing repository incrementally into a modular educational platform for building, simulating, supervising, and understanding robotic cells, from a virtual scenario to a connected digital twin.

It deliberately does not restart the project. Every sprint must preserve working behavior and introduce migrations or compatibility adapters when boundaries change.

## One-command workflow

From the repository root:

```powershell
npm run sprint:next
```

The command activates the first pending sprint, or resumes the current active sprint. It generates [`CURRENT_SPRINT.md`](CURRENT_SPRINT.md), which is the execution brief for a human developer or coding agent.

Useful commands:

```powershell
npm run sprint:status
npm run sprint:show
npm run sprint:complete -- --summary "Implemented ..." --evidence "dotnet test; npm test; npm run build"
```

A sprint can only be marked complete when a summary and test evidence are supplied. The script records them in [`state.json`](state.json).

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

## Recommended feature priorities

1. Robot catalog and equipment architecture: S05-S08.
2. Cell editor: S09-S10.
3. Educational step-by-step mode: S11-S12.
4. HMI redesign using industrial conventions: S15-S17.
5. Timeline, fault injection, and replay: S13 and S18.
6. OPC UA and MQTT connectors: S19-S20.
7. Professional, replaceable 3D assets and scene realism: S21-S25.
8. Multiple modular industrial scenes and reusable smart equipment: S26-S30.

## Quality policy

Every sprint adds or updates tests appropriate to its scope and runs the applicable baseline gates. See [`QUALITY_GATES.md`](QUALITY_GATES.md). A sprint is not complete if a required gate fails or if an existing feature is silently removed.
