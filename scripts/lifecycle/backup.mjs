// Fabrik3D backup script (S48).
//
// Creates a compressed MongoDB archive of the Fabrik3D database from the running compose stack,
// verifies it with `mongorestore --dryRun` inside the container, copies it to the host, records a
// SHA-256 checksum and writes a manifest.
//
// Usage:
//   node scripts/lifecycle/backup.mjs [--compose Fabrik3D/compose.production.yaml]
//                                     [--out ./backups] [--database Fabrik3D] [--service mongo]

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {
  ensureDirectory,
  parseArgs,
  repoRoot,
  resolveMongoContainer,
  run,
  timestamp,
} from './lib.mjs'

const args = parseArgs(process.argv.slice(2))
const composeFile = args.compose ?? 'Fabrik3D/compose.production.yaml'
const projectName = args['project-name']
const service = args.service ?? 'mongo'
const database = args.database ?? 'Fabrik3D'
const outDirectory = ensureDirectory(path.resolve(repoRoot, args.out ?? 'backups'))

const containerArchive = '/tmp/fabrik3d-backup.archive.gz'
const fileName = `fabrik3d-${database}-${timestamp()}.archive.gz`
const hostArchive = path.join(outDirectory, fileName)

function main() {
  const container = resolveMongoContainer({ composeFile, projectName, service })
  console.log(`[backup] container=${container} database=${database}`)

  run('docker', [
    'exec', container, 'sh', '-c',
    `rm -f ${containerArchive} && mongodump --archive=${containerArchive} --gzip --db ${database} --quiet`,
  ])

  // Verification never writes: --dryRun parses the archive and reports what it would restore.
  run('docker', [
    'exec', container, 'sh', '-c',
    `mongorestore --archive=${containerArchive} --gzip --dryRun --quiet --nsInclude '${database}.*'`,
  ])
  console.log('[backup] archive verified with mongorestore --dryRun')

  run('docker', ['cp', `${container}:${containerArchive}`, hostArchive])
  run('docker', ['exec', container, 'sh', '-c', `rm -f ${containerArchive}`])

  const bytes = fs.statSync(hostArchive).size
  if (bytes <= 0) {
    throw new Error('Backup archive is empty.')
  }

  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(hostArchive)).digest('hex')
  const manifest = {
    schemaVersion: '1.0',
    createdAtUtc: new Date().toISOString(),
    database,
    file: fileName,
    bytes,
    sha256,
  }
  const manifestPath = `${hostArchive}.manifest.json`
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

  console.log(`[backup] wrote ${hostArchive} (${bytes} bytes)`)
  console.log(`[backup] sha256=${sha256}`)
  console.log(`[backup] manifest=${manifestPath}`)
}

try {
  main()
} catch (error) {
  console.error(`[backup] FAILED: ${error.message}`)
  if (error.stderr) console.error(String(error.stderr))
  process.exit(1)
}
