# S47 - Siemens / PLCSIM interoperability profile

## Outcome

A documented and validated integration path for Siemens training environments exists where legally and technically supported, using documented standard interfaces (OPC UA and/or Modbus TCP, preferring officially supported options). It provides a tag mapping example, handshake, machine-state sequence, failure handling, connection diagnostics, and a setup guide. Where proprietary dependencies prevent CI automation, protocol-level substitutes are automated and hardware/software-specific checks are marked manual with exact evidence requirements. No Siemens certification or partnership is claimed.

## Motivation

Many training centers standardize on Siemens PLCs and PLCSIM. A verified, documented profile increases credibility and usability without reverse engineering or false claims.

## Current-state assumptions to verify

- S46 merged with the CODESYS/SoftPLC showcase and the CI substitute fixture.
- S33/S35 transports (OPC UA, Modbus) support the required tag mapping and write policy.
- S36 authority model governs external control and degraded behavior.
- Legal/licensing constraints on publishing Siemens-specific project files must be verified before committing any such artifact.

## Scope

- Document a supported Siemens/PLCSIM integration profile:
  - supported environment(s) and versions (for example TIA Portal + PLCSIM Advanced exposing OPC UA or a Modbus gateway) with explicit scope limits;
  - tag mapping example between Fabrik3D signals and Siemens tags/DB addresses (data type, scaling, direction);
  - handshake sequence for session/authority acquisition, start, permissive checks, fault/reset;
  - machine-state sequence from idle through load/machining/unload/complete;
  - failure handling: disconnection, timeout, bad quality, PLC stop, watchdog;
  - connection diagnostics: health, last error, counters, node/address validation;
  - setup guide with security settings (certificates/trust or Modbus network assumptions), write enablement, and troubleshooting;
  - explicit non-claims: not Siemens-certified, not an official partnership, not safety-rated.
- Provide an automated protocol-level substitute fixture (reusing S46 where possible) covering the same mapping/handshake/sequence in CI.
- Mark all environment-specific steps manual with required evidence (version strings, screenshots/log excerpts, mapping file, observed sequence).
- If legally/technically impossible for a given interface, document why and provide the closest officially supported alternative.
- Ensure no proprietary binaries, licenses, or secrets are committed.

## Non-goals

- No reverse engineering, emulation of proprietary protocols, or license circumvention.
- No CI dependency on TIA Portal/PLCSIM.
- No claim of certification, partnership, or production safety.
- No new protocols beyond S33-S35.

## Architecture boundaries

- Uses existing adapters and mapping schema; Siemens-specific details stay in documentation/mapping files.
- Authority and failure semantics follow S36; no special-case takeover.
- Substitutes exercise the same mapping and state machine, not a fork of the production path.

## Domain and data model changes

None expected. Any mapping gap is fixed in the S37 schema with versioning.

## Backend changes

Only defect fixes within existing adapters, with tests.

## Simulator changes

None beyond potential mapping/test support.

## HMI and UX changes

None; diagnostics surfaces already exist from S36/S37.

## 3D and visual requirements

Reference-cell visuals already cover the sequence; capture evidence at representative states for the manual validation record.

## Protocol and security requirements

- Prefer OPC UA with secure endpoint and trust configuration; document certificate handling for PLCSIM.
- Modbus TCP path documented with network assumptions and no security overclaims.
- Writes disabled by default and allow-listed for the profile; never enabled in the public demo.
- No secrets/licenses committed.

## Backward compatibility

- Profile is additive documentation plus mapping files and tests; no behavior change when unused.
- Existing connector tests unaffected.

## Migration requirements

- Mapping files carry schema version; no persisted data changes.

## Failure and degraded-mode behavior

- PLC stop/disconnect triggers the S36 documented degraded behavior with explicit alarms/audit and no implicit takeover.
- Watchdog/timeout values documented; bad quality propagates as bad, not good.
- Manual validation must record the observed failure handling, not just the happy path.

## Testing strategy

- Automated protocol substitute test covering mapping, handshake, sequence, and failure handling in CI.
- Mapping validation tests for the Siemens example.
- Manual validation checklist with exact commands/steps and required evidence artifacts (version info, screenshots, logs, mapping file, state sequence transcript).
- Negative tests: wrong tag/address, PLC stop mid-cycle, certificate mismatch (for OPC UA).

## Performance requirements

- Sequence timing consistent with the documented bounds; record round-trip and cycle measurements from the manual run where available.

## Security considerations

- Certificate trust configured explicitly; no blanket trust in production guidance.
- Write allow-list mandatory; least privilege documented.
- No license violations; no binary redistribution without rights.

## Documentation changes

- New `docs/showcases/siemens-plcsim/` package (supported environment, mapping, handshake, sequence, diagnostics, setup, evidence requirements, limitations, non-claim statement).
- Update `README.md` and connector docs; cross-reference S46.

## Acceptance criteria

1. The Siemens/PLCSIM profile is documented with supported environments, tag mapping, handshake, state sequence, diagnostics, failure handling, and setup steps.
2. An automated protocol-level substitute covers the same mapping/handshake/sequence in CI.
3. Environment-specific checks are marked manual with exact evidence requirements and a completed evidence record (or an explicit, documented blocker).
4. Failure handling (disconnect, PLC stop, bad quality) is validated and documented.
5. No proprietary binaries/licenses/secrets are committed; legal constraints are documented.
6. Non-claim language is present; no certification/partnership claim.
7. All builds/tests/contracts gates pass.

## Evidence expected for completion

```text
automated substitute fixture test output
manual validation record (environment, versions, screenshots/logs/mapping) or documented blocker
negative test results
dotnet build/test (pass)
npm run contracts:check (pass)
```

## Rollback and failure containment

Documentation and mapping are additive; removal restores S46 state. If legal constraints block a specific environment, document precisely and ship the supported alternative; never commit proprietary artifacts.

## Follow-up items that must not leak into this sprint

- On-prem packaging/lifecycle (S48), hardening/RC (S49), 1.0 baseline (S50).
