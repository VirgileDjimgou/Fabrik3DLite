// Fabrik3D restore script (S48).
//
// Restores a previously created MongoDB archive into the running compose stack. The archive is
// verified with `mongorestore --dryRun` before any write; a failed verification aborts without
// touching existing data. The destructive restore requires the explicit `--yes` flag.
//
// Usage:
//   node scripts/lifecycle/restore.mjs --file ./backups/<archive>.gz [--yes]
//                                     [--compose Fabrik3D/compose.production.yaml]
//                                     [--database Fabrik3D] [--service mongo]

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { parseArgs, repoRoot, resolveMongoContainer, run } from './lib.mjs'

const args = parseArgs(process.argv.slice(2))
const composeFile = args.compose ?? 'Fabrik3D/compose.production.yaml'
const projectName = args['project-name']
const service = args.service ?? 'mongo'
const database = args.database ?? 'Fabrik3D'
const apply = args.yes === true

if (!args.file || typeof args.file !== 'string') {
  console.error('[restore] --file <archive> is required.')
  process.exit(1)
}

const hostArchive = path.resolve(repoRoot, args.file)
if (!fs.existsSync(hostArchive)) {
  console.error(`[restore] archive not found: ${hostArchive}`)
  process.exit(1)
}

const containerArchive = '/tmp/fabrik3d-restore.archive.gz'

function main() {
  const container = resolveMongoContainer({ composeFile, projectName, service })
  console.log(`[restore] container=${container} database=${database} file=${hostArchive}`)

  run('docker', ['cp', hostArchive, `${container}:${containerArchive}`])

  // Pre-flight: parse and validate the archive without writing anything.
  run('docker', [
    'exec', container, 'sh', '-c',
    `mongorestore --archive=${containerArchive} --gzip --dryRun --quiet --nsInclude '${database}.*'`,
  ])
  console.log('[restore] pre-flight verification succeeded (no writes performed)')

  if (!apply) {
    console.log('[restore] dry run only. Re-run with --yes to apply the restore.')
    return
  }

  run('docker', [
    'exec', container, 'sh', '-c',
    `mongorestore --archive=${containerArchive} --gzip --quiet --drop --nsInclude '${database}.*'`,
  ])

  const counts = run('docker', [
    'exec', container, 'mongosh', '--quiet', '--eval',
    `JSON.stringify(db.getSiblingDB('${database}').getCollectionNames().map(c => [c, db.getSiblingDB('${database}').getCollection(c).countDocuments()]))`,
  ]).trim()
  console.log(`[restore] collection counts=${counts}`)

  run('docker', ['exec', container, 'sh', '-c', `rm -f ${containerArchive}`])
  console.log('[restore] completed')
}

try {
  main()
} catch (error) {
  console.error(`[restore] FAILED: ${error.message}`)
  if (error.stderr) console.error(String(error.stderr))
  process.exit(1)
}
