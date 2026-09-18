# Alarm workflows

Fabrik3D models an educational alarm lifecycle: Active, ReturnedToNormal, Acknowledged, Shelved, and Closed. Each transition is explicitly checked server-side and appends an immutable embedded audit entry containing the action, actor, time, and optional note.

Alarm details retain first/last occurrence, count, source equipment, severity, cause, consequence, and operator guidance. Operator messages remain a separate entity and view; they are informational and must not use alarm severity styling.

Shelving is only a training aid. This lifecycle is inspired by alarm-management concepts and is not an IEC 62682 compliance claim or a substitute for a certified safety system.
