# Release-candidate checklist

Status: **defined (S49); S50 signs off the 1.0 baseline.** This checklist is the gate between a
release candidate and a 1.0 sign-off. Every row is either executed with recorded evidence or marked
**not run / not applicable** explicitly — never silently skipped. It is consistent with
[`docs/roadmap/QUALITY_GATES.md`](../roadmap/QUALITY_GATES.md) and the sprint autopilot contract
([`AUTOPILOT.md`](../roadmap/AUTOPILOT.md)).

The checkbox state below reflects the **S49 validation run** on the reference environment
(13th Gen Intel Core i7-13620H, 63.7 GB RAM, Windows, Node.js 24.18.0, .NET SDK 10.0.401 building
`net8.0`). Rerun every row on the release host before signing off.

## 1. Build and static gates

| # | Gate | Command | Evidence | S49 |
| --- | --- | --- | --- | --- |
| B1 | Backend builds with zero warnings/errors | `dotnet build Fabrik3D/Fabrik3D.slnx` | build log | ✅ |
| B2 | Simulator type-check | `npm --prefix Fabrik3D/fabrik3d.client run type-check` | console output | ✅ |
| B3 | HMI type-check | `npm --prefix Fabrik3D/fabrik3d.hmi run type-check` | console output | ✅ |
| B4 | Simulator production build | `npm --prefix Fabrik3D/fabrik3d.client run build` | `dist/` | ✅ |
| B5 | HMI production build | `npm --prefix Fabrik3D/fabrik3d.hmi run build` | `dist/` | ✅ |
| B6 | Generated contracts match the live server | `npm run contracts:check` (server on `127.0.0.1:7249`) | `[contracts] verified …` | ✅ |

## 2. Automated tests

| # | Gate | Command | Evidence | S49 |
| --- | --- | --- | --- | --- |
| T1 | Backend unit/integration/contracts | `dotnet test Fabrik3D/Fabrik3D.slnx --no-build` | 456 passed (Contracts 5, Infrastructure 16, Server 435) | ✅ |
| T2 | Simulator unit/component/geometry | `npm --prefix Fabrik3D/fabrik3d.client run test` | 105 files, 517 passed | ✅ |
| T3 | HMI unit/component/i18n | `npm --prefix Fabrik3D/fabrik3d.hmi run test` | 18 files, 65 passed | ✅ |
| T4 | Simulator visual regression | `npm --prefix Fabrik3D/fabrik3d.client run test:visual` | 26 passed | ✅ |
| T5 | HMI e2e (API + rendered) | `npm --prefix Fabrik3D/fabrik3d.hmi run test:e2e` (server + `VITE_ORCHESTRATOR_URL`) | 13 passed | ✅ |
| T6 | Connector fixtures (OPC UA / MQTT / Modbus) | connector-filtered `dotnet test` (fixtures started by the tests) | passed within T1 | ✅ |

## 3. Security

| # | Gate | Command | Evidence | S49 |
| --- | --- | --- | --- | --- |
| S1 | npm + NuGet dependency audit | `npm run audit` | 0 npm vulnerabilities, no vulnerable NuGet packages | ✅ |
| S2 | Secret scan | `npm run security:scan` | passed (978 files) | ✅ |
| S3 | Protocol write policies fail closed | `SecurityHardeningTests`, connector fixtures, showcase tests | passed | ✅ |
| S4 | Secure response headers / CORS | `SecurityHeadersTests`, deployment validator | passed | ✅ |
| S5 | Upload / path-traversal bounds | `CellFileContentValidator`, `AssetPackageImporter`, historian validation tests | passed | ✅ |
| S6 | Rate limiting on sensitive endpoints | `ObservabilityHttpTests` (auth + simulator-metrics) | passed | ✅ |

Details, control inventory and residual risk: [SECURITY_HARDENING.md](./SECURITY_HARDENING.md).

## 4. Observability

| # | Gate | Command | Evidence | S49 |
| --- | --- | --- | --- | --- |
| O1 | Traces/metrics/logs emitted with correlation and disabled-by-default export | `dotnet test … --filter "FullyQualifiedName~Observability"` + `GET /api/diagnostics/*` | 22 focused tests passed | ✅ |
| O2 | Instrumentation does not change domain semantics | full suite T1/T2 with instrumentation enabled | passed | ✅ |
| O3 | Bounded cardinality / exporter unavailable does not break requests | `ObservabilityMetricsTests`, degraded-mode tests | passed | ✅ |

Details: [OBSERVABILITY.md](./OBSERVABILITY.md).

## 5. Performance

