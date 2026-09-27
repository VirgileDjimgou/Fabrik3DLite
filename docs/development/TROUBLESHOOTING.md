# Troubleshooting

## Simulator build parses TypeScript inside `three.module.js`

This indicates a corrupted local dependency installation. Application code must never be appended to files under `node_modules`.

Restore from the lockfile:

```powershell
npm --prefix Fabrik3D/fabrik3d.client ci
npm run build:simulator
```

If corruption returns, inspect editor extensions, code-generation commands, and scripts that write files. Do not patch the third-party module as a permanent fix.

## SignalR negotiates against the wrong port

Both clients use relative `/api` and `/hubs` URLs by default. Vite resolves the backend target from environment variables and the backend `launchSettings.json`.

For deterministic local development, create `.env.local` from `.env.example` and set:

```text
VITE_ORCHESTRATOR_URL=https://localhost:7249
```

Use the URL of the launch profile that is actually running. Confirm the backend health endpoint before debugging SignalR.

## HTTPS certificate errors

Trust the .NET development certificate:

```powershell
dotnet dev-certs https --clean
dotnet dev-certs https --trust
```

Restart browsers and development servers afterward.

## MongoDB is unavailable

Confirm that MongoDB is listening on the configured address and that the database name matches the environment or user-secret configuration. MongoDB creates collections lazily, so an empty database may not appear until the first successful write.

## Simulator says OFFLINE / LOCAL MODE

That is expected when the browser cannot reach the orchestrator: the simulator runs an explicitly
labelled local-only demo and writes nothing to the server. Check that:

- the orchestrator is healthy (`GET /api/health` on the server origin);
- `VITE_ORCHESTRATOR_URL` (or the Vite proxy target) points at the running server, not at the dev
  server itself;
- the hub negotiates at `/hubs/orchestration` (a 401 means authentication is missing or expired —
  re-authenticate rather than disabling auth).

## No job is claimed / job never starts

The simulator only claims a job in `Created`/`Ready` state. Confirm a job exists and is startable in
the HMI, and that no other simulator already owns it (a foreign live owner receives `409`). See the
[orchestration](../architecture/ORCHESTRATION.md) document for the claim and heartbeat rules.

## Connector shows degraded or no values

Connectors are disabled by default and writes are disabled by default. For diagnostics:

- `GET /api/connectors/opcua`, `/mqtt`, `/modbus` report health, counters and last error.
- A write with a clear refusal is fail-closed behaviour: it needs the connector enabled **and**
  `AllowWrites` **and** an exact allow-list match **and** a writable signal/point.
- A retained MQTT value without a fresh, valid timestamp is surfaced only as stale history.
- For OPC UA certificate errors, an untrusted certificate is refused unless you deliberately enable
  the documented development trust escape (never a production default).

See [OPC UA](../architecture/OPC_UA_ADAPTER.md), [MQTT](../architecture/MQTT_SHOWCASE.md) and
[Modbus](../architecture/MODBUS_TCP_ADAPTER.md).

## Replay or time travel looks blocked

Time travel is **read-only** by design: it cannot acquire control authority or emit a protocol write.
Some panels are correctly blocked while replaying. If a scrubber shows a gap, that means history is
missing for that period — it is reported, never fabricated. See
[time travel](../architecture/TIME_TRAVEL.md).

## Learner report says `local` instead of `SERVER-ASSESSED`

The run was offline or unauthenticated, so it was not persisted. Sync failure is explicit and
retryable; the local report remains valid and labelled. Re-run with a valid identity to get a
server-assessed report. See [training sessions](../architecture/TRAINING_SESSIONS.md).

## Access denied / 401 or 403

Authorization is enforced server-side. A `401` means re-authentication is required; a `403` means the
authenticated role lacks the policy for that endpoint or the organization context is not an active
membership. Forged or ambiguous tenant contexts fail closed. See
[identity and RBAC](../architecture/IDENTITY_AND_RBAC.md) and
[organizations and tenancy](../architecture/ORGANIZATIONS_AND_TENANCY.md).

## Deployment refuses to start

Production-like profiles fail fast with every actionable problem listed, for example a wildcard CORS
origin, an unknown `Deployment:Profile`, a missing OIDC authority, or `Authentication:Mode=None`.
Fix the configuration; do not weaken it. See
[deployment](../operations/DEPLOYMENT.md) and [security hardening](../operations/SECURITY_HARDENING.md).

## Where else to look

- [Documentation index](../DOCUMENTATION_INDEX.md)
- [Architecture overview](../architecture/OVERVIEW.md)
- [Limitations and non-claims](../operations/LIMITATIONS.md)
- [Observability](../operations/OBSERVABILITY.md) (logs, metrics, diagnostics endpoints)
