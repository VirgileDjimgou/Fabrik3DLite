#!/usr/bin/env node
/**
 * S57 repository lifecycle policy.
 *
 * Deterministic size/type check that prevents accidental commits of build output, temporary
 * recordings/archives and huge generated binaries, while grandfathering the assets that were
 * already tracked before the policy existed (recorded with provenance in the baseline manifest).
 *
 * It never rewrites history and never deletes assets: a violation is reported so the author can
 * move the file to Git LFS, release packaging or external distribution, or add a narrow documented
 * exception.
 *
 * Usage:
 *   node scripts/repository/repository-policy.mjs --staged       # pre-commit preflight (default)
 *   node scripts/repository/repository-policy.mjs --tracked      # every tracked file vs baseline
 *   node scripts/repository/repository-policy.mjs --changed      # working-tree changes vs HEAD
 *   node scripts/repository/repository-policy.mjs --write-baseline
 *   node scripts/repository/repository-policy.mjs --json
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const BASELINE_RELATIVE_PATH = 'docs/operations/repository-policy-baseline.json'

/** A tracked file above this size is always a violation unless grandfathered. */
export const HARD_MAX_BYTES = 10 * 1024 * 1024

/** A tracked binary above this size must be Git LFS-tracked unless grandfathered. */
export const LFS_THRESHOLD_BYTES = 1 * 1024 * 1024

/** Binary asset/archive extensions subject to the LFS threshold. */
export const BINARY_EXTENSIONS = [
  '.glb', '.gltf', '.fbx', '.obj', '.stl', '.step', '.stp', '.dwg', '.dxf', '.blend',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.ico', '.psd',
  '.mp4', '.mov', '.avi', '.webm', '.mkv', '.mp3', '.wav', '.ogg',
  '.zip', '.rar', '.7z', '.gz', '.tgz', '.pdf', '.bin', '.dll', '.so', '.dylib', '.exe',
  '.wasm', '.ktx2', '.hdr', '.exr', '.woff', '.woff2', '.ttf', '.otf',
]

/** Directory segments that must never be tracked (build output, dependencies, ephemeral reports). */
export const FORBIDDEN_PATH_SEGMENTS = [
  'bin', 'obj', 'node_modules', 'dist', 'coverage', 'playwright-report', 'test-results', '.vite',
]

/** Extensions that must never be tracked (temporary/local artifacts). */
export const FORBIDDEN_EXTENSIONS = ['.tmp', '.bak', '.orig', '.rej', '.rar', '.7z', '.tar', '.tgz']

