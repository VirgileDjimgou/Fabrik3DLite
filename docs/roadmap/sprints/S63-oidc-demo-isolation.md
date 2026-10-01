# S63 - Frontend OIDC and public demo isolation

## Outcome

Close the remaining credibility gap between the production-ready backend authentication model and browser clients using standard OIDC Authorization Code + PKCE, and make the public demonstration predictable with a bounded demo reset.

## Motivation

The backend already has authentication/RBAC and identity boundaries. Browser clients should use the same model instead of a divergent shortcut, and shared public-demo state should be resettable without touching production data or building a SaaS platform.

## Current-state assumptions to verify

- Inspect the existing server authentication/RBAC, test/demo authentication mode and SignalR authorization.
- Inspect HMI and simulator API/SignalR clients and their token handling.
- Identify which state a public demo mutates (jobs, tasks, machine state, faults, training/demo state).

## Scope

### OIDC

Use the existing server authentication/RBAC. Implement browser:

```text
Authorization Code + PKCE
```

for HMI and simulator. Support standard OIDC providers without provider-specific business logic.

Expected flow:

```text
Browser
 → OIDC authority
 → authorization code
 → PKCE exchange
 → access token
 → Fabrik3D API / SignalR
```

Handle:

```text
login
logout
token expiry
refresh/re-authentication
unauthorized route
SignalR reconnect
role changes
```

Keep Test/Demo authentication clearly separate. Do not build a custom identity server.

### Public demo isolation

Add a lightweight deterministic demo lifecycle. Provide:

```text
Reset Demo
```

and/or bounded demo-session reset.

Reset only simulated public-demo state:

```text
jobs
tasks
machine state
faults
training/demo state
```

Never affect production profiles. Do not build a SaaS tenancy system beyond what already exists.

## Non-goals

- No custom identity provider, no new identity database, no provider-specific business logic.
- No change to the existing authorization rules or tenant model.
- No destructive reset of production/profile data.
- No new protocol, database or framework.

## Architecture boundaries

- Server remains the authority for authentication, authorization, roles, tenant and target selection; the browser is never trusted for authorization decisions.
- Test/Demo authentication must remain visibly distinct from OIDC and remain disabled in production configuration.
- The demo reset is an explicit, audited operation restricted to simulated demo state.

## Changes

- Add an OIDC Authorization Code + PKCE client for HMI and simulator, configured through existing settings.
- Route API and SignalR calls through the token lifecycle; handle expiry, refresh/re-auth, unauthorized routes, reconnect and role changes.
- Keep Test/Demo auth mode separate and labeled.
- Add a bounded, deterministic demo reset endpoint/command plus HMI affordance, or an explicitly demo-scoped session reset.
- Add audit/observability for reset and authentication lifecycle events without logging secrets.

## Backward compatibility

- Existing Test/Demo mode continues to work for development and tests.
- Existing API contracts and role checks remain valid; extend rather than duplicate.
- Existing demo sessions remain usable until explicitly reset.

## Failure and degraded modes

- Unavailable OIDC authority produces a clear authentication error and does not fall back to anonymous privileged access.
- Expired or invalid tokens lead to re-authentication, not silent failure.
- A failed demo reset reports pending/success/failure explicitly and leaves state unchanged on failure.

## Testing strategy

- Deterministic tests for the PKCE flow using a fixture/standard OIDC test provider.
- Tests for login/logout, expiry, refresh/re-auth, unauthorized route, SignalR reconnect and role changes.
- Tests proving Test/Demo auth remains separate and cannot satisfy production authorization.
- Tests proving demo reset affects only the allowed simulated state and never production profiles.
- Existing authentication/RBAC and tenancy tests remain green.
- Run applicable build/type-check/unit/visual/docs/security gates.

## Performance requirements

- Authentication lifecycle adds no measurable regression to normal API/SignalR flows.
- SignalR reconnect after token refresh is bounded and observable.

## Security and licensing considerations

- Standard OIDC only; no provider-specific business logic; no custom identity server.
- Never log tokens, codes, secrets or personal data; redaction follows existing rules.
- Authorization remains server-side; the browser only carries tokens.

## Documentation changes

- Document browser OIDC configuration, expected flow, lifecycle handling, demo reset scope and the explicit separation from Test/Demo auth.
- Update security, deployment and administrator documentation affected by the public demo lifecycle.

## Acceptance criteria

1. HMI and simulator authenticate through OIDC Authorization Code + PKCE against a standard provider.
2. Login, logout, expiry, refresh/re-authentication, unauthorized route, SignalR reconnect and role changes are handled and tested.
3. Test/Demo authentication remains clearly separate and cannot authorize production access.
4. A bounded Reset Demo (or demo-session reset) exists, affects only simulated public-demo state and never production profiles.
5. No custom identity server, new identity database or SaaS tenancy system was introduced.
6. All applicable gates pass.

## Evidence expected for completion

Record OIDC fixture flow tests, lifecycle tests, login/refresh/reconnect results, demo reset scope tests, configuration documentation and the applicable quality gates.

## Rollback and failure containment

OIDC can be disabled by configuration, restoring the existing Test/Demo path without data migration; the reset operation is additive and scoped.

## Follow-up items

- The flagship demo, documentation and release polish are S64.
