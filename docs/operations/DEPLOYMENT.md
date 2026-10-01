# On-premise deployment guide

This guide covers installing and operating Fabrik3D on a customer-controlled host with no cloud
dependency. It describes the shipped Docker Compose stack, its secure defaults, the available
configuration profiles, networking, TLS, and first-start validation. Hardware, browser and disk
guidance is in [REQUIREMENTS.md](REQUIREMENTS.md); day-to-day operation is in
[ADMINISTRATOR_GUIDE.md](ADMINISTRATOR_GUIDE.md).

The design rationale is recorded in [ADR 0006](../adr/0006-on-premise-deployment-and-migration.md).

## What is real, simulated or planned here

- **Real:** the Compose stack, health/readiness/version endpoints, configuration validation, schema
  migration runner and lifecycle scripts are implemented and were exercised end to end (see
  [VALIDATION.md](VALIDATION.md)).
- **Configuration-dependent:** OIDC identity, connector enablement and TLS termination require
  customer-provided infrastructure. Fabrik3D refuses to start in a production-like profile without a
  configured OIDC authority.
- **Simulated:** all cell behaviour is simulated. Enabled industrial connectors talk to real
  endpoints but the shipped equipment models remain simulated unless a connector maps real tags.
- **Not provided:** Kubernetes/Helm, cloud autoscaling and HA clustering are explicit non-goals.

## Prerequisites

- A 64-bit Linux host (or Windows host running Docker Desktop) with Docker Engine 24+ and Compose v2.
- The ability to pull the base images `mongo:8.0`, `mcr.microsoft.com/dotnet/sdk:8.0`,
  `mcr.microsoft.com/dotnet/aspnet:8.0`, `node:22-alpine` and `nginx:1.27-alpine`, or a pre-loaded
  image mirror for air-gapped installs.
- An OIDC identity provider reachable from the orchestrator.
- TLS terminated by an ingress/reverse proxy in front of the stack.

## Stack topology

`Fabrik3D/compose.production.yaml` defines four services on one internal network:

| Service | Image | Host port (default) | Purpose |
| --- | --- | --- | --- |
| `mongo` | `mongo:8.0` | not published (internal only) | persistence |
| `orchestrator` | `fabrik3d/orchestrator:1.0.0` | `8080` (`ORCHESTRATOR_PORT`) | ASP.NET Core API + hubs |
| `simulator` | `fabrik3d/simulator:1.0.0` | `8081` (`SIMULATOR_PORT`) | Nginx serving the 3D simulator |
| `hmi` | `fabrik3d/hmi:1.0.0` | `8082` (`HMI_PORT`) | Nginx serving the operator HMI |

Startup order is enforced with `depends_on: condition: service_healthy`: MongoDB must be healthy
before the orchestrator starts, and the orchestrator must be healthy before the simulator and HMI
start. Every service has a healthcheck. MongoDB is never reachable from outside the internal
network.

## Configure

Environment-specific overlays select the secure defaults without changing the ASP.NET Core
environment (which stays `Production`):

| Profile | Overlay | Intended use |
| --- | --- | --- |
| `Production` | `appsettings.Production.json` | customer production install |
| `OnPrem` | `appsettings.OnPrem.json` | training-centre install behind a local IdP |
| `Demo` | `appsettings.Demo.json` | public read-only demonstration |

Copy the matching template and fill in your values. The templates in `Fabrik3D/env/` are
**non-secret**; the deployment-only copies must live outside the repository:

```bash
cp Fabrik3D/env/onprem.env.example /etc/fabrik3d/onprem.env
# edit /etc/fabrik3d/onprem.env — never commit this file
```

At minimum set:

```dotenv
Deployment__Profile=OnPrem
Authentication__Mode=Oidc
Authentication__Authority=https://idp.example.internal/realms/fabrik3d/
Authentication__Issuer=https://idp.example.internal/realms/fabrik3d/
Authentication__Audience=fabrik3d-api
Authentication__RequireHttpsMetadata=true
Cors__AllowedOrigins__0=https://fabrik3d.example.internal
```

