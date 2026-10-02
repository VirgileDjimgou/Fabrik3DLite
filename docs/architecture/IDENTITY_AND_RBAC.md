# Identity, authentication and RBAC

This document describes the Fabrik3D server identity boundary introduced in S42: authentication
modes, token validation, the role/permission matrix, server-side authorization, audit identity,
failure handling and the front-end login surfaces. It replaces the earlier
`CellTemplateAuthorizationPlaceholder` (`X-Operator-Id`, `Orchestration:RequireCellTemplateAuth`),
which has been removed.

Status: **implemented**. The mechanisms below are enforced by the server and covered by automated
tests. Fabrik3D does **not** claim formal compliance with any identity standard; the design is
*aligned with selected OIDC/OAuth2 concepts* where noted.

## Design boundaries

- Identity is a **server boundary**. Domain and infrastructure code consume authenticated principal
  data through `ICurrentIdentity`, never HTTP concerns.
- Front-ends **never decide authorization**. They reflect the roles returned by the verified server
  token and the `401`/`403` responses the server returns.
- The SignalR hub uses the **same policies** as REST.
- Development/test authentication is isolated, guarded and explicitly refused in Production.

The relevant server code lives under `Fabrik3D/Fabrik3D.Server/Authentication/`:

| File | Responsibility |
|---|---|
| `Fabrik3DAuthenticationOptions.cs` | Configuration model and mode resolution |
| `Fabrik3DAuthenticationExtensions.cs` | JWT bearer, policies, CORS, rate limiting registration |
| `AuthenticationStartupGuard.cs` | Fail-closed startup validation (Production guard) |
| `DevelopmentTokenIssuer.cs` | Guarded dev/test JWT issuance (no passwords) |
| `CurrentIdentity.cs` | `ICurrentIdentity`, `HttpCurrentIdentity`, claim types |
| `IdentityConstants.cs` | Role names, policy names, permission matrix |
| `CorsPolicyRules.cs` | Testable production/development origin decision |

## Authentication modes

The mode is configured in `Authentication:Mode`. When it is empty it is derived from the hosting
environment:

| Environment | Default mode |
|---|---|
| `Production` | `Oidc` |
| `Testing` | `Test` |
| `Development` (and anything else) | `Development` |

| Mode | Purpose | Token validation |
|---|---|---|
| `Oidc` | Production external identity provider (standards-oriented OIDC) | Authority metadata, issuer, audience, signature, lifetime |
| `Development` | Local development / clearly-labelled public demo | Symmetric signing key, issuer `fabrik3d-development`, audience `fabrik3d-api` |
| `Test` | Automated/CI and E2E | Symmetric signing key, issuer `fabrik3d-test`, audience `fabrik3d-api` |
| `None` | **Local emergency fallback only**; disables server-side authorization | No signature/issuer/audience/lifetime validation |

### Configuration section

```jsonc
"Authentication": {
  "Mode": "",                        // Oidc | Development | Test | None (empty = environment default)
  "Authority": null,                 // OIDC authority metadata endpoint (required in Production)
  "Issuer": null,                    // expected issuer; derived defaults for dev/test
  "Audience": null,                  // expected audience
  "RequireHttpsMetadata": true,      // must stay true in Production
  "SigningKey": null,                // dev/test secret; never committed; generated when absent
  "AccessTokenLifetimeMinutes": 15,  // short-lived access tokens
  "ClockSkewSeconds": 30,
  "PublicDemoEnabled": false,
  "ValidateIssuer": true,
  "ValidateAudience": true,
  "Browser": {                       // S63: public Authorization Code + PKCE settings for the SPA
    "ClientId": null,                // public client id registered with the provider (no secret)
    "Scopes": [ "openid", "profile" ],
    "RedirectPath": "/auth/callback",
    "PostLogoutRedirectPath": "/",
    "EndSessionEnabled": true
  }
},
"Demo": {                            // S63: bounded public-demo lifecycle, disabled by default
  "Enabled": false,                  // enabled only by the explicit appsettings.Demo.json profile
  "ResetEnabled": true,
  "ResetLabel": "Reset Demo"
}
```

