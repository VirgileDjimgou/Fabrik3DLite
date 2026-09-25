# S42 - Authentication, identity and RBAC

## Outcome

Authorization placeholders are replaced with real identity architecture: established ASP.NET Core security mechanisms, standards-oriented OIDC/OAuth2-compatible external identity support, stable external subject identifiers, roles (Learner, Instructor, Engineer, Operator, Administrator), server-side authorization on all mutating endpoints, audit identity, failure handling, session expiry, CSRF/secure token handling, and a development/test authentication mode that cannot be mistaken for production security.

## Motivation

Fabrik3D is moving toward commercial training and on-prem deployment; "hidden button" security is not sufficient. The S36 authority model and S37 mapping apply are privileged operations that need real authorization.

## Current-state assumptions to verify

- The server has no `AddAuthentication`/`AddAuthorization` today; only `CellTemplateAuthorizationPlaceholder` (allows writes when `Orchestration:RequireCellTemplateAuth=false`, else requires an `X-Operator-Id` header).
- The HMI has no login; the simulator has no login; both call REST/SignalR directly.
- CORS is configured with `SetIsOriginAllowed(_ => true)` (`DevCors`) and is used in all environments currently.
- All endpoints are anonymous; SignalR has no access token support.
- CI starts the server in `Testing` with the production `Program.cs` pipeline.

## Scope

- Adopt ASP.NET Core authentication/authorization:
  - JWT bearer validation for API/hub access, with authority/issuer/audience/validation configured from environment;
  - external OIDC provider support (standards-oriented) as the primary production mode;
  - a clearly labelled `Authentication:Mode=Development|Test` mode that issues/accepts a development identity and is refused when `ASPNETCORE_ENVIRONMENT=Production`;
  - local application users represented by stable external subject identifiers (`sub`), not stored passwords.
- Roles/permissions: `Learner`, `Instructor`, `Engineer`, `Operator`, `Administrator`; map to policies for endpoints and hub methods. Authorization is enforced server-side on every mutating endpoint, including claim/state/task/heartbeat, cell templates, mapping apply, authority operations, and future training endpoints.
- Audit identity: record `sub`/role on authority events, alarm acknowledgement/transition, cell-template writes, mapping apply, and training actions; no anonymous audit.
- Authentication failure handling: 401 vs 403 with structured `ApiErrorDto` codes, no internal detail leakage, rate limiting/backoff consideration for auth endpoints.
- Session expiry behavior for both REST and SignalR (token expiry → explicit reconnect/auth failure, not silent anonymous degradation).
- Secure cookie/token handling: no tokens in URLs; short-lived access tokens; refresh strategy documented; CSRF considerations documented for any cookie-based flow.
- Frontend: HMI and simulator login/redirect flow appropriate to their roles; token storage decision documented (with XSS trade-off analysis); logout and expiry UX; EN/FR/DE.
- Development/test mode cannot be mistaken for production: prominent banner in dev login, configuration guard failing startup in Production when development auth is configured, and CI `Testing` usage explicitly marked.
- Migrate `CellTemplateAuthorizationPlaceholder` to real policy and remove the placeholder doc as obsolete (keep compatibility behavior in tests if needed).

## Non-goals

- No custom password database or homemade crypto.
- No tenant model yet (S43).
- No billing/subscription identity.
- Do not claim compliance with a specific identity standard beyond implemented mechanisms.
- Do not break the public demo: provide a documented, clearly labelled public/demo role if the demo must remain accessible.

## Architecture boundaries

- Identity is a server boundary; Domain/Infrastructure consume authenticated principal data, not HTTP concerns.
- Frontends never decide authorization; they only reflect server responses.
- Hub authorization uses the same policies as REST.
- Development mode is isolated, guarded, and documented as non-production.

## Domain and data model changes

- Optional user/role mapping document keyed by external `sub` if local role assignment is needed; versioned and indexed.
- Audit fields on existing entities gain identity values (additive).

## Backend changes

- Authentication/authorization services, policies, token validation, hub auth, audit enrichment, auth error filter, configuration options, rate limiting for auth-sensitive endpoints.
- Endpoint-by-endpoint authorization matrix; tests for every class.

## Simulator changes

