# Hardware and software requirements

These figures are derived from measurements taken on the S48 reference workstation, not from
vendor estimates. Measurements are recorded in [VALIDATION.md](VALIDATION.md). Re-measure on your
own hardware before committing to a specification.

## Reference host used for measurements

| Item | Value |
| --- | --- |
| CPU | 13th Gen Intel Core i7-13620H (10 cores / 16 logical) |
| RAM | 63.7 GB |
| OS | Windows 11 Home, Docker Desktop (Linux containers) |
| Container engine | Docker Engine with Compose v2 |

## Measured resource usage

Idle stack (four containers healthy, simulated cell idle, historian and all industrial connectors
disabled), `docker stats --no-stream`:

| Container | Memory (idle) | CPU (idle) | Compose limit |
| --- | --- | --- | --- |
| `orchestrator` | 68.1 MiB | 0.46 % | 2 CPU / 2 GiB |
| `simulator` (Nginx) | 12.4 MiB | 0.00 % | 1 CPU / 512 MiB |
| `hmi` (Nginx) | 12.4 MiB | 0.00 % | 1 CPU / 512 MiB |
| `mongo` | 205.3 MiB | 0.46 % | (host default) |
| **Total idle** | **≈ 298 MiB** | **< 1 %** | — |

Container image sizes measured on the same host:

| Image | Size |
| --- | --- |
| `fabrik3d/orchestrator:1.0.0` | 361 MB |
| `fabrik3d/simulator:1.0.0` | 76.6 MB |
| `fabrik3d/hmi:1.0.0` | 75.1 MB |
| `mongo:8.0` | 1.27 GB |

These figures cover an idle simulated cell with connectors and the historian disabled. Enabling the
historian, ingesting high-rate telemetry, or running multiple concurrent 3D browser sessions
increases CPU, memory and disk use; the values above are a floor, not a ceiling.

## Recommended server sizing

Derived conservatively from the measurements above, plus headroom for the .NET runtime, MongoDB
working set and the browser-facing workloads served by the client machines:

| Deployment | CPU | RAM | Disk |
| --- | --- | --- | --- |
| Minimum (pilot / single cell, few concurrent browsers) | 2 cores | 4 GB | 20 GB SSD |
| Recommended (training centre, several browsers) | 4 cores | 8 GB | 60 GB SSD |
| Comfortable headroom | 8 cores | 16 GB | 120 GB SSD |

Allocate additional disk for MongoDB data and backups according to your historian retention policy
(see [ADMINISTRATOR_GUIDE.md](ADMINISTRATOR_GUIDE.md)). Backups are stored outside the volume and
should be sized to the database plus growth.

## GPU

A server-side GPU is **not required** and is not used by the containers. All 3D rendering happens in
the operator/student browser through WebGL 2. Optional server-side acceleration would only help
offscreen rendering workloads, which are out of scope for this deployment.

## Browser requirements (client machines)

- A current Chromium, Edge, Chrome or Firefox release with **WebGL 2** support and hardware
  acceleration enabled.
- WebSocket support (SignalR live telemetry and control authority).
- A minimum practical viewport of 1280×800; operator touch panels are supported at that size.
- The automated visual and end-to-end suites run against Chromium via Playwright.

## Network requirements

| Direction | Port | Notes |
| --- | --- | --- |
| Browser → orchestrator | TCP 8080 (configurable) | REST + SignalR; terminate TLS in front |
| Browser → simulator | TCP 8081 (configurable) | static simulator app |
| Browser → HMI | TCP 8082 (configurable) | static HMI app |
| orchestrator → MongoDB | TCP 27017 | internal Compose network only |
| orchestrator → OIDC provider | TCP 443 | identity provider metadata and tokens |
| orchestrator → PLC/broker | per protocol | only when the matching connector is explicitly enabled |

MongoDB is not published by the shipped Compose file. Industrial connectors are disabled by default;
enable only the protocol you need and only after reading the connector documentation.

## Software prerequisites

- Docker Engine 24+ with Compose v2 (Linux) or Docker Desktop (Windows/macOS) for the container
  stack.
- For local development outside containers: .NET SDK 8.x, Node.js 20.19+ or 22.12+, and a MongoDB
  7.x/8.x server. See [SETUP.md](../development/SETUP.md).

## See also

- [DEPLOYMENT.md](DEPLOYMENT.md) — install and configure the stack.
- [ADMINISTRATOR_GUIDE.md](ADMINISTRATOR_GUIDE.md) — monitoring and retention.
- [VALIDATION.md](VALIDATION.md) — the measurements and commands behind these numbers.
