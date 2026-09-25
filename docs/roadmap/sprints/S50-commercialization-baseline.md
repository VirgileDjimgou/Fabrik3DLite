# S50 - Fabrik3D 1.0 commercialization baseline

## Outcome

Fabrik3D reaches the planned 1.0 training/virtual-commissioning baseline. This is not a safety certification. The sprint performs holistic product validation across architecture, migrations, contracts, API, HMI, simulator, signals, OPC UA, MQTT, Modbus, external controller, CNC reference cell, fault injection, historian, replay/time travel, authentication, RBAC, tenancy, instructor workflows, Docker/on-prem, documentation, demo, performance, security, accessibility, and backup/restore; polishes landing/first-run/loading/empty/error/offline states and connector diagnostics; and completes the documented guides and release notes. No required gate may fail.

## Motivation

S31-S49 build depth. S50 proves the whole product coheres and is presentable, supportable, and reproducible as a 1.0 baseline.

## Current-state assumptions to verify

- S31-S49 merged with all required gates passing and evidence recorded.
- The public demo deployment exists and must remain functional.
- All guides are partially present; verify actual content before claiming completion.
- Known limitations are tracked in docs; verify and update.

## Scope

- Holistic validation (execute and record, not only inspect):
  - architecture consistency and boundaries (server/simulator/HMI/connectors, no protocol leakage into domain, replay read-only);
  - migrations: fresh install, upgrade from a representative previous dataset, idempotence, rollback;
  - generated contracts: `npm run contracts:check`, no drift, additive changes only;
  - API, HMI, simulator end-to-end reference workflow;
  - signal system behavior and catalog integrity;
  - OPC UA, MQTT, Modbus fixture flows (with Docker fixtures);
  - external-controller reference flow (closed loop) with authority handover and degraded behavior;
  - CNC reference cell quality, state consistency, and visual regression;
  - fault injection classes, propagation, determinism, and recovery;
  - historian retention/queries and time-travel reconstruction with command isolation;
  - authentication, RBAC, tenant isolation negative tests;
  - instructor workflow end to end;
  - Docker/on-prem install, backup/restore, upgrade/rollback;
  - documentation coverage and accuracy; demo deployment health.
- Polish:
  - landing/demo experience, first-run experience, loading states, empty states, error states, offline states, connector diagnostics;
  - documentation accuracy: distinguish implemented/experimental/planned/simulated/live;
  - screenshots and a product walkthrough consistent with the current UI;
  - a sample project (reference cell + scenario + mappings + training session) that a new user can open.
- Documentation deliverables (create or update):
  - architecture overview;
  - deployment guide;
  - administrator guide;
  - instructor guide;
  - learner quick start;
  - external controller guide;
  - signal mapping guide;
  - fault-lab guide;
  - troubleshooting guide;
  - limitations;
  - security model;
  - data/privacy documentation;
  - release notes.
- Update `README.md` to reflect the 1.0 baseline accurately with the demo links and verified claims.
- Run all release gates from `QUALITY_GATES.md` and record results. Do not mark S50 complete while any required gate fails.

## Non-goals

- No new major features, scenes, or protocols.
- No safety certification, OEM emulation, or compliance certification claims.
- No payment/billing/marketplace work.
- No architectural rewrite.

## Architecture boundaries

- Validation may fix defects within existing boundaries; no new boundary is introduced.
- Documentation must match implementation; remove or clearly label any experimental/placeholder claim.
- Demo deployment remains a supported configuration.

## Domain and data model changes

Only fixes required by validation, with migrations and tests. No speculative schema work.

## Backend changes

Defect fixes only, each with tests and contract regeneration if needed.

## Simulator changes

Polish and defect fixes for first-run/loading/empty/error/offline states and diagnostics; no new features.

## HMI and UX changes

Polish for the reference workflows; first-run guidance; loading/empty/error/offline states; EN/FR/DE completeness; accessibility spot checks. Operator HMI remains an operator surface.

