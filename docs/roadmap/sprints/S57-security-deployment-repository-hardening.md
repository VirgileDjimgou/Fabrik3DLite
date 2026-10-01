# S57 - Security, deployment and repository lifecycle hardening

## Outcome

Harden publicly reachable/on-premise surfaces and establish sustainable binary/repository lifecycle policy, backed by a concise threat model, deeper cross-tenant negatives and supply-chain evidence.

## Motivation

Fabrik3D now spans browsers, OIDC, MongoDB, SignalR, industrial protocols, imports, historian/support artifacts and reverse-proxy deployment. Its growing GLB/media footprint also needs enforceable repository hygiene without destructive history rewriting.

## Current-state assumptions to verify

- Review S42–S50 security, tenancy, headers, secret redaction, deployment and audit evidence before adding controls.
- Inventory trust boundaries, external endpoints, cookies/tokens, reverse-proxy behavior, import/upload paths and support-bundle contents.
- Measure tracked binary classes/sizes and current CI/security tooling.

## Scope

- Create a threat model for HMI, simulator, orchestrator, OIDC, MongoDB, SignalR, OPC UA, MQTT, Modbus, asset/cell/mapping import, historian, tenancy, support bundle and Cloudflare/reverse proxy.
- Record assets, trust boundaries, entry points, threats, existing mitigations and residual risk.
- Deepen cross-tenant negative tests for Jobs, sessions, historian, training, templates, mappings, diagnostics, support bundles and SignalR events.
- Validate/enforce TLS-only external deployment, HSTS at the terminator, CSP, frame, Referrer and Permissions policies where topology permits and tests prove compatibility.
- Validate OIDC/Mongo/tunnel/MQTT credentials and OPC UA certificates never enter repository, logs, captures or support bundles.
- Define and enforce a binary policy for source assets, generated GLB, fixtures, screenshots, demo video, builds and temporary recordings.
- Run dependency, secret and license checks and record residual risks.

## Non-goals

- No IEC 62443/OWASP certification, penetration-test claim or automatic production deployment.
- No destructive Git history rewrite. If desired, document it as a separate HUMAN_REQUIRED migration.
- No header that breaks SignalR/WebSocket or required assets without tested configuration.

## Architecture boundaries

- Authorization/tenancy remain server-side; UI hiding and connector configuration are not security boundaries.
- Protocols remain optional fail-closed adapters; replay cannot issue industrial writes.
- Deployment controls complement, not replace, application authentication/audit.

## Backend and deployment changes

- Close threat-model findings with focused code/config/tests while preserving Production/OnPrem/Demo profiles.
- Scope SignalR groups/events and support/diagnostic queries by tenant and policy.
- Apply response/header policies with environment/proxy awareness and tested WebSocket/OIDC/assets behavior.
- Extend secret redaction and support-bundle allow-listing where evidence finds gaps.

## Repository lifecycle changes

- Document which binary categories belong in Git, LFS, release packaging or external distribution.
- Add deterministic size/type checks that prevent accidental huge/generated/build/temp commits with narrow documented exceptions.
- Do not rewrite history, silently delete source assets or assume Git LFS availability; adoption/migration must be explicit and recoverable.

## Backward compatibility and migration

- Existing deployments receive documented proxy/header migration guidance and safe defaults.
- Existing assets remain addressable; policy changes do not destructively relocate history during this sprint.
- Existing API/SignalR clients continue under compatible CSP/CORS/WebSocket settings.

## Failure and degraded modes

- Missing/invalid production secrets or certificate policy fail startup/connection with redacted actionable errors.
- Mis-scoped tenant requests return non-leaking authorization/not-found behavior.
- Unsupported LFS/release tooling reports a documented gate rather than corrupting assets.

## Testing strategy

- Cross-tenant HTTP/repository/SignalR negative matrix for every listed domain.
- Header/CSP/OIDC/WebSocket/static-asset tests through representative direct and reverse-proxy configurations.
- Secret redaction/support-bundle/log/capture tests and secret scan fixtures.
- Binary-policy size/type tests, license/provenance checks and non-destructive migration tests.
- `npm audit`, NuGet vulnerable-package audit, secret/security scans, license checks where available, compose validation and applicable global gates.

## Performance requirements

- Security middleware/header checks must not materially regress measured API/SignalR budgets; capture representative comparisons.
- Repository checks remain fast enough for local preflight/CI or provide scoped modes.

## Security considerations

- This sprint is evidence-based hardening, not certification. Prioritize authz, tenant isolation, secrets, imports and industrial-write boundaries.
- Record accepted residual risk with owner/rationale; never hide skipped/unavailable scanners.

## Documentation changes

- Add/update threat model, deployment/security hardening, secret/certificate operations, support-bundle policy, binary/repository policy and residual-risk register.

## Acceptance criteria

1. The threat model covers all named surfaces and maps mitigations/residual risks.
2. Cross-tenant negatives prove listed data/events cannot be observed or mutated across organizations.
3. Deployment headers/TLS guidance are enforced where applicable without breaking OIDC, assets or SignalR.
4. Secrets are absent from repository/logs/captures/support bundles and validation fails safely.
5. Binary policy and automated size checks prevent accidental repository growth without rewriting history.
6. Supply-chain/security/compose/docs gates run with recorded results and triaged residual risk.

## Evidence expected for completion

Record threat-model review, tenant-negative matrix, header/proxy tests, secret scans/redaction tests, binary-policy fixtures, dependency/license audit outputs and applicable quality gates.

## Rollback and failure containment

Header policies use reviewed configuration with compatibility tests. Binary enforcement can be narrowly exempted with documented provenance, never bypassed silently. No history rewrite occurs automatically.

## Follow-up items

- Real external PLC/PLCSIM proof is deferred outside the current roadmap until suitable licensed software or physical hardware is available. Automated/fixture post-1.0 validation remains documented separately.
