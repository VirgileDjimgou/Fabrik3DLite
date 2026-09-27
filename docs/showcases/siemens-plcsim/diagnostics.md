# Connection diagnostics

The Siemens profile adds no custom diagnostics surface. It reuses the S33 OPC UA connector health,
the S36 authority status and the S37 mapping-studio live monitor. This page explains what to look at
and what each reading means.

## Connector health

```powershell
# Read-only; never performs a protocol write.
Invoke-RestMethod -Uri http://127.0.0.1:7249/api/connectors/opcua | ConvertTo-Json -Depth 4
```

`ConnectorStatusDto` fields:

| Field | Meaning for the Siemens profile |
| --- | --- |
| `state` | `Disabled` (default), `Connecting`, `Connected`, `Degraded` (was connected, retrying), `Error` (never connected or fatal config). |
| `lastError` | The last connection/validation error, for example a certificate trust failure or an invalid endpoint. |
| `reconnectCount` | Bounded-backoff reconnect attempts; a steadily rising value means the PLC is unreachable. |
| `monitoredItemCount` | Number of DB tags actually subscribed. **If it is lower than the 14 mapped tags, one or more node ids do not exist on the server** (wrong tag / not OPC UA-accessible). |
| `notificationsReceived` | OPC UA subscription notifications seen. |
| `updatesAccepted` / `updatesRejected` | Values accepted / rejected by the signal mirror (rejections carry the canonical arbitration reason, for example `stale-timestamp`). |
| `writeAttempts` / `writesAccepted` / `writesRejected` | Fabrik3D → PLC writes and their outcome. |

Healthy readings: `state = Connected`, `monitoredItemCount = 14`, `lastError = null`, and
`writesRejected = 0` during normal operation.

## Node / tag validation

- **Before the connector starts:** the S37 mapping validator rejects a missing `nodeId`, an unknown
  internal signal, a `write` direction on a read-only signal, ambiguous scaling and duplicate write
  targets. Import [`io-map.json`](./io-map.json) in the engineering mapping studio to see the same
  diagnostics with click-through to the offending row.
- **At connect time:** each mapped node id is validated by the OPC UA stack. Unparseable or missing
  nodes are logged and skipped; the connector keeps working for the valid tags and reports the lower
  `monitoredItemCount`. The automated negative test in [`evidence.md`](./evidence.md) proves a wrong
  tag yields `13/14` monitored items without a crash.
- **At write time:** the connector fails closed with a structured reason: `connector-disabled`,
  `writes-disabled`, `unknown-signal`, `not-writable-signal`, `not-allow-listed`, `not-connected`,
  `invalid-node-id`, `write-rejected:*`, `write-failed:*`.

## Signal quality and freshness

- Quality is `good`, `stale`, `bad`, `uncertain` or `invalid` and is never upgraded silently.
- A `Bad`/`Uncertain` OPC UA status preserves the **last known value** and stores the degraded
  quality; it is never surfaced as `good`.
- `stale` is derived at read time from the sample timestamp and the configured
  `StaleAfterMilliseconds`; the stored sample is not mutated.

## Authority diagnostics

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:7249/api/control-authority/{scope} | ConvertTo-Json -Depth 4
```

- `state`: `held` while the PLC owns the scope, `degraded` after controller loss, `available` after
  release.
- The audit trail carries `authority_acquired`, `authority_degraded`, `authority_released` (and
  takeover) events with the owner and correlation id.

## Common readings and their cause

| Symptom | Likely cause | Action |
| --- | --- | --- |
| `state = Disabled` | `OpcUa.Enabled = false` (the default). | Enable the connector explicitly for the profile and restart; a mapping apply never enables it. |
| `state = Error`, `lastError` mentions certificate/trust | `Basic256Sha256` endpoint but the PLC certificate is not in the Fabrik3D trust store. | Export/trust the PLC application certificate, or use `AutoAcceptUntrustedCertificates` **only** in an isolated development setup. |
| `state = Error`, `lastError` mentions endpoint | `opc.tcp://` endpoint wrong, or the CPU OPC UA server disabled. | Verify the endpoint and enable the OPC UA server in TIA Portal. |
| `state = Degraded`, `reconnectCount` rising | PLC powered off, CPU in STOP, or network loss. | Restore the PLC; the connector reconnects with bounded backoff. Authority stays `degraded` until an explicit operator action. |
| `monitoredItemCount < 14` | A DB tag is missing, misspelled, or not OPC UA-accessible (optimized block / no access). | Re-export the DB tags and re-import the mapping. |
| Writes rejected `not-allow-listed` | `AllowWrites` on but the tag is not in `WriteAllowList`. | Add exactly the nine output node ids; do not broaden the list. |
| `updatesRejected` rising | Observed echo of a value Fabrik3D just wrote is older than the local commanded write. | Expected; the commanded value stays authoritative. |
