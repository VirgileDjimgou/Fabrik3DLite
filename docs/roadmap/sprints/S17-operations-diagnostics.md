# S17 - Operations, diagnostics, and accessibility

## Outcome

Complete the educational industrial interface with clear operating modes, communication diagnostics, maintenance information, and inclusive interaction.

## Scope

- Add automatic, manual-training, setup, maintenance, and offline-demo mode behavior with explicit permissions and transitions.
- Add equipment faceplates for robot, CNC, conveyor, sensors, and active tool.
- Add diagnostics for backend, SignalR, simulator heartbeat, database, and future connectors.
- Add controlled manual jog for simulation only, with limits and dead-man-style interaction semantics.
- Improve keyboard navigation, screen-reader labels, contrast, reduced motion, and focus visibility.
- Add operator feedback for pending commands, timeouts, rejection, and reconnect recovery.

## Tests and gates

- Mode-transition and permission tests.
- Manual-jog limit, release, timeout, and collision-prevention tests.
- Diagnostics degradation/recovery integration tests.
- Automated accessibility checks plus documented manual keyboard review.
- End-to-end offline/reconnect/operator recovery journey.

## Acceptance criteria

- The active mode is always visible and governs available actions.
- Manual controls cannot exceed configured robot or cell safety limits.
- Communication loss is visible without making the HMI unusable.

## Non-goals

- No direct safety-rated control of physical machinery.
