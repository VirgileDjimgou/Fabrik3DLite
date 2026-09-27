# Data and privacy

Status: 1.0 baseline. This document describes what Fabrik3D stores, where, for how long, and how it is
scoped. It is a technical description, not legal advice; deployments that process real learner data
must confirm compliance with their own jurisdiction's rules.

## What is stored

| Data | Collection / store | Contents | Scope |
| --- | --- | --- | --- |
| Jobs and tasks | MongoDB `jobs` / `tasks` | Work orders, pallet slots, state, progress | Organization |
| Simulation sessions | MongoDB `simulationSessions` | Simulator claim, heartbeat, machine state, scenario progress | Organization |
| Machine state | MongoDB `machineState` | Current simulated machine snapshot | Organization |
| Alarms and messages | MongoDB `alarms` / `messages` | Simulated alarm lifecycle and operator messages | Organization |
| Cell templates | MongoDB `cellTemplates` | Named authored cells | Organization |
| Control authority | MongoDB `controlAuthorities` / `controlAuthorityEvents` | Owner, lease, immutable audit | Organization |
| Historian | MongoDB `telemetrySamples` / `historizedEvents` | Sampled telemetry and events with source, quality, timestamp, correlation id | Organization |
| Training sessions | MongoDB `trainingSessions` | Typed expected/observed actions, faults, hints, safety violations, recovery, computed assessment and audited corrections | Organization + learner subject |
| Schema migrations | MongoDB `schemaMigrations` | Applied migration ids and timestamps | Deployment |
| Organizations | MongoDB `organizations`, `memberships`, `classes`, `resources` | Tenancy, roles, cohorts and assignments | Deployment |
| Client local state | Browser `localStorage` | Selected simulator locale and similar UI preferences; auth session | Browser |

All of the above describes **simulated** training and demonstrator data. No physical-machine data is
ingested by default; connectors are disabled.

## Personal data

- The only identity data Fabrik3D stores is what the configured OIDC provider asserts (typically a
  subject identifier) plus an optional learner alias used in reports. The **alias** is a display
  label, not a legal identity.
- Passwords, tokens and secrets are never stored in the database by Fabrik3D. Tokens are validated
  and discarded; secrets live in environment/secret storage and are redacted from support bundles.
- Audit records carry the authenticated subject and organization to make actions attributable.

## Tenancy and access

- Every tenant-scoped query (jobs, tasks, sessions, alarms, messages, cell templates, historian,
  classes, resources, training) filters by the **server-resolved** organization. A client-supplied
  organization header is validated against an active membership and never trusted directly.
- Cross-organization access is rejected without leaking existence (`404`/`403`).
- Pre-S43 documents migrate deterministically to the default organization through an idempotent,
  tested migration with legacy compatibility readers.

## Retention

- The historian is bounded by documented age/count retention policies with a background pruner; see
  [TELEMETRY_HISTORIAN.md](../architecture/TELEMETRY_HISTORIAN.md) and
  [ADMINISTRATOR_GUIDE.md](ADMINISTRATOR_GUIDE.md) for the configuration keys.
- Other collections persist until an administrator deletes them. `backup.mjs`/`restore.mjs` and the
  documented disaster-recovery procedure are the supported ways to move or archive data; see
  [BACKUP_RESTORE.md](BACKUP_RESTORE.md).
- The public demo is a shared environment and may be reset without notice; it is not a store of
  record.

## Export and deletion

- Training reports can be exported by the learner/instructor as JSON or HTML from the report surface
  and read through the training API.
- Administrators can delete organizations, memberships, classes, resources, cell templates and jobs
  through the API. Deleting a job cascades to its tasks; authorization and audit apply.
- There is no automatic "erase every trace" endpoint; a deployment that must honour an erasure
  request should operate on the relevant documents with the supported APIs and record the action.

## Confidentiality boundary

- Fabrik3D is an educational/training platform. Do not use it to store regulated personal data beyond
  the subject identifier and display alias it needs.
- The public demo is not suitable for confidential data.

## Related documents

- [Organizations and tenancy](../architecture/ORGANIZATIONS_AND_TENANCY.md)
- [Training sessions](../architecture/TRAINING_SESSIONS.md)
- [Telemetry historian](../architecture/TELEMETRY_HISTORIAN.md)
- [Security model](SECURITY_MODEL.md)
- [Backup and restore](BACKUP_RESTORE.md)
- [Administrator guide](ADMINISTRATOR_GUIDE.md)
