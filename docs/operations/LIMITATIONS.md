# Limitations and non-claims

Status: updated for the **completed and validated Revision 5** (S72-S76). The documentation set keeps
five release eras explicitly distinguished and never rewrites their history: the immutable **1.0
baseline** (S01-S50), completed **Roadmap Revision 2** (S51-S57), completed **Roadmap Revision 3**
(S58-S64), the **validated Revision 4** (S65-S71) and the **validated Revision 5** (S72-S76). This is
the honest, consolidated list of what Fabrik3D is **not**. Claims elsewhere in the documentation are
consistent with this list.

## Not a safety or certified system

- Fabrik3D is **not** a safety-certified control system, a safety PLC, or a substitute for a real
  safety function. The E-stop, light curtain, area scanner, gate interlock and safety-zone visuals
  are simulated teaching aids. Motion guards and collision checks are engineering/teaching aids.
- No functional-safety certification (IEC 61508/61511/62061, ISO 13849, IEC 62443, IEC 62541,
  OWASP ASVS or any other) is claimed. Security language is "aligned with selected OWASP practices"
  and "inspired by IEC 62443 zone/conduit concepts"; S57 adds an internal threat model and automated
  cross-tenant/security checks, but no independent penetration test or formal certification review has been performed.
- No safety, compliance or competence certification is issued to learners. Training reports describe
  simulated exercises and explicitly do not certify professional competence, safety qualification or
  industrial readiness.

## Not an OEM emulator

- Robot profiles are **vendor-neutral generic** compact/medium/heavy six-axis profiles, not exact
  OEM models. No OEM program format, vendor runtime or controller kernel is emulated.
- CNC behavior is a deterministic educational cycle machine, not a real controller model.
- The CODESYS/SoftPLC and Siemens/PLCSIM profiles are documentation plus automated substitute
  fixtures. A real PLC/PLCSIM run is a manual checklist; no vendor project file, binary, license or
  secret is committed and no vendor partnership is claimed.

## Simulated, not live (by default)

- Connectors (OPC UA, MQTT, Modbus TCP) are **disabled by default**; writes are disabled by default
  and fail closed without enablement **and** an exact allow-list match.
- In the public demo, connectors are disabled and no command is sent to industrial equipment. Every
  robot, CNC, alarm, safety condition and production signal is simulated.
- All educational fault, safety and learning data is simulated. Generated or synthetic data is never
  presented as real machine data.

## Functional limitations

- A Fabrik3D-side Modbus **server/slave** endpoint is deliberately out of scope; Fabrik3D is a
  client only.
- Historian retention and sampling are bounded by documented policies; stored history is sampled,
  not a lossless capture of every internal tick.
- Time travel reconstructs from the local timeline or a historian window; robot joint values may be
  exact, interpolated or held, and the mode is reported rather than hidden. Missing history is
  reported as a gap, never fabricated.
- Certificate pinning of external industrial endpoints is not implemented; trust-store validation
  and an explicit development trust escape are.
- `Strict-Transport-Security` and a Content-Security-Policy are deployment decisions, not asserted by
  default; a TLS-terminating proxy should set HSTS.
- Global accessibility target is WCAG 2.2 AA, but no screen-reader validation has been performed;
  findings and gaps are recorded in [ACCESSIBILITY.md](ACCESSIBILITY.md).
- Performance numbers are recorded on a documented reference workstation/browser; they are not a
  guarantee for other hardware.

## Operator HMI and robot jog (S53)

- `/robot-positions` shows and jogs the **reference cell's simulated** robot. The authoritative
  report is what the simulator executed; the HMI does not derive or fabricate pose values.
- Manual jog is simulated control arbitration only. It is not a safety function, carries no
  certification, and must never be described as one. Motion safety is enforced by the simulator's
  `MotionSafetyEngine` (collision/interlock primitives), not by a certified safety PLC.
- Engineering and training authoring surfaces remain in the separate simulation workspace; the HMI
  only links to them when `VITE_SIMULATOR_URL` is configured.
- The robot-position store is in memory and single-cell scoped; multi-cell/multi-robot routing and
  persistence are follow-up work.
## Security residual risk

- Dependency audits reflect the public vulnerability databases at execution time and must be rerun on
  each release.
- The `Development`/`Test` authentication mode is intentionally permissive and is for local, CI and
  the clearly-labelled public demo only; Production refuses it, but operators must still configure an
  OIDC provider correctly.
- The public demo is a shared environment: jobs, simulated machine state and learning data may be
  changed or reset by other visitors, and availability is best-effort.
- See [SECURITY_MODEL.md](SECURITY_MODEL.md) and [SECURITY_HARDENING.md](SECURITY_HARDENING.md) for
  controls and residual risk.

## Roadmap revision boundary

The five release eras are distinct and historical evidence is never rewritten:

- **1.0 baseline (S01-S50, immutable).** The original 50-sprint roadmap and its validation evidence.
- **Roadmap Revision 2 (S51-S57, complete, tagged `v1.1.0`).** Post-1.0 orchestration, operator HMI,
  shared asset runtime, hero cell, resilience and security/deployment hardening.
- **Roadmap Revision 3 (S58-S64, complete).** Real 3D scenario runtime, scenario cells, visual
  fidelity, deterministic visual QA/GPU evidence, browser OIDC/demo isolation and the flagship demo.
- **Roadmap Revision 4 (S65-S71, complete, validated by S71).** Scenario-specific generated GLB
  assets, real six-axis scenario motion, deeper deterministic process flows, shared PBR
  materials/factory environment, measured cell composition/cameras and the measured release
  validation ([VALIDATION_REVISION_4.md](VALIDATION_REVISION_4.md)). Revision 4 is a visual and
  scenario-fidelity revision: it adds no protocol, product, database or safety capability, and the
  measured Revision 3 → Revision 4 comparison claims no blanket performance improvement.
- **Roadmap Revision 5 (S72-S76, complete, validated by S76).** Deterministic license-safe procedural
  surface maps and equipment grounding, anchor-driven modular assembly with the additive cell-file
  schema 1.0 → 1.1 migration, an industrial lighting/atmosphere with quality-gated post-processing and
  state-driven equipment motion with instanced scene detail
  ([VALIDATION_REVISION_5.md](VALIDATION_REVISION_5.md)). Revision 5 is a visual-credibility and
  assembly revision: it adds no protocol, product, database or safety capability, and the measured
  Revision 4 → Revision 5 comparison is mixed (faster low-quality profiles, slower composer profiles)
  and claims no blanket performance improvement.

S50 remains the immutable Fabrik3D 1.0 baseline; S51-S57 remain completed Revision 2 work, S58-S64
remain completed Revision 3 work and S65-S76 remain completed Revision 4/5 work. Real PLC/PLCSIM proof
is deferred until the required licensed environment or physical controller is available. New features,
scenes, protocols, billing, marketplace and certification work remain out of scope for all five eras.

## Related documents

- [Architecture overview](../architecture/OVERVIEW.md)
- [Documentation index](../DOCUMENTATION_INDEX.md)
- [Security model](SECURITY_MODEL.md)
- [Release notes 1.0](../releases/RELEASE_NOTES_1.0.md)
