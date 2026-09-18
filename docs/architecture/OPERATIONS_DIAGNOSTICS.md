# Operations, diagnostics, and accessibility

The active operating mode is always visible in the HMI. Modes are educational UI permissions: automatic, manual-training, setup, maintenance, and offline-demo. They are not safety-rated controls.

Manual jog is simulator-only. It advances an axis only while a hold is refreshed, stops on release or timeout, clamps declared joint limits, and runs the existing swept collision check before each increment. Backend/SignalR disconnection remains visible through the connection status and the HMI stays navigable in offline-demo mode.

Keyboard focus is visible, controls have a minimum touch target, semantic status labels accompany colour, and reduced-motion preferences suppress interface transitions. Manual keyboard review: tab through the version bar, page content, status pane and bottom navigation; verify the focused target remains visible at panel and laptop widths.