Secrets come from the environment or a key vault and are never committed. In `Development`/`Test`
an ephemeral process-local signing key is generated when `SigningKey` is empty; the host logs the
active mode and issuer at startup.

### Production guard (fail closed)

`AuthenticationStartupGuard.ValidateOrThrow` runs immediately after `builder.Build()` and throws
`InvalidOperationException` — the process exits instead of serving traffic — when:

- `Mode=Development`, `Mode=Test` or `Mode=None` is configured in Production;
- the mode is not a supported production mode;
- `Oidc` is selected without an `Authority`;
- `RequireHttpsMetadata=false` is configured in Production;
- a development/test `SigningKey` is configured in Production.

This is the enforcement point for "development authentication can never be mistaken for production".

## Browser OIDC (Authorization Code + PKCE) — S63

The HMI and the simulator both sign in through the **same** server authentication model. In
`Mode=Oidc` the server advertises only public, non-secret browser settings from
`GET /api/auth/config` (`oidc` block: authority, public client id, scopes, redirect paths). The
browser then runs a standard flow, with no provider-specific business logic and no custom identity
server:

```text
Browser → OIDC authority (/.well-known/openid-configuration)
        → authorization code (state + S256 code_challenge)
        → token endpoint (code + code_verifier, no client secret)
        → opaque access token
        → Fabrik3D API (/api/*) and SignalR (/hubs/orchestration)
```

Implementation: `fabrik3d.hmi/src/auth/oidcPkce.ts` and `fabrik3d.client/src/auth/oidcPkce.ts`
(portable helpers), driven by each app's `auth/authService.ts`.

Lifecycle handling:

- **Login** — `beginOidcLogin` discovers provider metadata, creates an S256 PKCE verifier/challenge
  and a CSRF `state`, persists only those two values in `sessionStorage`, then navigates to the
  authorization endpoint. The callback is completed exactly once by `completeOidcLogin`.
- **Callback** — the CSRF `state` is validated before the code is exchanged; the one-time
  verifier/state are removed after use. The code is exchanged with `grant_type=authorization_code`
  and the `code_verifier`.
- **Roles** — an OIDC access token may be opaque, so the app never reads roles from it. It
  materializes a provisional session and immediately re-reads the authoritative principal from
  `GET /api/auth/me`; if that call fails the session is cleared (fail closed) instead of inventing
  roles. Role changes observed on refresh bump `roleRevision`.
- **Expiry / refresh / re-auth** — the provider `expires_in` is tracked explicitly; a token with no
  known expiry is treated as expired. On a local expiry or a `401`/`403` from REST or the hub, the
  session is cleared, `sessionExpired` is set and the UI shows explicit re-authentication. OIDC
  relies on redirect-based re-authentication rather than silent refresh-token rotation.
- **Logout** — `oidcLogout` clears the local session and, when the provider advertises
  `end_session_endpoint` and `EndSessionEnabled=true`, performs RP-initiated logout with
  `post_logout_redirect_uri` and `client_id`. In Test/Demo mode it degrades to a local logout.
- **SignalR reconnect** — the hub reuses `accessTokenFactory`, so automatic reconnect re-reads the
  current token; a closed hub with an expired/absent token raises the same explicit re-auth signal.
- **Unavailable authority** — discovery/token failures surface a clear authentication error
  (`oidc_*`); the app never falls back to anonymous privileged access.

Never logged: access/refresh/id tokens, authorization codes and PKCE verifiers. Redirect-URI,
authority, client id and scopes are public and may be shown; no client secret exists for a public
SPA client.

Test/Demo authentication remains visibly distinct: `isOidcMode` is true only for `mode=oidc` **and**
a configured `oidc` block, so a Test/Development deployment never renders or advertises the provider
button. The `Warning` from `/api/auth/config` is shown prominently in Test/Demo mode. The startup
guard still refuses dev/test modes in Production.

## Bounded public-demo reset — S63

