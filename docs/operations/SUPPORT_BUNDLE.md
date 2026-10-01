# Support bundle and diagnostics

When a deployment misbehaves, an administrator can collect a single read-only diagnostic snapshot
instead of copying configuration files by hand. The support bundle is designed to be safe to attach
to a support ticket: it never contains credentials, tokens, connection strings, personal data or
unrelated process environment variables.

## Collect a bundle

The endpoint is administrator-only and enabled by default:

```bash
# Obtain an administrator token from your OIDC provider, then:
curl -fsS -H "Authorization: Bearer <admin-token>" \
  http://127.0.0.1:8080/api/support/bundle \
  -o fabrik3d-support-bundle.json
```

- Anonymous or non-administrator callers receive `401`/`403`; the endpoint is never a control path.
- When `Deployment:SupportBundleEnabled=false` (the `Demo` profile), it returns `404` with a
  structured error.
- The endpoint only reads; it never writes to the database or to any connector.

## Bundle contents

```json
{
  "schemaVersion": "1.0",
  "generatedAtUtc": "...",
  "version": { "version": "...", "profile": "...", "environment": "...", "buildId": "..." },
  "health": { "status": "...", "checks": [ ... ] },
  "configuration": { "Deployment:Profile": "OnPrem", "Authentication:SigningKey": "[REDACTED]" },
  "connectors": [ { "protocol": "opcua", "enabled": false, "state": "...", "lastError": null } ],
  "migrations": [ { "version": "0001", "name": "baseline-core-indexes", "appliedAtUtc": "..." } ],
  "recentLogs": [ "2026-... [Information] ...: ..." ],
  "redactedKeys": [ "Authentication:SigningKey" ]
}
```

| Field | Source | Safety |
| --- | --- | --- |
| `version` | resolved build/version info | non-sensitive |
| `health` | readiness report | non-sensitive; no configuration values |
| `configuration` | owned application sections only | secrets redacted; unrelated environment variables excluded |
| `connectors` | protocol adapters | enabled flag, state and last error only — no endpoints or credentials |
| `migrations` | `schemaMigrations` collection | version, name, timestamp |
| `recentLogs` | bounded in-memory ring buffer | redacted at capture time |
| `redactedKeys` | configuration keys redacted | proof of what was removed |

## Redaction policy

`SecretRedactor` is applied to every configuration value and every log line **before** it is stored
or returned:

- **Sensitive keys** (case/separator-insensitive) are replaced with `[REDACTED]`: anything containing
  `password`, `passwd`, `pwd`, `passphrase`, `secret`, `signingkey`, `privatekey`, `token`,
  `credential`, `apikey`, `api_key`, `connectionstring`, `bearer`, `authorityconfirmationtoken`,
  `clientsecret`, `accesskey`, `tunneltoken` or `cloudflaretoken`.
- **Secret-shaped values** are redacted even under an innocuous key: credential URIs
  (`scheme://user:pass@host`), JWT-shaped strings, `.env`/config-style sensitive assignments
  (`TUNNEL_TOKEN=…`, `PASSWORD=…`) and private-key material with any PEM header
  (RSA/EC/DSA/OPENSSH/PKCS#8).
- **Log messages** have embedded credential URIs, sensitive assignments and complete PEM private-key
  blocks masked in place.

Additionally, the bundle only includes the owned configuration sections (`Deployment`, `MongoDb`,
`Orchestration`, `Authentication`, `Cors`, `Tenancy`, `Training`, `SecurityHeaders`, `OpcUa`, `Mqtt`,
`Modbus`, `Historian`, `Logging`). ASP.NET Core merges the whole process environment into
configuration; without this allow-list the bundle could expose host paths and user names. The scope
is enforced and unit-tested (`SupportBundleBuilderTests`).

The recent-log buffer keeps at most 200 entries and redacts each message at capture time, so a secret
accidentally logged elsewhere cannot reach the bundle.

## Health and version endpoints

The bundle embeds the same readiness report exposed at `GET /api/health/ready`. For quick checks:

- `GET /api/health/live` — process liveness only;
- `GET /api/health/ready` — MongoDB, historian and connector checks (`503` when unhealthy);
- `GET /api/version` — product/build version used by the HMI and simulator "about" surfaces.

None of these endpoints return configuration values.

## What is deliberately not included

- The raw process environment (host paths, user names, unrelated secrets).
- Connection strings, tokens, keys, certificates or file contents.
- Industrial connector endpoints, credentials or raw payloads (only state summaries).
- Personal data beyond what application log messages already contain, which is redacted for
  secret-shaped values.

## Handling bundles securely

Even with redaction, treat a bundle as sensitive operational data: it contains configuration shape,
server names and recent logs. Transfer it over an approved channel and delete it when the ticket is
resolved. If you believe a secret may have been captured, rotate it and note the concern in the
ticket rather than editing the evidence.
