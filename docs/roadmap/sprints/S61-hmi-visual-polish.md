# S61 - HMI visual and operator-experience polish

## Outcome

Improve HMI presentation and information hierarchy without adding new HMI functionality, so the operator surface matches the visual quality of the simulator cells.

## Motivation

S58-S60 raise simulation credibility. The HMI is the operator's primary interface and currently mixes important state with secondary detail. A focused information-hierarchy pass makes the product feel coherent without new features.

## Current-state assumptions to verify

- Inspect the current Overview, Current Job, Job Composer, Robot Positions and Alarms views and their shared layout/components.
- Record existing i18n coverage (EN/FR/DE), accessibility tests and visual snapshots.
- Confirm the S15/S53 design system, semantic status colors and existing HMI tests that must remain green.

## Scope

Focus only on these surfaces:

```text
Overview
Current Job
Job Composer
Robot Positions
Alarms
```

### Overview

Make the primary hierarchy immediately readable:

```text
cell state
operating mode
control authority
current Job
progress
robot state
CNC state
parts completed
cycle duration
primary actions
```

### Current Job

Emphasize:

```text
progress
current task
pallet
scenario
cell/simulator
dispatch state
elapsed time
timeline
```

### Robot

Present:

```text
J1-J6
TCP
frames
tool
state
authority
manual jog
```

as a compact industrial teach-pendant-inspired surface without copying an OEM UI.

### Alarms

Improve hierarchy:

```text
timestamp
severity
source
code
message
state
ACK
```

### Job Composer

Keep current functionality. Improve:

```text
step hierarchy
slot selection
review
target-cell visibility
validation feedback
mobile/touch usability
```

## Non-goals

- No new HMI capability, route, workflow or backend contract.
- No new UI framework or component library.
- No redesign that changes control semantics, authority rules or safety behavior.
- No decorative color; color continues to communicate status.

## Architecture boundaries

- Preserve operator, engineering and instructor persona separation.
- Keep critical actions identifying their target and reporting pending/success/failure.
- Server remains orchestration authority; the HMI displays and commands through existing APIs only.
- Reuse existing design tokens/components; do not create parallel UI primitives.

## Changes

- Reorder and restyle information hierarchy on the five target surfaces.
- Improve typography, spacing, grouping, status emphasis, empty/loading/error states and responsive behavior.
- Improve Job Composer slot selection, review visibility and touch targets.
- Keep the compact robot surface informative, not decorative.

## Backward compatibility

- Preserve all commands, labels meaning, routes and i18n keys behavior; add/rename keys only with translations in EN/FR/DE.
- Preserve keyboard navigation, focus order, ARIA semantics and contrast.
- Existing tests and snapshots are updated only where the intended visual change requires it, with deterministic capture.

## Failure and degraded modes

- Empty, disconnected, unauthorized and error states must remain readable and actionable.
- Long values (job ids, scenario names) truncate gracefully without hiding critical state.

## Testing strategy

- Component tests for hierarchy and state presentation on the five surfaces.
- EN/FR/DE translation-completeness tests.
- Accessibility checks (roles, labels, focus, contrast) as already configured.
- Visual regression screenshots at desktop/laptop/touch widths.
- Existing HMI tests must remain green.
- Run applicable build/type-check/unit/visual/docs/security gates.

## Performance requirements

- No measurable HMI interaction regression; keep bundle impact minimal.
- No heavy new dependency; prefer CSS/layout changes.

## Security and licensing considerations

- No new external asset, font or icon with unclear license.
- No secret, token or personal datum displayed.

## Documentation changes

- Update the HMI design-system documentation for the hierarchy rules and any token/pattern changes.
- Keep screenshots/documentation index accurate.

## Acceptance criteria

1. The five surfaces present the specified primary information hierarchy clearly at desktop and laptop widths.
2. Robot Positions reads as a compact industrial teach-pendant-inspired surface with J1-J6, TCP, frames, tool, state, authority and manual jog.
3. Job Composer keeps its functionality with improved hierarchy, review visibility, validation feedback and touch usability.
4. EN/FR/DE and accessibility are preserved and tested.
5. No new HMI framework or feature was introduced.
6. All applicable gates pass.

## Evidence expected for completion

Record component/accessibility/i18n test results, before/after visual screenshots, and the applicable quality gates.

## Rollback and failure containment

Changes are presentational; each surface can revert independently without touching workflow or contracts.

## Follow-up items

- Deterministic HMI visual regression and real GPU validation are S62.