The public demonstration shares mutable simulated state. S63 adds an explicit, audited, bounded
reset that is **disabled by default** (`Demo:Enabled=false`) and only enabled by the dedicated
`appsettings.Demo.json` profile:

- `POST /api/demo/reset` requires the `Fabrik3D.Operate` permission; the read-only `PublicDemo` and
  `Learner` identities are refused with `403`. Anonymous callers get `401`, and outside the enabled
  demo profile the route returns `404` rather than advertising the lifecycle.
- It removes **only** simulated demo state: jobs, tasks, simulation sessions, alarms, operator
  messages, machine state, control-authority records and training sessions/actions. It never touches
  production/profile data: organizations, memberships, cell templates, connector configuration,
  mappings or schema migrations survive.
- Tenant-scoped deletions are filtered through `TenantQuery.For`, so a reset can never remove another
  organization's data.
- The result reports the authenticated actor (`AuditId`), the organization and bounded counts, and a
  structured server log records the same without any token material. The outcome is recorded in the
  `fabrik3d.demo.resets` metric (`outcome=success|failure`). A failure throws and leaves the HTTP
  layer to report it; the HMI shows pending/success/failure explicitly.
- The HMI surface (`HmiDemoReset`) renders only when `/api/auth/config` reports `DemoResetEnabled`
  **and** the operator holds `Operate`, and confirms the target before acting. Hidden UI is not a
  control: the server re-checks both.

## Roles and permission matrix

Roles: `Learner`, `Instructor`, `Engineer`, `Operator`, `Administrator`, plus a clearly-labelled
`PublicDemo` read-only role available only when `Authentication:PublicDemoEnabled=true`.