| # | Gate | Command | Evidence | S49 |
| --- | --- | --- | --- | --- |
| P1 | Instrumentation overhead recorded | `ObservabilityPerformanceTests`, `frameMetrics.performance.test.ts` | recorded rates | ✅ |
| P2 | Concurrent SignalR load recorded | `npm --prefix Fabrik3D/fabrik3d.client run load:signalr` | 25 clients / 5,000 messages, 0 loss | ✅ |
| P3 | WebGL frame time recorded | `e2e/perf.spec.ts` (Chromium + WebKit) | recorded | ✅ |
| P4 | Historic budgets re-stated with source | S33–S48 measurements cited in [PERFORMANCE.md](./PERFORMANCE.md) | documented | ✅ |

## 6. Accessibility and browser support

| # | Gate | Command | Evidence | S49 |
| --- | --- | --- | --- | --- |
| A1 | WCAG 2.2 AA automated checks | `npm --prefix Fabrik3D/fabrik3d.hmi run test:e2e` and `run test:a11y` | 15/15 across 5 engines | ✅ |
| A2 | Findings and fixes recorded with method | [ACCESSIBILITY.md](./ACCESSIBILITY.md) | A1–A7 resolved | ✅ |
| A3 | Browser matrix with versions | [BROWSER_SUPPORT.md](./BROWSER_SUPPORT.md) | 5 engines | ✅ |
| A4 | Manual keyboard/contrast review | procedure in [ACCESSIBILITY.md](./ACCESSIBILITY.md) | recorded | ✅ |
| A5 | Screen-reader validation | NVDA/JAWS/VoiceOver | **not run — documented gap** | ⚠️ |

## 7. Packaging and lifecycle

| # | Gate | Command | Evidence | S49 |
| --- | --- | --- | --- | --- |
| D1 | Compose file renders | `docker compose -f Fabrik3D/compose.production.yaml config --quiet` | exit 0 | ✅ |
| D2 | Compose invariants (healthchecks, ordering, secrets) | `node scripts/lifecycle/verify-config.mjs` | passed | ✅ |
| D3 | Full stack starts healthy (on a host that supports it) | `docker compose … up --build -d` | S48 evidence in [VALIDATION.md](./VALIDATION.md) | ✅ (S48) |
| D4 | Backup/restore tooling | `node scripts/lifecycle/backup.mjs` / `restore.mjs` | [BACKUP_RESTORE.md](./BACKUP_RESTORE.md) | ✅ |

## 8. Documentation and honesty

| # | Gate | Evidence | S49 |
| --- | --- | --- | --- |
| Doc1 | Implemented / experimental / simulated / planned / live claims accurate | README + architecture/operations docs | ✅ |
| Doc2 | No certification, OEM, or penetration-test claim | [SECURITY_HARDENING.md](./SECURITY_HARDENING.md), scope section | ✅ |
| Doc3 | Known limitations and residual risk stated | each operations document + [PERFORMANCE.md](./PERFORMANCE.md) | ✅ |
| Doc4 | Evidence commands/results are real, not fabricated | operations documents + this checklist | ✅ |

## 9. Sign-off criteria for S50 (1.0)

The 1.0 baseline may be declared **only** when all of the following hold on the release host:

1. Every mandatory row in sections 1–8 is executed and green, or explicitly recorded as
   **not run / not applicable** with a justification and an owner.
2. The runtime state (`docs/roadmap/state.json`) shows S01–S49 completed with recorded evidence;
   S50 records the holistic validation and documentation completion.
3. Connectors remain disabled and read-only by default; production-like profiles refuse an insecure
   identity configuration; no secret is committed.
4. Any unresolved dependency vulnerability or security residual risk has a written risk statement and
   a remediation plan in [SECURITY_HARDENING.md](./SECURITY_HARDENING.md).
5. No make-believe: no simulated data is presented as real machine data; fixture-based connector
   evidence is labelled as fixture-based; performance numbers cite the reference hardware/browser.
6. Known limitations (screen-reader validation, GPU/soak numbers, real hardware/PLC runs, mobile
   devices) remain explicitly documented and are not implied to be covered.

## Known limitations carried into S50

- No penetration test, threat-model review, or standards certification.
- No assistive-technology (screen-reader) validation.
- No long-duration (>1 h) soak test and no GPU-accelerated WebGL numbers.
- Real CODESYS/PLCSIM/vendor runs are manual checklists, not automated gates.
- Browser matrix is Chromium/Chrome/Edge/Firefox/WebKit on Windows; real macOS Safari and mobile
  devices are out of scope for this environment.
