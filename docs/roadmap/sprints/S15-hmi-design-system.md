# S15 - Industrial HMI design system

## Outcome

Refactor the existing HMI into a coherent operator interface inspired by ISA-101 principles while retaining its Vue 3, TypeScript, Bootstrap, and multilingual foundations.

## Scope

- Audit all screens, actions, statuses, icons, and responsive layouts.
- Define neutral baseline colors, semantic status colors, typography, spacing, touch targets, focus styles, and component states.
- Use color to communicate abnormal or actionable states, not decoration.
- Create reusable overview, faceplate, status, command, confirmation, navigation, and empty/error components.
- Replace implicit actions such as “start first available job” with explicit target selection and contextual confirmation.
- Preserve English, French, and German with terminology reviewed for industrial consistency.

## Tests and gates

- Component tests for normal, loading, pending, success, warning, fault, disabled, and offline states.
- Translation completeness and text-overflow tests.
- Keyboard and basic WCAG accessibility checks.
- Playwright visual regressions at representative industrial panel, desktop, and laptop sizes.
- Usability script for selecting and starting a known job without ambiguity.

## Acceptance criteria

- Every command clearly identifies its target and outcome.
- Status colors and icon styles are consistent across all views.
- Responsive reflow preserves hierarchy and touch usability.

## Non-goals

- No exact reproduction of a specific vendor HMI.
