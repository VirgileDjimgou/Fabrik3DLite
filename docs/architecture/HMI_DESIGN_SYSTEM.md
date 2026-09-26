# Industrial HMI design system

The HMI follows an ISA-101-inspired, vendor-neutral approach: a quiet neutral baseline preserves emphasis for operator-relevant state. Blue and dark neutral colours provide structure; green indicates confirmed success, amber indicates attention/pending work, red indicates a fault, and grey means disabled or offline. Colour is accompanied by a labelled Bootstrap icon and text.

## Components and interaction rules

- `HmiStatusIndicator` provides the normal, loading, pending, success, warning, fault, disabled, and offline states.
- `HmiConfirmationDialog` identifies both the command and its target job before an action is submitted.
- `HmiEmptyState` and `HmiErrorState` give absent data and rejected commands a consistent, accessible treatment.
- Dashboard tiles are navigation affordances. They never start the first available job implicitly; operators select a job and confirm commands in the Current Job faceplate.

Controls have a 44px minimum target and visible keyboard focus. Desktop/laptop layouts retain the content/status hierarchy; below the desktop breakpoint the status pane reflows underneath rather than disappearing.

## Persona surfaces

Operator, engineering and instructor personas use distinct surfaces. The instructor and class dashboard
(`/instructor`, S45) is role-gated and reuses the same tokens, semantic status colours, empty/error
states and confirmation dialog as the operator surface; it never changes operator navigation. Its
workflows, metrics definitions and limitations are documented in
[`INSTRUCTOR_DASHBOARD.md`](INSTRUCTOR_DASHBOARD.md).

## Language and safety boundaries

English, French, and German use the same terminology keys and are tested for completeness. The UI reports request failures and disables commands while pending, but it is not a safety controller: the server remains the orchestration source of truth and must validate every state transition.
