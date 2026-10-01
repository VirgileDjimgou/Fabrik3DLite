# S58 - Real PLC interoperability proof and post-1.0 validation

## Outcome

Prove one coherent flagship Fabrik3D workflow end-to-end with a real external PLC environment where available, then publish separate post-1.0 validation evidence without altering the S50/1.0 record.

## Motivation

S46/S47 provide strong fixture/profile evidence but explicitly do not prove licensed Siemens TIA Portal/PLCSIM Advanced operation. After S51–S57, the highest-value work is integration proof and honest validation rather than additional breadth.

## Current-state assumptions to verify

- Confirm availability/licensing of Siemens S7-1500/TIA Portal/PLCSIM Advanced, certificate trust and host networking before claiming real proof.
- Inspect S47 profile/checklists, control-authority design, connector diagnostics and S51–S57 evidence.
- Verify the existing demo/recording automation and historical `VALIDATION_1.0.md` remain immutable.

## Scope

- Preferred real target: Siemens S7-1500 / PLCSIM Advanced over OPC UA. CODESYS/SoftPLC may add evidence but cannot silently replace the stated Siemens claim.
- Prove: HMI composes Job → assigns target → starts → server dispatches → simulator ACK/runs → external authority acquired → PLC signals drive CNC/robot/conveyor → HMI reflects state → simulated fault/alarm/recovery → Job completes → historian/time travel/training evidence.
- Re-run the highest-value S51–S57 flows and refresh concise showcase/recording automation with no hidden simulator Start.
- Create `docs/operations/VALIDATION_POST_1.0.md` (or equivalent) separating automated, fixture, manual, real external-software and unvalidated claims.

## Non-goals

- No feature explosion, OEM emulation, safety/certification claim or substitution of an in-process fixture for real PLCSIM proof.
- No automatic license acceptance, certificate trust, production credentials or physical hardware interaction.
- Do not overwrite S50 release notes, completion evidence or `VALIDATION_1.0.md`.

## Architecture boundaries

- The server remains authoritative for assignment, Job lifecycle, tenancy, authorization, historian, training and control authority.
- The simulator executes assigned work; HMI supplies operator intent.
- OPC UA/MQTT/Modbus remain external adapters, not internal buses.
- Replay/time travel is read-only and cannot write to the PLC.

## Integration and implementation changes

- Complete all repository-only setup, deterministic fixtures, diagnostics, checklists and automation before requesting external action.
- Use the existing versioned Siemens mapping/profile and explicit authority handshake; update only through compatible versioning.
- Capture correlation across HMI command, Job/session, dispatch, simulator, authority, connector signals, alarm/recovery and historian.
- Make the demo repeatable with clear prerequisites, reset steps and redacted evidence capture.

## HUMAN_REQUIRED gate

- Real TIA/PLCSIM access, license acceptance, certificate trust, external credentials or physical hardware must create the existing `HUMAN_REQUIRED` gate with exact action/evidence required.
- Continue automatically through all work possible without the dependency, then stop cleanly at the gate.
- Do not mark the sprint complete or claim real validation while the gate is unresolved.

## Backward compatibility

- Existing cell, mapping, scenario, Job/session, historian and connector settings remain readable.
- Any mapping/profile change is versioned and migration-tested; fixture proof remains clearly labeled.

## Failure and degraded modes

- PLC/certificate/network loss degrades connector/authority visibly, stops unsafe command flow and retains diagnostic/audit evidence.
- Fault injection remains simulated and cannot propagate arbitrary industrial writes.
- Demo steps detect stale state, missing ACK and hidden/manual Start dependencies rather than glossing over them.

## Testing and validation strategy

- Re-run authoritative remote Start, completion policy/composer, Robot/jog/persona, asset runtime/LOD, hero-cell visuals, performance/soak/recovery, security/tenant/deployment and connector fixture suites.
- Execute the real PLC checklist only in the supported licensed environment and capture versions/topology/certificates without secrets.
- Validate historian/time-travel fidelity and read-only replay after the complete workflow.
- Run all applicable release-level gates in `QUALITY_GATES.md`, including contracts, frontend/server, E2E/a11y/visual, audit/security/docs and compose/protocol checks.

## Performance requirements

- Record end-to-end command/dispatch/PLC-state/HMI visibility latency in the real environment where possible, with environment and sample method.
- Ensure the showcase stays within S56 budgets; deviations require explanation/fix, not hidden edits.

## Security considerations

- Writes remain disabled by default and explicitly allow-listed under acquired authority.
- Redact credentials, tokens, private certificates, tenant data and machine identifiers from committed evidence.
- State precisely whether evidence is automated, fixture, manual or real external software.

## Documentation changes

- Add post-1.0 validation, updated showcase/runbook, evidence index, limitations/unvalidated claims and troubleshooting.
- Link—do not rewrite—the S50 1.0 baseline/release evidence.

## Acceptance criteria

1. The flagship workflow runs from HMI Job creation/Start through automatic simulator execution, external control, fault/recovery, completion and historian/time travel with no hidden local Start.
2. Siemens/PLCSIM proof is labeled real only when executed against the real licensed environment; otherwise an unresolved HUMAN_REQUIRED gate stops completion.
3. Highest-value S51–S57 regression flows and release-level gates pass.
4. The refreshed demo is concise, repeatable and honest about simulated versus real components.
5. Post-1.0 validation separates automated, fixture, manual, real and unvalidated evidence without modifying S50 history.

## Evidence expected for completion

Record exact environment/topology/version, end-to-end correlations and timings, connector/authority/alarm/recovery traces, historian/replay proof, demo capture references and every applicable gate. Never fabricate real PLC, GPU, certificate or manual evidence.

## Rollback and failure containment

Real-integration configuration stays optional and disabled by default. Loss of PLC/authority fails closed; fixture workflows remain available and labeled. Historical 1.0 validation is never changed.

## Follow-up items

- There is no S59 in Roadmap Revision 2. Future work requires a separately approved revision that preserves S01–S58 history.
