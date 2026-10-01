# Security hardening

Status: **implemented and tested (S42-S57)**. This document records the security controls, how they
fail closed, and the executed evidence. Fabrik3D is **aligned with selected OWASP secure ASP.NET Core
practices** and **inspired by IEC 62443 zone/conduit concepts** applied to connector boundaries. It is
**not certified** against OWASP ASVS, IEC 62443 or any other standard, and no penetration test has
been performed.

## Zones and conduits (IEC 62443 concepts, not a certification)

| Concept | Fabrik3D mapping |
| --- | --- |
| Control zone | The ASP.NET Core orchestrator and its domain: the only component that owns authoritative state, authorization and audit. |
| Conduit | Each protocol adapter (OPC UA, MQTT, Modbus TCP) is an optional, isolated conduit. No protocol type or address leaks into the domain (QUALITY_GATES: industrial-connector invariants). |
| Default-deny | Connectors are disabled and read-only by default; writes require explicit enablement **and** an exact allow-list match. |
| Least privilege | Named role policies (`Read`, `Operate`, `Engineer`, `Instruct`, `Admin`) enforced server-side on every mutating REST endpoint and hub method. |
| Boundary separation | Replay is read-only and can never acquire authority or emit a protocol write; fault injection never propagates arbitrary writes into live machinery. |

## Controls inventory

### Authentication, authorization and tenancy

- JWT bearer validation for REST and SignalR; external OIDC in Production; a clearly-labelled,
  rate-limited Development/Test identity mode refused in Production (`AuthenticationStartupGuard`).
- Server-side `[Authorize]`/policies on every mutating endpoint; hidden UI is never the control.
- Tenant context resolved from validated membership only; a client-supplied organization id is never
  trusted. Cross-organization access is rejected without leaking existence.
- Negative tests: anonymous 401 matrix, role 403 matrix, tampered/wrong-audience/wrong-issuer/expired
  token rejection, forged tenant header rejection, cross-tenant 404.

### Protocol write policies (fail closed)

- `OpcUaOptions`, `MqttOptions` and `ModbusOptions` default to `Enabled = false` and `AllowWrites = false`.
- Writes additionally require an exact-match allow-list (`WriteAllowList` / `CommandAllowList`) and a
  writable signal/point; certificate trust is never silently bypassed. Development trust escapes are
  explicit, documented and never production defaults.
- Misconfiguration/capability tests run against real transports and the in-process fixtures:
  - `dotnet test Fabrik3D/Fabrik3D.Server.Tests --filter "FullyQualifiedName~OpcUa"` (untrusted
    certificate refused, explicit dev trust connects, prohibited/allow-listed write behavior),
  - `MqttConnectorIntegrationTests`, `ModbusConnectorIntegrationTests` (write disabled / not
    allow-listed / not-retained fail closed),
  - `SecurityHardeningTests.Every_protocol_adapter_is_disabled_and_write_fail_closed_by_default`,
  - showcase tests `ReferenceCellShowcaseTests` and `SiemensPlcsimProfileTests` (writes without
    enablement or exact allow-listing are refused).

### Input and upload validation

- **Cell file content** (`CellFileContentValidator`): must be a JSON object with a supported schema
  version. Size is bounded (`MaxContentLengthChars = 2,000,000`) and checked **before** JSON parsing so
  oversized input cannot allocate a document. Tested in
  `CellFileContentValidatorTests` and `SecurityHardeningTests.Cell_file_content_is_bounded_before_json_parsing`.
- **Asset package import** (`AssetPackageImporter`, simulator): package-relative paths only (no
  absolute paths, backslashes, `..` or scheme), declared files only (undeclared members rejected),
  bounded file count / per-file bytes / total bytes, and per-file SHA-256 integrity. Tested by
  `AssetPackageImporter.test.ts` (traversal, missing member, undeclared member, file-count limit).
- **Historian ingest**: bounded batch sizes, schema-versioned payloads, per-source rate limiting and
  read-time staleness; malformed/replayed/out-of-order data is rejected without mutating state.
- Request bodies are validated by ASP.NET Core model validation with a structured `ApiErrorDto`.
- Unhandled exceptions are normalized by `ApiExceptionHandler` to a `500` `ApiErrorDto`
  (`code = "internal_error"`) that never echoes the exception message or internal detail; the
  `X-Correlation-Id` response header identifies the occurrence. Tested by `ApiExceptionHandlerTests`.

### Rate limiting

- `auth` policy: per-client fixed window (default 30/min) on `POST /api/auth/dev-token`, rejection
  status `429`. Tested by `ObservabilityHttpTests.Auth_dev_token_endpoint_is_rate_limited`.
- `simulator-metrics` policy (S49): per-client bound (default 120/min) on
  `POST /api/diagnostics/simulator`. Tested by
  `ObservabilityHttpTests.Simulator_reports_are_rate_limited_on_sensitive_surface`.
- Historian ingestion has its own per-source batch/sample limiter (`HistorianRateLimiter`).

### CORS and response headers

