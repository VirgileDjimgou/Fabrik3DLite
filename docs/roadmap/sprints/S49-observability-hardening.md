# S49 - Observability, performance, security and release-candidate validation

## Outcome

Full platform hardening: OpenTelemetry-compatible structured logs, traces, metrics, and correlation; connector/reconnect/API/SignalR/simulator metrics; measured performance and load validation; OWASP-aligned security hardening with IEC 62443 concepts applied without certification claims; accessibility work toward WCAG 2.2 AA; browser validation; and a release-candidate checklist.

## Motivation

Fabrik3D must be diagnosable and dependable in training centers and demonstrations. Claims about performance and security must be measured, not asserted.

## Current-state assumptions to verify

- Correlation-id middleware exists; logs are standard ASP.NET Core logs.
- Connectors (S33-S35) expose health/diagnostics; authority (S36) audits transitions; historian (S40) measures queries.
- No OpenTelemetry packages; no metrics endpoints; no load tests.
- CORS is permissive today; S42/S48 tighten it; Swagger is environment-gated.
- HMI/simulator have i18n (EN/FR/DE) and some accessibility work from S15/S17; no full audit.
- CI runs unit/integration/E2E/builds but no load or security scans beyond gitleaks/dependency audit.

## Scope

- Observability:
  - OpenTelemetry-compatible traces spanning API requests, SignalR events, connector operations, historian writes, and simulator bridge calls with correlation propagation;
  - structured logs with consistent fields (correlation id, session, organization, simulator, connector, equipment);
  - metrics: connector health/reconnects, signal update throughput, API latency, SignalR connections/messages, historian writes/latency, simulator frame time/render metrics where reportable, authority transitions;
  - exporter configuration disabled by default with documented local development setup; no external dependency required for on-prem.
- Performance and load validation:
  - concurrent SignalR clients, telemetry rate, historian writes, mapping throughput, signal update throughput, WebGL performance, memory stability, repeated scene reloads, long-running simulation;
  - record reference hardware/browser and measured numbers; document budgets and observed results.
- Security hardening using OWASP secure ASP.NET Core practices and IEC 62443 concepts (zones/conduits concepts applied to connector boundaries) without claiming certification:
  - CORS, authentication, authorization, input validation, path traversal, upload validation, asset package validation, rate limiting, secret handling, dependency vulnerabilities, secure headers, protocol write policies;
  - review every connector and file import path for fail-closed behavior.
- Accessibility validation toward WCAG 2.2 AA for HMI and simulator/engineering surfaces: keyboard, focus, labels, contrast, target sizes, reduced motion where relevant; record findings and fixes.
- Browser validation: current Chrome/Edge/Firefox/Safari where feasible; record versions and results; document known limitations.
- Release-candidate checklist: gates, evidence locations, known limitations, and sign-off criteria for S50.

## Non-goals

- No penetration-test claim; no certification claim.
- No replacement of unit/integration tests with screenshot-only testing.
- No deployment changes beyond what S48 provides.
- No new product features.

## Architecture boundaries

- Observability is cross-cutting but non-invasive: instrumentation must not change domain semantics.
- Security hardening respects the architecture: connectors remain adapters; replay remains read-only; dev auth never becomes production auth.
- Performance measurements are recorded in documentation, not asserted.

## Domain and data model changes

None expected beyond additive correlation/metadata fields if required for tracing.

## Backend changes

- OpenTelemetry packages/configuration, instrumentation, metric definitions, log enrichment, secure headers, rate limiting, validation hardening, dependency updates where vulnerable, audit fixes.

## Simulator changes

- Client performance instrumentation (frame time, draw calls, resource counts), optional telemetry to a local metrics endpoint or console; no external dependency.
- Accessibility fixes in engineering/HMI-shared components.

## HMI and UX changes

- Accessibility fixes (focus, contrast, labels, keyboard, target sizes) across operator views.
- No visual redesign; preserve industrial design system semantics.

## 3D and visual requirements

- Measure and document frame time, draw calls, triangles, texture memory, and steady-state memory during long runs and repeated scene loads.
- No visual regression beyond intentional accessibility fixes.

## Protocol and security requirements

- Pass dependency audits for .NET and npm; record results.
- Run secret scanning; no secrets.
- Verify write policies fail closed for OPC UA, MQTT, Modbus, and authority under misconfiguration.
- Validate upload/import paths against traversal, oversized input, and malicious archives/manifests.
- Rate limiting on sensitive endpoints.

## Backward compatibility

- Instrumentation off by default, no functional change.
- Performance budgets preserved or improved; regressions documented with justification or fixed.
- Existing APIs/contracts unchanged aside from additive metadata.

## Migration requirements

Not applicable beyond additive metadata; no destructive changes.

## Failure and degraded-mode behavior

- Metrics/tracing exporter unavailable: application continues; failures counted.
- Load limits reached: documented behavior (rejection/backpressure) rather than collapse.
- Security control misconfiguration: fail closed where it affects writes/authorization.

## Testing strategy

- Load/performance tests with recorded scripts and results for the listed dimensions.
- Long-running simulation and repeated scene reload leak checks.
- Security tests: dependency audits, secret scan, auth/authorization negative tests, tenant isolation, upload/path traversal, rate limiting, secure headers, CORS.
- Accessibility: automated checks where available plus manual keyboard/focus/contrast validation; record findings.
- Browser validation matrix with evidence.
- Regression: full existing suite must pass.

## Performance requirements

- Define and record reference hardware/browser.
- Record results for: concurrent SignalR clients, telemetry rate (messages/s), historian writes/s, mapping throughput, signal updates/s, WebGL frame time/draw calls, memory after sustained runs, repeated scene load behavior.
- Document budgets and any deviations.

## Security considerations

- No certification claim; use "aligned with OWASP" and "inspired by IEC 62443 concepts".
- Secrets never logged or bundled; secure defaults reviewed end to end.
- Dependency vulnerabilities triaged; unresolved ones documented with risk and plan.

## Documentation changes

- New `docs/operations/OBSERVABILITY.md`, `docs/operations/PERFORMANCE.md`, `docs/operations/SECURITY_HARDENING.md`, `docs/operations/ACCESSIBILITY.md`, `docs/operations/BROWSER_SUPPORT.md`, `docs/operations/RELEASE_CANDIDATE_CHECKLIST.md`.
- Update `README.md`, `TESTING.md`, connector docs, and the security model.

## Acceptance criteria

1. Traces, structured logs, and metrics are emitted with correlation and are configurable/disabled by default.
2. Recorded measurements exist for every listed performance dimension with reference hardware/browser stated.
3. Security checks are executed with results recorded; write policies fail closed under misconfiguration tests; dependency audits run.
4. Accessibility findings and fixes are recorded with method; no unresolved critical blocker.
5. Browser matrix results are recorded with versions.
6. Release-candidate checklist exists and is consistent with QUALITY_GATES.
7. Full existing test/build/contracts gates pass; no fabricated pass claims.

## Evidence expected for completion

```text
dotnet build/test (N passed)
frontend type-check/test/build + visual (pass)
load/performance measurement artifacts
security scan + dependency audit outputs
accessibility findings document
browser matrix results
npm run contracts:check (pass)
```

## Rollback and failure containment

Hardening changes are incremental; instrumentation is disableable. Security fixes that break functionality must be resolved with tests rather than reverted silently. If a mandatory gate fails, do not complete the sprint.

## Follow-up items that must not leak into this sprint

- 1.0 holistic validation and documentation completion (S50).
- New features.
