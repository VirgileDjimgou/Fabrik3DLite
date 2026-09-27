# Upgrade and rollback

This procedure upgrades an on-premise Fabrik3D deployment between image versions and documents how
to roll back. The design rationale is in
[ADR 0006](../adr/0006-on-premise-deployment-and-migration.md).

## Principles

- **Versioned images.** Every service runs a pinned tag (`fabrik3d/orchestrator:1.0.0`, etc.). Never
  deploy `latest` in production.
- **Idempotent migrations.** Schema migrations are versioned, additive and run once per database;
  restarting the orchestrator on an up-to-date database applies nothing. `0001` only ensures core
  indexes exist and never mutates documents.
- **Compatibility readers.** Existing documents keep working after a migration; new readers are
  additive. There is no destructive automatic down-migration.
- **Rollback is image-first.** Because migrations are additive, rolling back to the previous image
  tag is safe against the migrated data unless a release notes states otherwise.
- **Back up before every upgrade.** See [BACKUP_RESTORE.md](BACKUP_RESTORE.md). An upgrade without a
  recent verified backup is unsupported.

## Current migration inventory

| Version | Name | Effect | Reversible by |
| --- | --- | --- | --- |
| `0001` | `baseline-core-indexes` | creates the documented core indexes if missing | previous image keeps reading the same data; indexes are additive |

Applied migrations are recorded in the `schemaMigrations` collection (`_id` = version, with name,
`AppliedAtUtc` and duration). The orchestrator logs a single
`[Server][Migrations] Schema migrations complete applied=<n> total=<n> alreadyUpToDate=<bool>` line at
startup.

## Upgrade procedure

```bash
# 0. Take and verify a backup first
node scripts/lifecycle/backup.mjs --out /srv/fabrik3d/backups

# 1. Pull the new images (or load them from an offline bundle)
export ORCHESTRATOR_IMAGE=fabrik3d/orchestrator:1.0.1
export SIMULATOR_IMAGE=fabrik3d/simulator:1.0.1
export HMI_IMAGE=fabrik3d/hmi:1.0.1

# 2. Recreate the stack with the new tags
docker compose -f Fabrik3D/compose.production.yaml up -d --no-deps --build orchestrator
docker compose -f Fabrik3D/compose.production.yaml up -d mongo orchestrator simulator hmi

# 3. Confirm readiness and the new version
curl -fsS http://127.0.0.1:8080/api/health/ready
curl -fsS http://127.0.0.1:8080/api/version
```

Notes:

- Keep the `mongo` service running across the upgrade so the migration runner sees the existing
  database. The runner may hold a short index-build window on first start; on an up-to-date database
  it applies nothing.
- The orchestrator's `depends_on: mongo (service_healthy)` guarantees the database is ready before
  migrations run.
- Downtime is the orchestrator restart plus any migration time. For the shipped baseline migration
  on a modest dataset this is sub-second after the container is up; index creation on very large
  collections can take longer. Measure on your data.

### Air-gapped upgrade

Export images on a connected host, transfer the bundle, load it on the target, then run the same
`up -d` with the new tags:

```bash
docker save fabrik3d/orchestrator:1.0.1 fabrik3d/simulator:1.0.1 fabrik3d/hmi:1.0.1 -o fabrik3d-1.0.1.tar
docker load -i fabrik3d-1.0.1.tar
```

## Verify the migration

```bash
docker exec <mongo-container> mongosh --quiet --eval \
  "printjson(db.getSiblingDB('Fabrik3D').schemaMigrations.find().toArray())"
docker logs <orchestrator-container> | grep Migrations
```

The recorded `AppliedAtUtc` for an existing version must not change on restart, and the log must
report `alreadyUpToDate=True`. S48 verified exactly this on the running stack
([VALIDATION.md](VALIDATION.md)).

## Rollback procedure

```bash
# 1. Set the previous image tags
export ORCHESTRATOR_IMAGE=fabrik3d/orchestrator:1.0.0
export SIMULATOR_IMAGE=fabrik3d/simulator:1.0.0
export HMI_IMAGE=fabrik3d/hmi:1.0.0

# 2. Recreate the affected services
docker compose -f Fabrik3D/compose.production.yaml up -d mongo orchestrator simulator hmi

# 3. Confirm readiness on the previous version
curl -fsS http://127.0.0.1:8080/api/health/ready
curl -fsS http://127.0.0.1:8080/api/version
```

### Data compatibility statement

- The shipped migrations are additive (index and bookkeeping changes only); the previous image reads
  the same collections and documents unchanged. No data rollback is required.
- If a future release introduces a migration that changes document shape, that release notes must
  state the compatibility and any documented down-steps. Never assume a down-migration exists.
- The `schemaMigrations` collection is ignored by pre-S48 readers, so older images tolerate its
  presence.
- If an upgrade fails before migrations commit, simply restart the previous image; the runner is
  resumable and idempotent.

## Failure and containment

- **Migration failure:** the hosted service logs a warning and the host stays up; readiness reports
  the degraded dependency. Fix the root cause (for example a MongoDB permissions problem) and
  restart the orchestrator — the runner resumes from the last recorded version.
- **Upgrade failure:** roll back the images as above. If a migration already committed and the
  release notes require data action, restore the pre-upgrade backup.
- **Restore dependency:** never complete an upgrade without a verified backup. If the upgrade is
  abandoned, the backup remains the recovery point.
