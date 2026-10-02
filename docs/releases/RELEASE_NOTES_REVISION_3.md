# Fabrik3D — Release notes, Roadmap Revision 3 (S58–S64)

Release date: 2026-10-02. This revision builds on the 1.0 training/virtual-commissioning baseline
and the completed Roadmap Revision 2 (S51–S57, tagged `v1.1.0`). It adds no new protocol or safety
claim; it makes the platform's real 3D scenarios, operator surfaces and evidence production-quality.

## Highlights

- **Real 3D scenario runtime (S58).** Scenarios now bind to scene composition and run animation in
  the 3D cell instead of a text/procedural-only view. The five scenario cells assemble their
  scenario-specific equipment, and runtime metrics are measured and reported.
- **Credible scenario cells and visual fidelity (S59–S61).** Scenario-specific cells, robot and
  hero-cell fidelity, and HMI operator polish (hierarchy, states, accessibility) were completed.
- **Deterministic visual QA and GPU evidence (S62).** One shared reset → seed → scenario → ready →
  freeze → screenshot protocol covers the simulator and HMI. A manual GPU benchmark records honest
  hardware/software acceleration classification and versioned measurements.
- **Browser OIDC and demo isolation (S63).** The HMI and simulator authenticate with standard OIDC
  Authorization Code + PKCE, and the public demo exposes a bounded, tenant-scoped `Reset Demo` that
  never touches production data.
- **Flagship demo, documentation and release polish (S64).** One deterministic flagship
  demonstration, a product-oriented README, a curated media set and the Revision 3 validation
  record.

## Flagship demonstration

The documented workflow is exercised end to end, with the server as the orchestration authority and
**no simulator-local Start**:

```text
HMI → New Job → scenario/cell/pallet → Create → Start → server targeted dispatch →
simulator ACK → 3D execution starts automatically → robot/CNC/conveyor → live HMI →
fault/recovery → Job 100 % → Completed → historian/time travel
```

- Runbook: [FLAGSHIP_DEMO.md](../operations/FLAGSHIP_DEMO.md)
- Automated proof: `FlagshipWorkflowIntegrationTests`, `FlagshipDemoHistorianTests`,
  `flagship-demo.spec.ts`, `simulatorOrchestrationBridge.test.ts`, client `time-travel*` specs.
- Curated captures: [`artifacts/demo/flagship/`](../../artifacts/demo/flagship/README.md).

## Validation

The full automated, visual, hardware-benchmark, fixture and manual gate results are recorded in
[VALIDATION_REVISION_3.md](../operations/VALIDATION_REVISION_3.md). Real PLC/PLCSIM interoperability
remains **explicitly deferred** until suitable licensed software or physical hardware is available;
no real-PLC claim is made.

## Compatibility

- No REST or SignalR contract is changed by S64: it is documentation, media and test work.
- Existing documentation, runbooks and samples remain valid or are updated in place.
- All simulated/safety/boundary statements remain accurate: connectors stay disabled by default,
  replay stays read-only, and fault injection remains simulated.

## Known boundaries

- The demonstration is simulated throughout; it is not a certified safety function.
- The external-controller step of the automated proof uses the committed in-process Modbus fixture,
  not vendor software.
- Visual captures use software rendering unless a hardware GPU benchmark was explicitly recorded.