All configuration can also be supplied as environment variables using `Section__Key` (double
underscore) notation. Secrets (client secrets, signing keys, connection strings) must come from the
env file or a secret store, never from a committed file or the image.

### Environment variables consumed by Compose itself

| Variable | Default | Purpose |
| --- | --- | --- |
| `FABRIK3D_ENV_FILE` | `env/onprem.env.example` | env file passed to the orchestrator |
| `FABRIK3D_PROFILE` | `OnPrem` | `Deployment__Profile` value |
| `ORCHESTRATOR_IMAGE` / `SIMULATOR_IMAGE` / `HMI_IMAGE` | `fabrik3d/<service>:1.0.0` | image tags (used for upgrades/rollback) |
| `ORCHESTRATOR_PORT` / `SIMULATOR_PORT` / `HMI_PORT` | `8080` / `8081` / `8082` | published host ports |
| `MONGO_CONNECTION_STRING` / `MONGO_DATABASE_NAME` | `mongodb://mongo:27017` / `Fabrik3D` | persistence target |

### Secret handling and rotation

- Keep secrets in the env file (mode `0600`) or in Docker secrets; never bake them into an image
  and never commit them.
- Mount the env file as a secret where the platform supports it; the templates contain no values.
- Rotate OIDC client secrets and any connector credentials by editing the env file and recreating
  the orchestrator container (`docker compose up -d --force-recreate orchestrator`). The support
  bundle and recent-log buffer always redact secret-bearing keys and credential-shaped values, so
  rotation does not leak into diagnostics.

## First start and validation

```bash
# 1. Validate the rendered configuration without starting anything
docker compose -f Fabrik3D/compose.production.yaml config --quiet
node scripts/lifecycle/verify-config.mjs

# 2. Start the stack
FABRIK3D_ENV_FILE=/etc/fabrik3d/onprem.env \
  docker compose -f Fabrik3D/compose.production.yaml up -d --build

# 3. Confirm readiness (the container healthcheck uses the same endpoint)
curl -fsS http://127.0.0.1:8080/api/health/ready
curl -fsS http://127.0.0.1:8080/api/version
```

`verify-config.mjs` fails if a service is missing a healthcheck, if a dependency is not gated on
`service_healthy`, if the orchestrator is not running a production-like profile, if CORS contains a
wildcard, or if a committed env template contains an inline secret.

## Fail-fast configuration

The server validates configuration at startup and refuses to start on any of the following, printing
every problem at once:

- missing `MongoDb:ConnectionString` or `MongoDb:DatabaseName`;
- non-positive orchestration timings;
- a wildcard `Cors:AllowedOrigins`;
- Swagger enabled for a production-like profile without `Deployment:AllowSwaggerInProduction=true`;
- `Authentication:Mode=None` in a production-like profile;
- a non-positive historian retention value when the historian is enabled;
- an unknown `Deployment:Profile`;
- a malformed or unsafe response-header policy (empty frame/referrer/permissions value, malformed or
  below-minimum HSTS `max-age`, or a CSP that would break the REST/SignalR `connect-src` surfaces);
- `SecurityHeaders:ExternalTls=true` without an explicit HSTS value and Content-Security-Policy.

Independent of the deployment validator, `AuthenticationStartupGuard` refuses
`Mode=Development/Test/None`, a missing OIDC authority, `RequireHttpsMetadata=false`, or a
development signing key in a production-like profile.

Example:

```text
Unhandled exception. System.InvalidOperationException: Invalid deployment configuration:
 - Cors:AllowedOrigins must not contain the wildcard '*'.
```

## Networking and TLS

- Terminate TLS at your ingress/reverse proxy and forward to the orchestrator, simulator and HMI
  ports. The forwarded-headers middleware is enabled; clear the `KnownProxies` allow-list only when
  you control the proxy.
- Configure `Cors:AllowedOrigins` with the exact HTTPS origins of the simulator and HMI. Wildcards
  are rejected.
- Do not expose the MongoDB port. It is intentionally unpublished.

### Response hardening at the proxy (S57)