## 3D and visual requirements

- Reference-cell visual regression at desktop/laptop/touch plus nominal/running/fault/safety/replay states.
- Final measured performance numbers recorded; no budget regression.
- Demo screenshots refreshed and stored under `docs/`/`media/` with accurate captions.

## Protocol and security requirements

- Re-run dependency audits and secret scans; record results.
- Re-run connector write-policy and address/endpoint validation tests.
- Confirm production defaults: connectors disabled, writes disabled, debug/Swagger off, CORS allow-list, dev auth refused.
- Confirm replay cannot write and authority exclusivity holds.

## Backward compatibility

- 1.0 preserves the S01-S49 public behavior; any intentionally changed behavior is documented in release notes with migration guidance.
- Existing cell files, scenarios, mappings, and stored sessions remain readable.

## Migration requirements

- Document the complete schema/version matrix and verify every compatibility reader against representative data.
- Provide a single documented migration/upgrade path from the last pre-1.0 release.

## Failure and degraded-mode behavior

- Validate all documented degraded modes: connector loss, authority loss, historian failure, provider outage, replay gaps, offline simulator, empty states.
- Every failure must be explicit and actionable; no silent fallback and no fabricated data.

## Testing strategy

- Execute the full gate matrix from `QUALITY_GATES.md`, including backend, frontend, contracts, E2E, visual, connector fixtures, historian, time travel, authentication/tenancy, security scans, and Docker lifecycle.
- Run the reference end-to-end scenario from the S50 acceptance list in one continuous session and archive evidence.
- Fresh-install, upgrade, rollback, backup, and restore each executed with evidence.
- No skips for mandatory gates; document any environment-specific manual validation with evidence.

## Performance requirements

- Re-confirm the S49 measurements on the 1.0 build; record final numbers and budgets.
- No regression versus S49 beyond documented tolerance.

## Security considerations

- Final security model documentation matches implementation.
- Dependency vulnerability triage complete with documented residual risk.
- No secrets or certificates committed.

## Documentation changes

All deliverables listed in Scope plus updated `docs/roadmap/README.md` to mark the 1.0 baseline, `QUALITY_GATES.md` if the RC checklist moved anything, and `README.md` with accurate claims and demo links.

## Acceptance criteria

1. Every required gate in `QUALITY_GATES.md` passes; the exact commands/results are recorded.
2. Fresh install, upgrade from a previous dataset, rollback, backup, and restore are each demonstrated with evidence.
3. The reference workflow runs end to end: scenario → external controller → signals/authority → CNC cell → fault → diagnosis → recovery → historian → time travel → training report → instructor review.
4. OPC UA, MQTT, and Modbus fixture flows pass; the external-controller closed loop passes.
5. Authentication/RBAC and tenant isolation negative tests pass.
6. Documentation set is complete, accurate, and distinguishes implemented/experimental/simulated with limitations and educational-scope statements.
7. Public demo remains functional; screenshots/walkthrough match the current product.
8. No unresolved critical security, accessibility, or performance blocker; residual risks documented.
9. Release notes exist for 1.0 with known limitations.

## Evidence expected for completion

```text
full gate transcript (backend, frontend, contracts, E2E, visual, fixtures)
lifecycle transcript (fresh install, upgrade, rollback, backup, restore)
reference workflow evidence (logs/screenshots/session ids)
connector + external-controller fixture outputs
auth/tenancy negative test outputs
security/dependency scan outputs
final performance measurements
documentation index with links
```

## Rollback and failure containment

If a mandatory gate fails, stop and do not complete S50. Fix within the existing architecture or document a bounded blocker and return to the owning sprint. Never mark 1.0 complete on documentation changes alone or on fabricated evidence.

## Follow-up items that must not leak into this sprint

- Any new feature, scene, protocol, billing, marketplace, or certification work. Record them as candidates beyond the roadmap, not inside S50.
