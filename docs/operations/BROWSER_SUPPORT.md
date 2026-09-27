# Browser support

Status: **matrix validated (S49)**. This document records the browsers and versions on which the
operator HMI and the engineering/simulator surfaces were actually exercised, the checks that ran and
their results. It is a support statement for this repository's documented purpose (training centres
and demonstrations), **not** a compatibility guarantee or a certification.

## Reference environment

| Item | Value |
| --- | --- |
| CPU | 13th Gen Intel Core i7-13620H (10 cores / 16 logical) |
| RAM | 63.7 GB |
| OS | Windows (win32) |
| Node.js | 24.18.0 |
| Playwright | 1.63.0 |

## Matrix

The rendered operator HMI was exercised with the S49 accessibility suite
(`Fabrik3D/fabrik3d.hmi/e2e/hmi-accessibility.spec.ts`: labelled landmarks, `role="status"` on the
connection badge, keyboard reachability with a visible focus indicator, and the WCAG 2.2 AA 24×24 px
target-size minimum). Each browser ran the same 3 checks.

| Engine | Version | Build | HMI accessibility | Rendered WebGL frame time |
| --- | --- | --- | --- | --- |
| Chromium (bundled, `chromium-1243`) | 153.0.8010.12 | Playwright bundled | 3/3 passed | yes (see [PERFORMANCE.md](./PERFORMANCE.md)) |
| Google Chrome (`channel: chrome`) | 153.0.8010.54 | installed | 3/3 passed | not measured |
| Microsoft Edge (`channel: msedge`) | 154.0.4258.37 | installed | 3/3 passed | not measured |
| Mozilla Firefox (`firefox-1543`) | 155.0 | Playwright bundled | 3/3 passed | render/measurement passed (frame line not forwarded) |
| WebKit (`webkit-2359`, Safari engine) | 26.6 | Playwright bundled | 3/3 passed | yes (see [PERFORMANCE.md](./PERFORMANCE.md)) |

**Result: 15/15 accessibility checks passed across all five engines.**

The engineering/simulator surfaces (Three.js canvas, engineering panels) were loaded and measured in
Chromium and WebKit; the reference scene rendered and the frame sampler produced samples on both.

## How to reproduce

Start a Testing-mode orchestrator and a served HMI build, then run the engine matrix:

```powershell
# 1. Orchestrator (non-blocking, Testing identity mode, disposable database)
$env:ASPNETCORE_ENVIRONMENT = 'Testing'
$env:ASPNETCORE_URLS = 'http://127.0.0.1:7249'
$env:MongoDb__ConnectionString = 'mongodb://localhost:27017'
dotnet run --project Fabrik3D/Fabrik3D.Server/Fabrik3D.ServerTaskManager.csproj --no-launch-profile

# 2. HMI build + the engine matrix (preview proxies the API, so point it at the orchestrator)
$env:VITE_ORCHESTRATOR_URL = 'http://127.0.0.1:7249'
npm --prefix Fabrik3D/fabrik3d.hmi run build
npm --prefix Fabrik3D/fabrik3d.hmi run test:a11y
```

`test:a11y` uses `playwright.accessibility.config.ts`, which partitions the accessibility spec by
engine (Chromium, Chrome, Edge, Firefox, WebKit) so `--browser` is not needed. The same spec also
runs as part of the normal `npm --prefix Fabrik3D/fabrik3d.hmi run test:e2e` suite (Chromium only).

Install missing engine binaries once with:

```powershell
npm --prefix Fabrik3D/fabrik3d.hmi exec -- playwright install firefox webkit
```

## Known limitations

- Real **Safari on macOS/iOS** was not exercised; WebKit 26.6 is the Playwright Safari engine used as
  the closest available proxy. iOS/iPadOS touch behaviour is therefore not validated here.
- **Mobile/tablet hardware** browsers were not exercised. Layout is validated at phone, tablet-touch,
  laptop and panel viewports through the Playwright viewport/visual suites, not on physical devices.
- The Chrome/Edge rows use the locally installed channel binaries; they verify the Chromium engine and
  the branded channels but not every release channel (Beta/Dev/Canary).
- Assistive-technology validation (NVDA/JAWS/VoiceOver) was **not** performed; see
  [ACCESSIBILITY.md](./ACCESSIBILITY.md).
- GPU-accelerated WebGL numbers are not recorded; the frame-time measurements are headless/software
  rendering and are an upper bound, not a production figure.
- Browser versions are point-in-time; rerun the matrix on each release candidate.