- Authentication flow, token attachment to REST/SignalR, expiry handling, role-aware UI gating that never substitutes for server enforcement.
- Offline local demo must continue to work without a server session and must be clearly labelled.

## HMI and UX changes

- Login/logout, expired-session recovery, role-aware navigation, explicit unauthorized feedback; EN/FR/DE; accessible forms.
- No critical control hidden behind unclear auth states.

## 3D and visual requirements

Not applicable beyond connection/auth state indication in existing status surfaces.

## Protocol and security requirements

- OWASP-aligned: no default credentials, no dev auth in production, no token in URL/logs, secure headers, CORS restricted per environment.
- CORS must be configurable and must not accept all origins in Production by default.
- SignalR connections must be authenticated and revoked on expiry.
- All existing write policies (OPC UA/MQTT/Modbus, authority) remain enforced in addition to roles.

## Backward compatibility

- CI and local development workflow must remain workable through the documented `Testing`/`Development` identity mode with clear labelling.
- Public demo behavior is preserved through an explicitly documented configuration.
- Existing endpoints keep their routes; only authorization is added.

## Migration requirements

- Existing audit entries without identity remain valid; new entries carry identity.
- Existing operator-id header usage is migrated/deprecated with documentation.

## Failure and degraded-mode behavior

- Identity provider unavailable: API returns structured 503/401 behavior; already-authenticated short windows may continue until token expiry; no silent anonymous fallback.
- Expired token: explicit 401 and frontend re-auth; no partial writes.
- Misconfigured production auth: fail startup rather than run insecurely.

## Testing strategy

- Unit tests: policy evaluation, role mapping, token validation configuration, dev-mode guard.
- Integration tests: 401/403 matrices per endpoint class; audit identity recorded; expired token rejected; hub authorization; forbidden role cannot mutate; development mode refused in Production configuration.
- Negative tests: tampered token, wrong audience/issuer, missing role, anonymous mutation, cross-user audit confusion.
- Frontend tests: login/expiry/logout flows, role-aware navigation, unauthorized feedback, token attachment.
- E2E: authenticated operator workflow and authenticated instructor action.

## Performance requirements

- Token validation overhead measured and acceptable; no per-request identity lookup that bypasses caching without measurement.
- Hub authentication does not break reconnect behavior.

## Security considerations

- Secrets from environment/key vault, never committed; key rotation documented.
- No `RequireHttpsMetadata=false` in production defaults.
- Rate limiting for auth-sensitive paths where applicable.
- Logging never includes tokens.

## Documentation changes

- New `docs/architecture/IDENTITY_AND_RBAC.md` (modes, providers, roles/policies, token handling, dev mode, audit, migration from placeholder).
- Update `ORCHESTRATION.md`, `README.md`, `docs/development/SETUP.md`, and the security model section.
- ADR for the identity strategy.

## Acceptance criteria

1. Every mutating endpoint enforces a policy server-side; hidden UI is not required for enforcement; tests prove 401/403 for each class.
2. Roles work for Learner/Instructor/Engineer/Operator/Administrator with a documented permission matrix.
3. Development/Test identity mode is available for CI/local, prominently labelled, and refused in Production.
4. Audit records carry the authenticated subject for authority, alarms, templates, mapping, and training actions.
5. Token expiry produces explicit re-auth behavior in HMI and simulator; no silent anonymous fallback.
6. CORS and headers are environment-appropriate and configurable; no wildcard-with-credentials in Production defaults.
7. All builds/tests/E2E/contracts gates pass, including the public demo configuration.

## Evidence expected for completion

```text
dotnet build/test (N passed, listing auth/authorization/audit tests)
frontend type-check/test/build + auth flow tests
E2E authenticated workflow evidence
configuration evidence showing Production refuses dev auth
policy matrix document
npm run contracts:check (pass)
```

## Rollback and failure containment

Authentication is feature-configured; reverting to the placeholder mode is possible for a local emergency only when explicitly configured and clearly labelled, never as the default. Do not ship a fallback that silently accepts anonymous mutations in Production.

## Follow-up items that must not leak into this sprint

- Organizations/tenancy (S43), server training sessions (S44), instructor dashboard (S45).
- Security hardening review (S49).
