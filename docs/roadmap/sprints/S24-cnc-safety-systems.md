# S24 - Professional CNC and safety systems

## Outcome

Deliver a credible machining enclosure and industrial safeguarding system driven by the current simulation and safety state.

## Scope

- Generate a professional CNC asset with enclosure panels, loading door/window, interlock hardware, spindle, chuck or fixture, work area, tool magazine representation, chip tray/conveyor, coolant details, vents, service panels, operator console, emergency stop, and stack light.
- Map door, spindle, fixture and stack-light semantic nodes to the existing CNC state machine without moving CNC behavior into the visual model.
- Replace simplified safety presentation with modular fences, posts, mesh panels, kick plates, interlocked gates, light curtains or scanners, floor markings, and transparent diagnostic zones.
- Separate physical guards, sensing devices, diagnostic keep-out volumes, and collision proxies.
- Bind safety visuals to known safe/running/warning/fault/offline states using the existing semantic color rules.
- Align CNC access, robot loading anchor, work-object frame, guard openings, and current collision corridors.
- Preserve procedural CNC and diagnostic zone visuals as fallbacks.

## Tests and gates

- Deterministic tests for door travel, access corridor, work-object/fixture frames, interlock bindings, guard bounds, and safety-zone transforms.
- State-transition tests for CNC animation and safety color/status mapping.
- Visual regression screenshots for loading, machining, unloading, interlock-open, warning, and fault states.
- Collision and reachability regression tests for the complete robot/CNC/pallet workflow.
- Simulator type-check, unit tests, visual tests, production build, and applicable workspace baseline gates.

## Acceptance criteria

- The CNC and safeguards appear industrially plausible while preserving all existing workflow outcomes.
- Physical geometry and diagnostic zones are visually distinguishable and cannot be mistaken for certified safety validation.
- The robot can still reach the declared loading target through the documented safe opening without visual/collision disagreement.
- Missing assets retain the current functional scene through fallbacks.

## Non-goals

- No safety certification claim or exact OEM machine emulation.
- No PLC safety-program implementation.
