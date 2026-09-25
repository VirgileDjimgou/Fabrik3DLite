# S46 - CODESYS / SoftPLC interoperability showcase

## Outcome

A reproducible showcase demonstrates a real external controller (CODESYS/SoftPLC) driving the Fabrik3D CNC reference cell through standards-supported connectivity (OPC UA and/or Modbus TCP, depending on configuration). It includes a sample I/O map, example PLC logic where licensing permits, setup documentation, expected state sequence, screenshots/evidence, and an automated substitute fixture for CI. The showcase proves the closed loop: external controller → Fabrik3D actuator → virtual sensor → external controller input.

## Motivation

S33-S36 built transports and authority. A concrete, reproducible showcase validates the whole chain and becomes the reference material for educators and prospects. CI must never depend on proprietary desktop software.

## Current-state assumptions to verify

- S33 (OPC UA), S34 (MQTT), S35 (Modbus TCP), S36 (control authority), S37 (mapping studio) are merged and disabled by default.
- The reference cell exposes the S32 signal catalog with stable ids and S39 fidelity.
- Connector fixtures from S33-S35 provide deterministic external counterparts for CI.
- Licensing constraints may prevent committing CODESYS project files verbatim; verify and document.

## Scope

- Build a documented showcase package under `docs/showcases/codesys-softplc/` (or equivalent) containing:
  - the sample I/O map between Fabrik3D signals and PLC addresses;
  - PLC program source (structured text or equivalent) with clear license/attribution notes; if redistribution is not permitted, provide a schematic program description and a self-authored equivalent;
  - step-by-step setup for CODESYS or a SoftPLC environment, including protocol selection, security settings, and write enablement;
  - expected state sequence (permissives, start, pallet detection, robot cycle, CNC cycle, completion, stop/fault);
  - screenshots/evidence of a real run;
  - troubleshooting notes.
- Provide an automated substitute fixture for CI that exercises the same mapping and sequence through the same adapter (no proprietary dependency).
- Implement a repeatable automated test: fixture controller drives the virtual cell through the showcase sequence, asserting actuator commands and sensor feedback at each step.
- Document security posture: writes explicitly enabled only for the showcase, allow-listed, never in the public demo.
- Ensure the showcase does not claim CODESYS certification or vendor partnership; state supported configuration and limitations.

## Non-goals

- No OEM emulation or reverse engineering.
- No CI dependency on proprietary software.
- No production-ready PLC program; it is an educational reference.
- No new protocols beyond S33-S35.

## Architecture boundaries

- The showcase exercises existing adapters; it must not add protocol special cases to Domain.
- Mapping and PLC sources are data/documentation artifacts validated by tests.
- The authority model (S36) governs ownership during the showcase; the PLC acquires external authority explicitly.

## Domain and data model changes

- None expected; if the showcase reveals a missing mapping capability, implement it in the appropriate S37 mapping schema with validation and tests rather than ad hoc code.

## Backend changes

- Only if a defect/gap is found: fix within existing adapters with tests. No showcase-specific server code.

## Simulator changes

- Only if a mapping/authority gap is found; otherwise none.

## HMI and UX changes

- The showcase run should be observable through existing authority/connector status and signal monitor surfaces; no new operator UI.

## 3D and visual requirements

- Reference-cell visuals already cover the sequence; capture showcase screenshots/evidence at representative states.

## Protocol and security requirements

- Explicit write enablement scoped to the showcase mapping; allow-list required.
- Document that the same configuration is not suitable for uncontrolled production use.
- Secure endpoints where the protocol supports it; document development-only exceptions clearly.
- No secrets committed; credentials from environment.

## Backward compatibility

- No behavior change when the showcase is disabled; all connectors remain off by default.
- Existing tests and fixtures unaffected.

## Migration requirements

- Not applicable beyond the S37 mapping schema; any mapping file carries its version.

## Failure and degraded-mode behavior

- Showcase stop/abort behaves per the authority rules: outputs quiesce, authority releases explicitly, no implicit takeover.
- Loss of the PLC during the showcase demonstrates the S36 degraded mode.
- CI fixture failures fail the test rather than skipping silently.

## Testing strategy

- Automated fixture showcase test proving the closed loop through the chosen adapter with deterministic assertions.
- Mapping validation test for the sample I/O map.
- Authority test: PLC acquires/releases authority; local simulation cannot drive concurrently.
- If both OPC UA and Modbus variants exist, test both fixtures.
- Manual validation checklist for the real CODESYS run, with required evidence artifacts listed.

## Performance requirements

- Closed-loop cycle for the showcase sequence within documented latency bounds; record measured round-trip time.

## Security considerations

- Writes enabled only in the showcase configuration and allow-listed; documented prominently.
- No credentials or certificates committed.
- The public demo stays read-only/disabled for connectors.

## Documentation changes

- New showcase documentation package (I/O map, PLC logic/description, setup, expected sequence, evidence, troubleshooting, limitations).
- Update `README.md`, connector docs, and `CONTROL_AUTHORITY.md` with the showcase reference.
- Update the procurement/requirements chapter if necessary? Not in this sprint.

## Acceptance criteria

1. A documented sample I/O map and PLC program (or licensed-safe equivalent) exist for the showcase.
2. Setup documentation enables a user to reproduce the run with CODESYS or a SoftPLC for at least one protocol.
3. The automated CI fixture proves the closed loop: controller output → Fabrik3D actuator → virtual sensor → controller input, with deterministic assertions.
4. Authority acquisition/release and loss-of-controller behavior are demonstrated and consistent with S36.
5. Real-run evidence (screenshots/logs) is captured and stored.
6. No proprietary dependency is required for CI; manual-only steps are explicitly marked.
7. All builds/tests/contracts gates pass.

## Evidence expected for completion

```text
fixture showcase test output (assertions per sequence step)
manual validation checklist with screenshots/log reference
mapping validation test output
authority acquire/release evidence
recorded round-trip latency
dotnet build/test (pass)
npm run contracts:check (pass)
```

## Rollback and failure containment

The showcase is documentation plus fixture tests and is isolated from production paths; removal restores S45 behavior. If licensing prevents even publishing a description, document the constraint and rely on the substitute fixture plus a written sequence, marking real-hardware validation as manual.

## Follow-up items that must not leak into this sprint

- Siemens/PLCSIM profile (S47), packaging (S48), hardening (S49), 1.0 baseline (S50).