The application sends the OWASP-aligned headers it can guarantee itself
(`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`,
cross-origin policies). TLS termination and the headers that depend on public TLS are the operator's
responsibility, and S57 makes that explicit:

- Terminate TLS at the proxy and set HSTS there, for example
  `Strict-Transport-Security: max-age=31536000; includeSubDomains`.
- To make a missing HSTS/CSP a **startup error** instead of a silent gap, set
  `SecurityHeaders:ExternalTls=true` together with:
  - `SecurityHeaders:StrictTransportSecurity=max-age=31536000; includeSubDomains`
  - `SecurityHeaders:ContentSecurityPolicy=` the reviewed policy
    (`SecurityHeaderPolicy.RecommendedContentSecurityPolicy`), which keeps `connect-src 'self' ws: wss:`
    so the SignalR hub and the WebGL simulator keep working. Add your front-end origin to `connect-src`
    only when the HMI/simulator are served from a different origin.
- Migration guidance for existing deployments: the defaults are unchanged, so leaving `ExternalTls`
  unset is backward compatible. Enable it together with the two values above in one configuration
  change and restart; the host validates them before serving traffic. A deliberately misconfigured CSP
  (for example a `connect-src` without `ws:`/`wss:` or `'self'`) is refused rather than shipped.

### Hetzner behind Cloudflare Tunnel

The `compose.hetzner.yaml` overlay binds all three diagnostic host ports to `127.0.0.1`; the
Cloudflare Tunnel connector instead reaches `simulator:80` and `hmi:80` on the
`fabrik3d-internal` Docker network. Keep the tunnel token in a server-side, access-controlled file
outside the checkout. Do not publish the orchestrator or MongoDB directly to the internet.

The overlay does not provide authentication. Before switching the hosted stack to the current
release, configure a real HTTPS OIDC authority and complete the frontend sign-in flow; the
production startup guard deliberately rejects an empty authority. Validate the merged Compose
configuration with `docker compose -f compose.production.yaml -f compose.hetzner.yaml config --quiet`
from `Fabrik3D/`, then take a verified database backup before replacing the running containers.

## Endpoints

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `GET /api/health` | anonymous | backward-compatible summary (`HealthDto`) |
| `GET /api/health/live` | anonymous | liveness (`HealthReportDto`) |
| `GET /api/health/ready` | anonymous | readiness; `503` when a dependency is unhealthy |
| `GET /api/version` | anonymous | product/build version (`VersionDto`) |
| `GET /api/support/bundle` | administrator | read-only redacted diagnostics (404 when disabled) |
| `/swagger` | none unless enabled | disabled in production-like profiles by default |

Health and version payloads never include connection strings, credentials or configuration values.

## The public demo deployment

The public demo runs the same images with the `Demo` profile
(`appsettings.Demo.json` / `Fabrik3D/env/demo.env.example`):

- the clearly-labelled read-only `PublicDemo` identity is enabled;
- the support bundle is disabled;
- the historian is disabled and all connectors stay disabled.

It is documented here so an operator can see how it differs; do not use the `Demo` profile for
training-centre production data. Changes in S48 are additive and do not change the service names,
ports or volume names the demo relies on.

## Related documents

- [REQUIREMENTS.md](REQUIREMENTS.md) — measured hardware/browser requirements.
- [THREAT_MODEL.md](THREAT_MODEL.md) — surfaces, mitigations and residual risk.
- [SECURITY_HARDENING.md](SECURITY_HARDENING.md) — controls and executed evidence.
- [REPOSITORY_POLICY.md](REPOSITORY_POLICY.md) — binary/repository lifecycle policy.
- [ADMINISTRATOR_GUIDE.md](ADMINISTRATOR_GUIDE.md) — users, backup, upgrade and monitoring.
- [BACKUP_RESTORE.md](BACKUP_RESTORE.md) — backup and restore procedures.
- [UPGRADE_ROLLBACK.md](UPGRADE_ROLLBACK.md) — upgrade and rollback procedures.
- [SUPPORT_BUNDLE.md](SUPPORT_BUNDLE.md) — diagnostics collection and redaction.
- [VALIDATION.md](VALIDATION.md) — recorded S48 validation evidence.