/** Normalizes a repository-relative path to forward slashes. */
export function normalizePath(path) {
  return String(path).replace(/\\/g, '/').replace(/^\.\//, '')
}

/** True when the path has a binary asset/archive extension. */
export function isBinaryPath(path) {
  const lower = normalizePath(path).toLowerCase()
  return BINARY_EXTENSIONS.some((extension) => lower.endsWith(extension))
}

/** True when the path contains a forbidden build/dependency/ephemeral directory segment. */
export function isForbiddenPath(path) {
  const segments = normalizePath(path).toLowerCase().split('/')
  return segments.some((segment) => FORBIDDEN_PATH_SEGMENTS.includes(segment))
}

/** True when the path has a forbidden temporary/archive extension. */
export function isForbiddenExtension(path) {
  const lower = normalizePath(path).toLowerCase()
  return FORBIDDEN_EXTENSIONS.some((extension) => lower.endsWith(extension))
}

/** Parses `filter=lfs` patterns out of a .gitattributes file body. */
export function parseLfsPatterns(gitattributesText) {
  return String(gitattributesText ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#') && /(^|\s)filter=lfs(\s|$)/.test(line))
    .map((line) => line.split(/\s+/)[0])
    .filter((pattern) => pattern && !pattern.startsWith('!'))
}

function globToRegExp(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  const body = escaped.replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*')
  return new RegExp(`^${body}$`)
}

/** True when a path is covered by any Git LFS pattern. */
export function isLfsTracked(path, lfsPatterns) {
  const normalized = normalizePath(path)
  return (lfsPatterns ?? []).some((pattern) => globToRegExp(pattern).test(normalized))
}

/**
 * Evaluates the repository policy over explicit file records.
 * @param {{ path: string, sizeBytes?: number, lfs?: boolean }[]} records
 * @param {{ baselinePaths?: Iterable<string> }} [options]
 * @returns {{ path: string, reason: string, sizeBytes: number }[]}
 */
export function evaluateRepositoryPolicy(records, options = {}) {
  const baselinePaths = new Set(Array.from(options.baselinePaths ?? [], normalizePath))
  const violations = []

  for (const record of records) {
    const path = normalizePath(record.path)
    const sizeBytes = Number.isFinite(record.sizeBytes) ? record.sizeBytes : 0

    if (isForbiddenPath(path)) {
      violations.push({ path, reason: 'forbidden-build-or-dependency-path', sizeBytes })
      continue
    }
    if (isForbiddenExtension(path)) {
      violations.push({ path, reason: 'forbidden-temporary-or-archive-extension', sizeBytes })
      continue
    }
    // Files already managed by Git LFS are exempt from the size policy: that is exactly what LFS is
    // for. The policy only requires that large new binaries declare an LFS pattern.
    if (record.lfs) continue

    // Pre-existing tracked offenders are grandfathered with recorded provenance. Removing them from
    // history is a separate, explicit HUMAN_REQUIRED migration and never happens automatically.
    if (baselinePaths.has(path)) continue

    if (sizeBytes > HARD_MAX_BYTES) {
      violations.push({ path, reason: 'exceeds-hard-size-limit', sizeBytes })
      continue
    }
    if (isBinaryPath(path) && !record.lfs && sizeBytes > LFS_THRESHOLD_BYTES) {
      violations.push({ path, reason: 'binary-requires-git-lfs', sizeBytes })
    }
  }

  return violations
}

/** Loads the baseline manifest (empty when absent or malformed). */
export function loadBaseline(rootDir = REPO_ROOT) {
  const file = join(rootDir, BASELINE_RELATIVE_PATH)
  if (!existsSync(file)) return []
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    return Array.isArray(parsed?.entries) ? parsed.entries : []
  } catch {
    return []
  }
}

/** Reads a file record from disk, or null when it does not exist. */
function readRecord(rootDir, relativePath, lfsPatterns) {
  const absolute = join(rootDir, relativePath)
  if (!existsSync(absolute)) return null
  const stats = statSync(absolute)
  if (!stats.isFile()) return null
  return {
    path: normalizePath(relativePath),
    sizeBytes: stats.size,
    lfs: isLfsTracked(relativePath, lfsPatterns),
  }
}

function git(rootDir, args) {
  return execFileSync('git', ['-C', rootDir, ...args], { encoding: 'utf8' })
}

/** Resolves the file list for the selected mode and builds evaluated records. */
export function collectRecords(rootDir, mode) {
  const lfsPatterns = existsSync(join(rootDir, '.gitattributes'))
    ? parseLfsPatterns(readFileSync(join(rootDir, '.gitattributes'), 'utf8'))
    : []

  let paths = []
  if (mode === 'staged') {
    paths = git(rootDir, ['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR']).split('\0')
  } else if (mode === 'changed') {
    const tracked = git(rootDir, ['diff', '--name-only', '-z', 'HEAD']).split('\0')
    const untracked = git(rootDir, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0')
    paths = [...tracked, ...untracked]
  } else {
    paths = git(rootDir, ['ls-files', '-z']).split('\0')
  }

  const records = []
  for (const path of paths) {
    if (!path) continue
    const record = readRecord(rootDir, path, lfsPatterns)
    if (record) records.push(record)
  }
  return records
}

/** Regenerates the frozen baseline from every currently tracked offender. */
export function writeBaseline(rootDir = REPO_ROOT) {
  const records = collectRecords(rootDir, 'tracked')
  const entries = evaluateRepositoryPolicy(records, { baselinePaths: [] })
    .map((violation) => ({
      path: violation.path,
      sizeBytes: violation.sizeBytes,
      reason: violation.reason,
    }))
    .sort((a, b) => a.path.localeCompare(b.path))

  const document = {
    schemaVersion: '1.0',
    description:
      'Frozen baseline of repository-policy offenders that were already tracked before S57. ' +
      'They are grandfathered with recorded provenance; removing them from history is a separate, ' +
      'explicit HUMAN_REQUIRED migration and never happens automatically. New files are always checked.',
    entries,
  }
  writeFileSync(join(rootDir, BASELINE_RELATIVE_PATH), `${JSON.stringify(document, null, 2)}\n`, 'utf8')
  return entries
}

function parseArgs(argv) {
  const flags = { mode: 'staged' }
  for (const token of argv) {
    if (token === '--staged') flags.mode = 'staged'
    else if (token === '--tracked') flags.mode = 'tracked'
    else if (token === '--changed') flags.mode = 'changed'
    else if (token === '--write-baseline') flags.writeBaseline = true
    else if (token === '--json') flags.json = true
  }
  return flags
}

function main() {
  const flags = parseArgs(process.argv.slice(2))

  if (flags.writeBaseline) {
    const entries = writeBaseline()
    console.log(`[repo:policy] baseline written with ${entries.length} grandfathered entr${entries.length === 1 ? 'y' : 'ies'}`)
    return
  }

  const records = collectRecords(REPO_ROOT, flags.mode)
  const baseline = loadBaseline(REPO_ROOT)
  const violations = evaluateRepositoryPolicy(records, {
    baselinePaths: baseline.map((entry) => entry.path),
  })

  if (flags.json) {
    console.log(JSON.stringify({ mode: flags.mode, checked: records.length, violations }, null, 2))
  } else if (violations.length > 0) {
    console.error(`[repo:policy] FAILED: ${violations.length} violation(s) in ${records.length} file(s)`)
    for (const violation of violations) {
      console.error(`  - ${violation.path} (${violation.reason}, ${violation.sizeBytes} bytes)`)
    }
    console.error(
      'Move build output out of Git, track large binaries with Git LFS, or add a narrow documented exception.',
    )
  } else {
    console.log(`[repo:policy] passed: ${records.length} file(s) checked (mode=${flags.mode})`)
  }

  if (violations.length > 0) process.exitCode = 1
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
}
