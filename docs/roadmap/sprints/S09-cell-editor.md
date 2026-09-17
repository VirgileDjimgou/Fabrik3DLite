# S09 - Visual cell editor MVP

## Outcome

Allow users to construct and adjust a robotic cell visually from the equipment catalog.

## Scope

- Add an editor mode separate from execution mode.
- Add/remove/select robot, CNC, conveyor, pallet station, and safety elements.
- Translate and rotate equipment with grid snapping and numeric transform entry.
- Show robot reach, equipment bounds, frames, and invalid overlaps.
- Provide undo/redo and reset-to-reference-cell actions.
- Keep the existing single-conveyor cell available as a built-in template.

## Tests and gates

- Unit tests for editor commands, selection, snapping, undo, and redo.
- Geometry tests for placement transforms and overlap detection.
- Component tests for property panels and catalog insertion.
- Playwright flows for creating and modifying a cell.
- Visual regression on desktop, laptop, and wide touch-panel dimensions.

## Acceptance criteria

- A user can recreate the current cell without editing source code.
- Invalid placement is clearly shown and cannot be mistaken for a valid simulation.
- Editing cannot mutate a running scenario without an explicit mode transition.

## Non-goals

- No collaborative multi-user editing yet.
