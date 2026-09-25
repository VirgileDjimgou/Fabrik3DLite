# ADR 0003 — Server identity boundary and role-based authorization

- Status: accepted (S42)
- Context sprint: S42 — Authentication, identity and RBAC
- Related: [ADR 0001](./0001-control-authority-and-source-arbitration.md), [IDENTITY_AND_RBAC.md](../architecture/IDENTITY_AND_RBAC.md)

## Context

Until S42 the server exposed every orchestration endpoint anonymously. The only authorization was a
config-gated `CellTemplateAuthorizationPlaceholder` that trusted an `X-Operator-Id` header when
enabled, and CORS reflected any origin in every environment. Fabrik3D is moving toward commercial
training and on-prem deployment, and the S36 control-authority and S37 mapping-apply operations are
privileged: "hidden buttons" and trusted headers are not security. A real, server-enforced identity
boundary is required without a homemade password store or premature tenancy.

## Decision

1. **ASP.NET Core authentication, not bespoke crypto.** JWT bearer validation
   (`AddAuthentication().AddJwtBearer()`) is the single scheme for REST and the SignalR hub. No custom
   password database, no homemade token format.
2. **OIDC for production, guarded dev/test for CI and local.** `Authentication:Mode=Oidc` validates an
   external provider (authority/issuer/audience/signature/lifetime). `Development` and `Test` modes
   issue short-lived symmetric-key tokens through a guarded endpoint. `None` is an explicit local
   emergency fallback. The mode defaults from the hosting environment and is overridable by config.
3. **Fail-closed startup guard.** `AuthenticationStartupGuard.ValidateOrThrow` refuses to start in
   Production with `Development`, `Test` or `None`, without an OIDC authority, with
   `RequireHttpsMetadata=false`, or with a development signing key. Misconfiguration exits the process
   rather than serving anonymous mutations.
4. **Named policies over a documented matrix.** `Fabrik3D.Read`, `Operate`, `Engineer`, `Instruct`,
   `Admin` and `Authenticated` map roles (`Learner`, `Instructor`, `Engineer`, `Operator`,
   `Administrator`, plus an opt-in read-only `PublicDemo`) to endpoints and hub methods. The matrix is
   declared once (`Fabrik3DPolicies.PermissionMatrix`) and asserted by unit tests.
5. **Identity is a server boundary.** Controllers, services and audit records consume
   `ICurrentIdentity` (`sub`, roles, `AuditId`); domain/infrastructure code never sees HTTP concerns.
   Audit events carry the authenticated subject and role.
6. **Structured, leak-free failures.** `401` (`unauthorized`) and `403` (`forbidden`) return
   `ApiErrorDto`; dev-token issuance is rate-limited. Tokens are never placed in URLs or logs.
7. **Environment-appropriate transport security.** CORS uses explicit origins when configured, reflects
   any origin only outside Production, and denies cross-origin in Production without configured origins
   (`CorsPolicyRules`). `SecurityHeadersMiddleware` adds OWASP-aligned response headers.
8. **Front-ends reflect, never decide.** HMI and simulator store the short-lived token in memory +
   `sessionStorage`, re-validate it server-side, and convert `401` into explicit re-authentication. The
   simulator keeps a clearly-labelled offline mode without a server session.

## Consequences

- Every mutating endpoint and hub method is enforced server-side; a compromised or modified client
  cannot bypass role checks.
- CI and local development use `Testing`/`Development` with a real (test) token, so the enforcement
  path is exercised in tests rather than mocked.
- The placeholder (`CellTemplateAuthorizationPlaceholder`, `X-Operator-Id`,
  `Orchestration:RequireCellTemplateAuth`/`RequireSignalMappingAuth`) is removed.
- Tenancy is intentionally out of scope and lands in S43 on top of this boundary; the matrix and
  `ICurrentIdentity` are the extension points.
- Operators must configure an OIDC authority before a production deployment; the startup guard makes
  that mandatory rather than optional.