| Policy | Learner | Instructor | Engineer | Operator | Administrator | PublicDemo |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| `Fabrik3D.Read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `Fabrik3D.Operate` | – | – | ✓ | ✓ | ✓ | – |
| `Fabrik3D.Train` | ✓ | ✓ | – | – | ✓ | – |
| `Fabrik3D.Engineer` | – | – | ✓ | – | ✓ | – |
| `Fabrik3D.Instruct` | – | ✓ | – | – | ✓ | – |
| `Fabrik3D.Admin` | – | – | – | – | ✓ | – |

`Fabrik3D.Authenticated` requires any authenticated principal (including `PublicDemo`) and is used
for identity self-inspection (`GET /api/auth/me`). The matrix is defined once in
`Fabrik3DPolicies.PermissionMatrix` and asserted by `IdentityPolicyTests`.

## Endpoint authorization matrix

Authorization is enforced server-side; hiding a control in the UI is never a control. Controllers
are protected at the class level with `[Authorize]` and mutating actions override the policy.

| Controller / route | Read | Mutating actions |
|---|---|---|
| `JobsController` `/api/jobs` | `Read` | `Operate` (create/start/pause/resume/stop/claim/delete) |
| `TasksController` `/api/tasks` | `Read` | `Operate` (status) |
| `SimulationSessionsController` `/api/simulation-sessions` | `Read` | `Operate` (create/state/heartbeat) |
| `MachineStateController` `/api/machine-state` | `Read` | `Operate` (current) |
| `AlarmsController` `/api/alarms` | `Read` | `Operate` (acknowledge/transition) |
| `MessagesController` `/api/messages` | `Read` | – |
| `CellTemplatesController` `/api/cell-templates` | `Read` | `Engineer` (create/update/delete) |
| `MappingsController` `/api/mappings` | `Read` | `Engineer` (validate/upsert/apply/delete) |
| `ControlAuthorityController` `/api/control-authority` | `Read` | `Operate` (acquire/release/heartbeat), `Engineer` (forced takeover) |
| `HistorianController` `/api/historian` | `Read` | `Operate` (telemetry/event ingest) |
| `TrainingController` `/api/training/sessions` | `Read` | `Train` (start/report/complete/import), `Instruct` (assessment corrections) |
| `ConnectorsController` `/api/connectors` | `Read` | – |
| `AuthController` `/api/auth` | `config` is anonymous | `dev-token` anonymous + rate-limited (404 outside dev/test); `me` authenticated |
| `DemoController` `/api/demo` | – | `Operate` (`reset`; `404` unless the explicit demo profile is enabled) |
| `HealthController` `/api/health`, `/api/Health` | anonymous | – |
| SignalR `/hubs/orchestration` | authenticated | same policies as REST |

The hub access token may be supplied as the `access_token` query parameter during WebSocket
negotiation (SignalR clients cannot always set an `Authorization` header); REST never accepts a
token in the query string.

## Audit identity

`ICurrentIdentity.AuditId` (the stable `sub`) and the role are recorded on:

- control-authority events (`ControlAuthorityEvent.ActorId`/`ActorRole`),
- alarm acknowledgement/transition,
- cell-template writes,
- signal-mapping apply,
- training session lifecycle and audited assessment corrections (S44), which also record the owning
  learner subject and the correcting instructor subject.

Existing audit entries created before S42 remain valid; new entries always carry an identity. No new
anonymous audit entry is produced when a caller is unauthenticated because unauthenticated mutations
are rejected before the service layer runs.

## Token handling, session expiry and CSRF

- Access tokens are short-lived (default 15 minutes) and issued by the configured OIDC provider or,
  in dev/test, by `DevelopmentTokenIssuer` with a symmetric key.
- Tokens are never placed in URLs (except the SignalR negotiation query parameter), never logged and
  never returned in error payloads.
- Front-end storage decision: the token lives in memory and is mirrored to **`sessionStorage`** only.
  Any storage readable by JavaScript is exposed to a successful XSS; `localStorage` (longer-lived)
  is deliberately avoided, and a cookie-based flow (which would require CSRF protection) is not
  used. This trade-off is documented in `fabrik3d.hmi/src/auth/authStore.ts` and
  `fabrik3d.client/src/auth/authStore.ts`.
- On startup the client re-validates the token with `GET /api/auth/me`; a `401`/`403` clears the
  session and sets `sessionExpired`, producing explicit re-authentication instead of a silent
  anonymous fallback.
- A `401` from any REST call or the hub calls `notifyUnauthorized()`, which clears the session,
  flags expiry and returns the UI to the login surface. Token expiry is also checked locally before
  use.
- Refresh strategy: the current implementation re-authenticates (dev/test login or OIDC redirect).
  Silent refresh-token rotation is provider-driven and intentionally not implemented in this
  application; the short access-token lifetime bounds exposure.
- A cookie-based flow is intentionally not shipped, so no CSRF token machinery is required. Any
  future cookie flow must add anti-forgery protection before use.

## Failure handling

- Authentication failure → `401` with a structured `ApiErrorDto` (`code = "unauthorized"`).
- Authorization failure → `403` with a structured `ApiErrorDto` (`code = "forbidden"`).
- Error payloads contain no internal validation detail and no token material.
- `POST /api/auth/dev-token` is rate-limited (`Fabrik3DAuthRateLimitPolicy`, 30 requests/minute per
  remote address) and returns `429` when exceeded.
- Identity provider unavailable: the API returns `401`/`503`-class failures and never falls back to
  anonymous. Already-authenticated callers continue only until their token expires.

## CORS and response headers

- CORS is configured through the `Cors:AllowedOrigins` array. When origins are configured they are
  used with credentials.
- Without configured origins, **Development/Testing** reflects any origin so the Vite dev server and
  loopback E2E hosts work, while **Production denies cross-origin browser access** (same-origin
  only). There is no wildcard-with-credentials default in Production (`CorsPolicyRules`).
- `SecurityHeadersMiddleware` adds `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Cross-Origin-Opener-Policy` and `Permissions-Policy` to every response. Values are configurable
  under `SecurityHeaders`; an optional `Content-Security-Policy` is unset by default because Swagger
  UI and the WebGL simulator need inline/eval behaviour. HSTS/TLS termination is handled by the
  deployment reverse proxy/tunnel.

## Public demo

The public demo runs in an explicitly documented configuration (`Authentication:Mode=Test` or
`Development` with a non-production warning) or with `PublicDemoEnabled=true` issuing the read-only
`PublicDemo` role. The simulator's offline local demo continues to work without any server session
and is labelled `OFFLINE LOCAL DEMO - NOT AUTHENTICATED`. No configuration silently accepts
anonymous mutations in Production.

The dedicated demo deployment can additionally enable the bounded, audited reset described in
[Bounded public-demo reset — S63](#bounded-public-demo-reset--s63). It is disabled by default and
never exists in a production profile; the flagship public demo is S64.

## Migration from the placeholder

- `CellTemplateAuthorizationPlaceholder` and the `X-Operator-Id` header path were removed.
- `Orchestration:RequireCellTemplateAuth` / `Orchestration:RequireSignalMappingAuth` are obsolete and
  no longer read.
- Cell-template writes now require the `Fabrik3D.Engineer` policy; mapping apply requires the same
  policy. CI/local workflows use the `Testing` mode with a real (test) token.

## Endpoints

| Endpoint | Auth | Description |
|---|---|---|
| `GET /api/auth/config` | anonymous | Public discovery of mode, roles, dev-auth label and public demo availability |
| `POST /api/auth/dev-token` | anonymous (dev/test only, rate-limited) | Issues a short-lived identity token; `404` outside dev/test |
| `GET /api/auth/me` | authenticated | Server-side principal (`sub`, name, roles, authentication type) plus the resolved organization |

## Testing

- Unit: `IdentityPolicyTests` (matrix, mode resolution, startup guard, production refusal),
  `SecurityHeadersTests` (headers, CORS origin rules).
- Integration: `EndpointAuthorizationTests` over the real `Program.cs` pipeline (anonymous/role
  401/403 matrices, token tampering/audience/issuer/expiry, SignalR negotiation, audit identity,
  public demo), `OidcBrowserConfigTests` (public browser OIDC discovery, scopes, no secret) and
  `DemoResetTests` (demo profile gating, `Operate`-only authorization, tenant-scoped scope,
  profile data preserved).
- Cell-template matrix: `CellTemplateAuthorizationTests`.
- Front-end: `fabrik3d.hmi/src/auth/authStore.test.ts`, `authService.test.ts`,
  `oidcPkce.test.ts`, `HmiLogin.test.ts`, `HmiDemoReset.test.ts`,
  `fabrik3d.client/src/auth/authStore.test.ts`, `authService.test.ts`, `oidcPkce.test.ts`,
  `orchestratorApiAuth.test.ts`.
- E2E: `fabrik3d.hmi/e2e/orchestration-smoke.spec.ts`, `orchestration-claim.spec.ts`,
  `cell-templates.spec.ts` (Engineer/Learner roles) and `hmi-design-system.spec.ts` (seeded operator
  session) exercise authenticated workflows against the real server.

## Organizations and tenancy (S43)

Roles answer *what* a principal may do; organizations answer *whose* data it may do it on. S43 adds a
tenant boundary on top of this identity boundary:

- `TenantContextMiddleware` resolves the active organization after authentication and before
  authorization, from validated claims and active `Membership` rows only. A client-supplied
  `X-Organization-Id` is accepted only when an active membership exists, a revoked membership is
  rejected mid-session, and missing/ambiguous contexts fail closed in multi-organization mode.
- Repositories filter tenant-scoped data server-side through `TenantQuery.For`; front-ends display
  the resolved organization but never decide access. All role policies above still apply on top of
  tenancy.
- `GET /api/auth/me` reports the resolved organization; `/api/organizations/context` reports the
  selectable organizations. See [ORGANIZATIONS_AND_TENANCY.md](./ORGANIZATIONS_AND_TENANCY.md) and
  [ADR 0004](../adr/0004-organizations-and-tenancy.md).

## Limitations / not in this sprint

- No billing/subscription identity.
- No silent refresh-token rotation in the application.
- No formal standards certification claim.
- `Instruct` and `Admin` are defined and tested at the matrix level; the `Instruct` policy protects
  training-assessment corrections (S44) and administration endpoints as they arrive. The `Instruct`
  and `Admin` role assignment surfaces remain minimal.
