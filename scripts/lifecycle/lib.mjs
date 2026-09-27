// Shared helpers for the Fabrik3D on-premise lifecycle scripts (S48).
//
// These scripts intentionally drive the running Docker Compose stack instead of assuming local
// mongodump/mongorestore/mongosh binaries. Every external command is executed through child_process
// and errors surface the real stderr.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

export function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token.startsWith('--')) {
      const key = token.slice(2)
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith('--')) {
        args[key] = next
        i += 1
      } else {
        args[key] = true
      }
    } else {
      args._.push(token)
    }
  }
  return args
}

export function run(command, commandArgs, options = {}) {
  return execFileSync(command, commandArgs, {
    encoding: 'utf8',
    stdio: options.capture === false ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    ...options,
  })
}

export function composeArgs(composeFile, projectName) {
  const args = ['compose', '-f', composeFile]
  if (projectName) args.push('--project-name', projectName)
  return args
}

export function resolveMongoContainer({ composeFile, projectName, service = 'mongo' }) {
  const output = run('docker', [...composeArgs(composeFile, projectName), 'ps', '-q', service]).trim()
  if (!output) {
    throw new Error(
      `No running '${service}' container found for ${composeFile}. Start the stack first: ` +
        `docker compose -f ${composeFile} up -d`,
    )
  }
  return output.split(/\r?\n/)[0]
}

export function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true })
  return directory
}

export function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z')
}
