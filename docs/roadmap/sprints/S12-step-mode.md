# S12 - Step mode and explainable simulation

## Outcome

Let learners pause the system at meaningful boundaries and understand why each motion or state transition occurs.

## Scope

- Add run, pause, next step, previous explanation, restart, and configurable speed controls.
- Define pedagogical checkpoints independent from animation frames.
- Display current command, source/target frames, target pose, joint values, safety checks, and expected result.
- Highlight the active robot joint, equipment, pallet slot, and CNC phase.
- Add optional guided explanations and an expert mode with raw diagnostics.
- Ensure server job/session state remains coherent while stepping.

## Tests and gates

- State-machine tests for pause/step/resume/restart at every checkpoint.
- Verify that one step cannot execute twice after reconnection or repeated commands.
- Component and accessibility tests for learning controls.
- End-to-end guided machining scenario at slow and accelerated speeds.
- Visual regression for overlays and long FR/DE labels.

## Acceptance criteria

- A learner can advance through a complete cycle one logical action at a time.
- Every step has a clear explanation and observable before/after state.
- Step mode cannot bypass collision or transition validation.

## Non-goals

- No arbitrary reverse physics; “previous” returns to explanation/history unless a checkpoint supports deterministic reset.
