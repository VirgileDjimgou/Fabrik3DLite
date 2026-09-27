# Accessibility

Status: **findings recorded and fixes implemented (S49)**. Fabrik3D targets **WCAG 2.2 AA** on the
operator HMI and the engineering/instructor surfaces. This document records the method, the findings
and the fixes. It is not an accessibility certification, and no external audit has been performed.

## Scope and method

| Surface | What was reviewed | Method |
| --- | --- | --- |
| Operator HMI (Vue 3) | landmarks, names, focus, keyboard, target sizes, status semantics, colour/state redundancy | automated component tests + automated Playwright assertions + manual keyboard review |
| Engineering/simulator surfaces (Vue 3) | form labels, focus, keyboard reachability, reduced motion | automated component/unit tests + manual review |
| i18n (EN/FR/DE) | untranslated controls and labels | i18n completeness tests + manual pass |

Automated checks do not replace manual review; the manual review complements them and is recorded
below with the exact procedure.

## Automated checks

### Component level (Vitest + Vue Test Utils)

- `HmiBottomNav.test.ts` — the navigation landmark exposes a translated `aria-label`, and decorative
  icons are hidden from assistive technology.
- `HmiGauge.test.ts` — the gauge exposes a single accessible name (`role="img"` + `aria-label`) that
  includes the label and current value.
- `HmiStatusIndicator.test.ts` — status semantics (`role="status"`) are preserved and the icon is
  `aria-hidden`, so status is not conveyed by colour or icon alone.
- `HmiConfirmationDialog.test.ts` — an explicit `type="button"` on actions, the dialog is described
  by its message, focusing the confirm action on open, and Escape cancelling.

Run:

```powershell
npm --prefix Fabrik3D/fabrik3d.hmi run test
```

### Rendered surface (Playwright)

`Fabrik3D/fabrik3d.hmi/e2e/hmi-accessibility.spec.ts` validates the rendered operator workspace
against the live orchestrator:

- a labelled primary-navigation landmark is visible;
- the connection badge exposes `role="status"`;
- the first `Tab` lands on a real, focusable control with a **visible** focus indicator
  (non-`none` outline, width > 0);
- every bottom-navigation control meets the **WCAG 2.2 AA target-size minimum of 24×24 CSS px** (the
  HMI token is 44 px for touch panels).

```powershell
# Start the orchestrator on 127.0.0.1:7249 and a served HMI build, then:
npm --prefix Fabrik3D/fabrik3d.hmi run test:e2e -- --project=hmi-ui
```

The same spec also runs as an **engine matrix** (Chromium, Google Chrome, Microsoft Edge, Firefox,
WebKit) through `playwright.accessibility.config.ts`:

```powershell
npm --prefix Fabrik3D/fabrik3d.hmi run test:a11y
```

S49 result: **15/15 passed** (3 checks × 5 engines). Browser versions and the full matrix are recorded
in [BROWSER_SUPPORT.md](./BROWSER_SUPPORT.md).

## Findings and fixes

| # | Finding | Severity | Fix | Verified by |
| --- | --- | --- | --- | --- |
| A1 | Bottom-navigation landmark had no accessible name. | Minor | `:aria-label` bound to a new translated `nav.label` key (EN/FR/DE). | `hmi-accessibility.spec.ts`, `HmiBottomNav.test.ts` |
| A2 | Decorative Bootstrap icons were announced by screen readers. | Minor | `aria-hidden="true"` on decorative icons across navigation, tiles and status controls. | component tests |
| A3 | Icon-only/status controls could convey state by colour alone. | Moderate | `HmiStatusIndicator` keeps `role="status"` with a text label; the icon is purely decorative. | `HmiStatusIndicator.test.ts` |
| A4 | The gauge SVG had no accessible name. | Moderate | `role="img"` plus a computed `aria-label` including label and value. | `HmiGauge.test.ts` |
| A5 | Buttons without an explicit `type` could submit enclosing forms unexpectedly. | Minor | `type="button"` on non-submit controls. | `HmiBottomNav.test.ts`, `HmiConfirmationDialog.test.ts` |
| A6 | Confirmation dialog did not describe itself and did not move focus / support Escape. | Moderate | `aria-describedby`, focus the confirm action on open, Escape cancels, target text exposed via `data-testid`. | `HmiConfirmationDialog.test.ts` |
| A7 | Touch targets were not asserted against the 24 px minimum. | Moderate | Asserted in `hmi-accessibility.spec.ts`; the HMI uses a 44 px target token. | `hmi-accessibility.spec.ts` |

No **critical** accessibility blocker remains open. Findings A1–A7 are resolved and covered by
automated tests.

## Manual keyboard and contrast review

Procedure (recorded for repeatability):

1. With a keyboard only, `Tab` through the version bar, page content, status pane and bottom
   navigation at both panel (768×1024) and laptop (1366×768) widths.
2. The focused target must remain visible and must not be clipped by the viewport.
3. Trigger a critical confirmation (start a job) and confirm that the dialog identifies its target,
   traps attention on the confirm action and cancels on Escape.
4. Verify that status colours are always paired with a semantic label, never colour alone.
5. Verify that `prefers-reduced-motion: reduce` suppresses interface transitions.

Result: the reviewed flows are keyboard reachable with a visible focus indicator; the confirmation
dialog identifies the target and reports pending/success/failure; no finding required a change
beyond A1–A7.

## Known limitations

- Automated checks cover Chromium, Google Chrome, Microsoft Edge, Firefox and WebKit (Safari engine);
  see [BROWSER_SUPPORT.md](./BROWSER_SUPPORT.md). Assistive-technology (screen-reader) validation with
  NVDA/JAWS/VoiceOver was **not** performed and remains a gap.
- No third-party axe-core/WAVE scan was executed in this environment.
- The simulator's WebGL canvas is visual-only and is not exposed as an accessible control surface;
  the engineering inspector panels provide the textual equivalents.
- WCAG "AAA" contrast targets are not claimed; only AA-level status semantics were reviewed.
