# Floating HMI and editor panels

Every floating panel uses `useDraggableOverlay`. The component root receives
`panelStyle`; only its labelled header receives `beginDrag` on `pointerdown`.
This keeps controls inside a panel interactive while allowing operators to
place it anywhere in the viewport.

Positions are stored per browser in `localStorage` under
`fabrik3d:panel:<panel-name>`. New panels must use a distinct key and a safe
initial position; they do not need a separate drag-and-drop implementation.

The persistent top bar contains **Reset panels**. It broadcasts a reset to all
mounted panels and removes their stored positions, restoring the defined layout.

The convention applies to execution, expert diagnostics, legacy industrial
views, and the editor catalog/property panels. Full-screen WebGL error output
is deliberately excluded because it is a blocking recovery message, not an
operator panel.
