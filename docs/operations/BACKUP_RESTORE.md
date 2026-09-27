# Backup and restore

Fabrik3D persists all state in MongoDB. The shipped lifecycle scripts drive the running Compose
stack and use `mongodump`/`mongorestore` inside the `mongo` container, so no host MongoDB tooling is
required and no credentials need to be copied to the host.

A backup is verified with `mongorestore --dryRun` before it is trusted. A restore is dry-run first
and only writes when `--yes` is supplied, so a corrupt or mismatched archive never partially
overwrites live data.

The procedure below was exercised end to end in S48; the transcript is recorded in
[VALIDATION.md](VALIDATION.md).

## What is persisted

| Volume | Contents |
| --- | --- |
| `fabrik3d_mongo-data` (mount `/data/db`) | the entire `Fabrik3D` database: jobs, tasks, sessions, alarms, operator messages, cell templates, training and tenancy data, historian samples/events, `schemaMigrations`, and any enabled connector state that is persisted. |

The orchestrator, simulator and HMI containers are stateless. Changing image tags never removes
data; only `docker compose down -v` or removing the named volume destroys it.

## Backup

```bash
# From the repository root, with the stack running
node scripts/lifecycle/backup.mjs \
  --compose Fabrik3D/compose.production.yaml \
  --out /srv/fabrik3d/backups
```

Optional flags: `--database <name>` (default `Fabrik3D`), `--service mongo`, `--project-name <name>`.

What the script does:

1. Resolves the running `mongo` container through Compose.
2. Runs `mongodump --archive --gzip --db <database>` inside the container.
3. Verifies the archive with `mongorestore --archive --gzip --dryRun --nsInclude '<database>.*'`
   (read-only; it never writes).
4. Copies the archive to the host, deletes the in-container temporary file, and checks the size is
   non-zero.
5. Writes a `sha256` checksum and a JSON manifest next to the archive.

Example output:

```text
[backup] container=... database=Fabrik3D
[backup] archive verified with mongorestore --dryRun
[backup] wrote /srv/fabrik3d/backups/fabrik3d-Fabrik3D-20260926T205557Z.archive.gz (495 bytes)
[backup] sha256=8a7f337a...
[backup] manifest=/srv/fabrik3d/backups/fabrik3d-Fabrik3D-20260926T205557Z.archive.gz.manifest.json
```

A failed dump, a failed verification or an empty archive exits non-zero; nothing downstream should
treat a partial archive as a backup.

### Off-site and air-gapped copies

Store the `.archive.gz` and its `.manifest.json` together, outside the host. For air-gapped sites,
transfer them on approved media and record the SHA-256 from the manifest so the copy can be
integrity-checked before restore.

### Scheduling

Run backups from the host scheduler (cron/Task Scheduler) while the stack is running. A MongoDB dump
is consistent for a single-database deployment; schedule it outside peak training hours. Retention
of backup files is an operator decision and is not managed by the script.

## Restore

Restore is destructive: it replaces the collections it restores with `--drop`.

```bash
# 1. Inspect the archive without writing anything
node scripts/lifecycle/restore.mjs \
  --compose Fabrik3D/compose.production.yaml \
  --file /srv/fabrik3d/backups/fabrik3d-Fabrik3D-20260926T205557Z.archive.gz
# prints "pre-flight verification succeeded (no writes performed)" and "dry run only"

# 2. Apply the restore
node scripts/lifecycle/restore.mjs \
  --compose Fabrik3D/compose.production.yaml \
  --file /srv/fabrik3d/backups/fabrik3d-Fabrik3D-20260926T205557Z.archive.gz \
  --yes
```

The script:

1. Copies the archive into the running `mongo` container.
2. Runs `mongorestore --dryRun`; if verification fails it aborts **without any write**.
3. With `--yes`, runs `mongorestore --drop --nsInclude '<database>.*'`.
4. Prints the per-collection document counts so the result can be verified.

Example restore transcript:

```text
[restore] container=... database=Fabrik3D file=.../fabrik3d-Fabrik3D-20260926T205557Z.archive.gz
[restore] pre-flight verification succeeded (no writes performed)
[restore] collection counts=[["seedMarker",1],["jobs",1]]
[restore] completed
```

### Disaster recovery (volume lost)

If the named volume is gone, recreate the stack first, then restore:

```bash
docker compose -f Fabrik3D/compose.production.yaml up -d mongo
# wait until the mongo container is healthy, then run the restore above
```

Restoring into a fresh volume also exercises the schema migration runner on the next orchestrator
start, which is idempotent and additive.

## Verifying a backup

`mongorestore --dryRun` proves the archive is structurally readable. It does not prove the data is
semantically current. In addition to the dry run:

- keep the manifest and compare the SHA-256 before restore;
- after any real restore, check the per-collection counts the script prints against expectations;
- perform a periodic test restore into a throwaway project/volume (for example a scratch
  `--project-name`) rather than against production.

## Failure and containment

- **Backup failure:** non-zero exit; the partial archive must not be used. Check disk space and that
  the `mongo` container is healthy, then retry.
- **Restore verification failure:** the script exits before writing; existing data is untouched.
- **Restore interrupted:** re-run with `--yes`; `--drop` makes the restore idempotent and no partial
  overwrite is left ambiguous.
- **Secrets:** archives contain application data but no host secrets. Keep them access-controlled
  regardless, because they contain training/assessment data.