- Production-like profiles never reflect arbitrary origins: no configured origins means cross-origin
  browser access is denied (no wildcard, no wildcard-with-credentials). Explicit origins win.
  Development/Testing reflect origins so the Vite dev server and loopback e2e hosts work.
- OWASP-aligned response headers on every response (`SecurityHeadersMiddleware`):
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`,
  `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-site`,
  `X-Permitted-Cross-Domain-Policies: none`, `Permissions-Policy` disabling geolocation/camera/mic.
  `Strict-Transport-Security` is **not** sent by default because TLS terminates at the deployment
  proxy/tunnel; enabling HSTS is an explicit deployment decision. Covered by `SecurityHeadersTests`.
- Swagger is environment-gated; support bundle and diagnostics are authenticated.

### Secret handling

- Secrets, tokens and credentials are never logged; access tokens are never placed in URLs (except the
  SignalR hub query parameter, which is never logged).
- Administrator support bundle is secret-redacted and scoped to owned configuration sections
  (`SecretRedactor`, `SupportBundleBuilder`), with a test that the signing key never appears in the
  serialized bundle.
- Environment overlays read external secrets from env files/Docker secrets; `*.env.example` files
  contain no real values.
- S57 extends `SecretRedactor` to also mask `.env`/config-style assignments
  (`TUNNEL_TOKEN=…`, `PASSWORD=…`) and every PEM private-key header (RSA/EC/DSA/OPENSSH/PKCS#8) in
  addition to the key-name policy; the tracked-file secret scan detects the same shapes.

### Response-hardening policy validation (S57)

- `SecurityHeaderPolicy` validates the configured `SecurityHeaders` policy at startup through
  `DeploymentConfigurationValidator`: empty frame/referrer/permissions values, a malformed or
  below-minimum HSTS `max-age`, and a CSP that would break the REST/SignalR (`connect-src`) surfaces
  are rejected before the host starts.
- `SecurityHeaders:ExternalTls=true` declares that the API is reached over public TLS and makes a
  missing HSTS value and CSP a startup error. The recommended CSP keeps `connect-src 'self' ws: wss:`,
  `worker-src 'self' blob:`, `'wasm-unsafe-eval'` and `img-src 'self' data: blob:` so the SignalR hub,
  the WebGL simulator and static assets keep working. It is opt-in so loopback development and the
  labelled public demo are unchanged. Covered by `SecurityHeaderPolicyTests`.

### Cross-tenant negatives (S57)

- Repository-level tenant filters are exercised end-to-end for Jobs, simulation sessions, cell
  templates, signal mappings, training sessions and the historian: another organization receives a
  non-leaking `404`/empty result and cannot mutate the object. Covered by
  `CrossTenantNegativeMatrixTests` (HTTP, multi-organization mode) and `CrossTenantHistorianTests`
  (persistence). The SignalR dispatch/jog targeting contract is covered by `HubTargetingTests`.
- Signal mappings are partitioned by organization in the in-memory `SignalMappingStore`, so a mapping,
  its active protocol binding and its audit trail are only visible to the organization that owns them.

## Executed evidence

```text
npm run audit
  simulator 0 vulnerabilities
  hmi       0 vulnerabilities
  no vulnerable NuGet packages (Contracts, Domain, Infrastructure, ServerTaskManager)

npm run security:scan
  Security check passed (902 file(s) checked)

dotnet test ... --filter "FullyQualifiedName~SecurityHardeningTests|FullyQualifiedName~SecurityHeadersTests|FullyQualifiedName~ObservabilityHttpTests"
  passed (write-policy defaults, header defaults, size bounds, rate limiting, diagnostics authorization)
```

## Fail-closed behavior

| Misconfiguration / failure | Behavior |
| --- | --- |
| Connector disabled, writes disabled, or signal not allow-listed | Write refused with an explicit reason; no protocol write is emitted. |
| Production identity misconfigured or insecure | Startup fails fast (`AuthenticationStartupGuard`); dev/test modes refused in Production. |
| Unsafe deployment configuration (wildcard CORS, unknown profile, missing OIDC in Production) | Startup fails fast with every actionable problem listed (`DeploymentConfigurationValidator`). |
| Cross-organization access | Rejected server-side (404/403) without leaking existence. |
| Oversized/malformed upload | Rejected before expensive parsing; nothing is persisted. |
| Observability exporter unavailable | Application continues; the request path never depends on it. |

## Known limitations / residual risk

- No independent review, penetration test or standards certification has been performed. The
  lightweight [threat model](THREAT_MODEL.md) records surfaces, mitigations and accepted residual
  risk; the statements above describe implemented controls and their tests, not compliance.
- The Development/Test authentication mode is intentionally permissive and is for local/CI/demo use
  only; Production refuses it, but operators must still configure OIDC correctly.
- `Strict-Transport-Security` and the Content-Security-Policy are deployment decisions and are not
  asserted by default; a reverse proxy that terminates TLS should set HSTS.
- Certificate pinning of external industrial endpoints is not implemented; trust-store validation and
  explicit development trust are.
- Dependency audits reflect the public vulnerability databases at execution time and must be rerun on
  each release.
