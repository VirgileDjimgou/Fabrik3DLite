# Fabrik3D 1.1 release notes

Status: post-1.0 hardening delivered. The Fabrik3D 1.0 baseline (S50) and its evidence remain
immutable; this release adds the completed Roadmap Revision 2 work (S51-S57) and a maintenance lot
that improves licensing, credibility, CI coverage, API error semantics, observability export i18n and
accessibility. It is **not** a safety, certification or OEM-emulation claim.

## Highlights

- **Authoritative execution (S51-S52).** Server-owned job dispatch to a targeted simulator
  (pending → acknowledged → running, idempotent, tenant- and authority-checked) and a production job
  composer with server-side validation, deterministic pallet-slot tasks, atomic creation and a
  server-owned lifecycle (progress, terminal state, preserved timestamps).
- **Operator surfaces (S53).** Role-aware HMI navigation, an authoritative `/robot-positions` view
  (telemetry + held, policy-gated simulated jog) and explicit control-authority feedback.
- **3D fidelity and performance (S54-S56).** Shared scene-scoped asset runtime (cache, refcounting,
  adaptive LOD, procedural fallback), a generated license-safe hero CNC cell with validated budgets,
  a documented recovery matrix and soak/performance harnesses with honest upper-bound labels.
- **Security, deployment and repository hardening (S57).** Reviewed threat model, cross-tenant
  negative matrix, fail-fast security-header policy, extended secret redaction and a non-destructive
  binary/repository policy.
- **Maintenance lot.**
  - MIT [`LICENSE`](../../LICENSE) and README license section.
  - README refreshed: post-1.0 status, current HMI captures, current feature-evidence heading.
  - CI widened with `docs:check`, `security:scan`, `repo:policy`, `audit` and the autopilot/script
    tests, in addition to the existing builds, backend tests and HMI e2e.
  - Unhandled API exceptions now return the documented `500` `ApiErrorDto`
    (`code = "internal_error"`) without leaking internal detail.
  - Optional OTLP export of the Fabrik3D traces and metrics, activated only with
    `Observability:Exporter=Otlp` and an absolute `Observability:OtlpEndpoint`.
  - Client i18n completeness test (EN/FR/DE key parity), French accent fixes and removal of
    hardcoded simulator-catalog strings.
  - Automated axe-core scan in the HMI accessibility suite, plus the two contrast fixes it found.
  - Deterministic HMI visual baseline (the live machine-status panel is masked before capture).

## Roadmap

Roadmap Revision 2 is complete at **S57** (57/57). The originally planned S58 real-PLC proof was
removed because the licensed TIA Portal/PLCSIM environment and physical hardware are unavailable;
real external interoperability stays **unvalidated** and is claimed nowhere.

## Verification (executed 2026-10-01)

```text
dotnet build Fabrik3D/Fabrik3D.slnx                         -> 0 warnings, 0 errors
dotnet test  Fabrik3D/Fabrik3D.slnx --no-build              -> Contracts 5, Infrastructure 16, Server 569; 0 failed
npm run contracts:check                                      -> verified from http://127.0.0.1:7249/swagger/v1/swagger.json
npm --prefix Fabrik3D/fabrik3d.client run type-check          -> clean
npm --prefix Fabrik3D/fabrik3d.client run test                -> 116 files, 603 passed
npm --prefix Fabrik3D/fabrik3d.client run build               -> built
npm --prefix Fabrik3D/fabrik3d.hmi run build                  -> built (vue-tsc + vite)
npm --prefix Fabrik3D/fabrik3d.hmi run test                   -> 23 files, 87 passed
npx playwright test hmi-design-system hmi-accessibility       -> 6 passed (deterministic visual + axe-core scan)
npm run docs:check                                           -> 23 required documents, 360 links resolved
npm run security:scan                                        -> passed (1169 files)
npm run repo:policy                                          -> passed (1168 files, mode=tracked)
npm run sprint:batch:test                                    -> 44 passed
npm run audit                                                -> 0 npm vulnerabilities, no vulnerable NuGet packages
npm run sprint:validate                                      -> 57 sprints, 57 completed, active=none
```

## Evidence classes and non-claims

Automated, fixture, manual, real-external-software and unvalidated labels from
[VALIDATION_POST_1.0.md](../operations/VALIDATION_POST_1.0.md) still apply. The Siemens/PLCSIM and
CODESYS/SoftPLC runs remain fixture substitutes; no real vendor run, certificate trust decision,
industrial datum or benchmark on reference hardware is claimed. Connectors and writes remain disabled
by default. Visual regression baselines are Windows-only and are skipped on other platforms.

## Upgrade notes

- Unhandled exceptions now return `{"code":"internal_error","message":"...","status":500}` with the
  `X-Correlation-Id` response header instead of the framework default.
- OTLP export is opt-in; existing installs keep `Exporter=None` and require no collector.
- The HMI muted-text token changed from `#6b7b8d` to `#5f6d7c` for WCAG AA contrast.
- No public REST or SignalR contract changed; generated TypeScript contracts are unchanged.
