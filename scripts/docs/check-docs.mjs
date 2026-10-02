#!/usr/bin/env node
/**
 * S50 documentation integrity gate.
 *
 * Verifies that the documentation set exists, that relative Markdown links in the
 * documentation resolve to real files, and that the 1.0 reference sample project is
 * well-formed. Run with `npm run docs:check`.
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

export const SAMPLE_PROJECT_DIR = 'docs/samples/fabrik3d-1.0-reference-project'

/** Documents that must exist for the 1.0 baseline to be considered documented. */
export const REQUIRED_DOCUMENTS = [
  'docs/DOCUMENTATION_INDEX.md',
  'docs/architecture/OVERVIEW.md',
  'docs/guides/LEARNER_QUICKSTART.md',
  'docs/guides/INSTRUCTOR_GUIDE.md',
  'docs/guides/EXTERNAL_CONTROLLER_GUIDE.md',
  'docs/guides/SIGNAL_MAPPING_GUIDE.md',
  'docs/guides/FAULT_LAB_GUIDE.md',
  'docs/operations/LIMITATIONS.md',
  'docs/operations/SECURITY_MODEL.md',
  'docs/operations/DATA_AND_PRIVACY.md',
  'docs/operations/DEPLOYMENT.md',
  'docs/operations/ADMINISTRATOR_GUIDE.md',
  'docs/operations/BACKUP_RESTORE.md',
  'docs/operations/UPGRADE_ROLLBACK.md',
  'docs/operations/VALIDATION_1.0.md',
  'docs/operations/VALIDATION_POST_1.0.md',
  'docs/operations/VALIDATION_REVISION_3.md',
  'docs/operations/FLAGSHIP_DEMO.md',
  'docs/development/TROUBLESHOOTING.md',
  'docs/releases/RELEASE_NOTES_1.0.md',
  'docs/releases/RELEASE_NOTES_REVISION_3.md',
  `${SAMPLE_PROJECT_DIR}/project.json`,
  `${SAMPLE_PROJECT_DIR}/README.md`,
  `${SAMPLE_PROJECT_DIR}/reference-cell.cell.json`,
  `${SAMPLE_PROJECT_DIR}/reference-cell-mapping.json`,
  `${SAMPLE_PROJECT_DIR}/training-session-report.sample.json`,
]

/** Markdown files whose relative links are checked. */
export const LINK_CHECKED_DOCUMENTS = [
  'README.md',
  'docs/DOCUMENTATION_INDEX.md',
  'docs/architecture/OVERVIEW.md',
  'docs/guides/LEARNER_QUICKSTART.md',
  'docs/guides/INSTRUCTOR_GUIDE.md',
  'docs/guides/EXTERNAL_CONTROLLER_GUIDE.md',
  'docs/guides/SIGNAL_MAPPING_GUIDE.md',
  'docs/guides/FAULT_LAB_GUIDE.md',
  'docs/operations/LIMITATIONS.md',
  'docs/operations/SECURITY_MODEL.md',
  'docs/operations/DATA_AND_PRIVACY.md',
  'docs/operations/VALIDATION_1.0.md',
  'docs/operations/VALIDATION_POST_1.0.md',
  'docs/operations/VALIDATION_REVISION_3.md',
  'docs/operations/FLAGSHIP_DEMO.md',
  'docs/development/TROUBLESHOOTING.md',
  'docs/releases/RELEASE_NOTES_1.0.md',
  'docs/releases/RELEASE_NOTES_REVISION_3.md',
  `${SAMPLE_PROJECT_DIR}/README.md`,
]

const MARKDOWN_LINK = /\[[^\]]*\]\(([^)]+)\)/g

function isExternal(link) {
  return /^(https?:|mailto:|tel:|data:)/i.test(link)
}

function stripAnchor(link) {
  const hash = link.indexOf('#')
  return hash === -1 ? link : link.slice(0, hash)
}

function decode(link) {
  try {
    return decodeURIComponent(link)
  } catch {
    return link
  }
}

function checkLinks(rootDir, relativeFile, errors) {
  const absolute = join(rootDir, relativeFile)
  const text = readFileSync(absolute, 'utf8')
  const baseDir = dirname(absolute)
  let checked = 0
  let match
  while ((match = MARKDOWN_LINK.exec(text)) !== null) {
    const raw = match[1].trim()
    if (!raw || raw.startsWith('#') || isExternal(raw)) continue
    const target = stripAnchor(raw).trim()
    if (!target) continue // pure anchor
    const resolved = isAbsolute(target) ? target : resolve(baseDir, decode(target))
    checked += 1
    if (!existsSync(resolved)) {
      errors.push(`${relativeFile}: broken link -> ${raw}`)
    }
  }
  return checked
}

function readJson(path, errors) {
  if (!existsSync(path)) {
    errors.push(`missing file: ${relative(REPO_ROOT, path)}`)
    return undefined
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    errors.push(`invalid JSON: ${relative(REPO_ROOT, path)} (${error.message})`)
    return undefined
  }
}

/**
 * @param {{ rootDir?: string }} [options]
 * @returns {{ errors: string[]; checked: { documents: number; links: number } }}
 */
export function checkDocumentation(options = {}) {
  const rootDir = options.rootDir ?? REPO_ROOT
  const errors = []

  for (const document of REQUIRED_DOCUMENTS) {
    const absolute = join(rootDir, document)
    if (!existsSync(absolute) || !statSync(absolute).isFile()) {
      errors.push(`required document is missing: ${document}`)
    }
  }

  let links = 0
  for (const document of LINK_CHECKED_DOCUMENTS) {
    const absolute = join(rootDir, document)
    if (!existsSync(absolute)) continue
    links += checkLinks(rootDir, document, errors)
  }

  // Sample project manifest and components.
  const projectDir = join(rootDir, SAMPLE_PROJECT_DIR)
  const manifest = readJson(join(projectDir, 'project.json'), errors)
  if (manifest) {
    if (manifest.schemaVersion !== '1.0') errors.push(`sample project: expected schemaVersion 1.0, got ${manifest.schemaVersion}`)
    const refs = [
      ['cell', manifest.cell?.file],
      ['mapping', manifest.mapping?.file],
      ['trainingSession', manifest.trainingSession?.file],
    ]
    for (const [key, file] of refs) {
      if (typeof file !== 'string' || !file) {
        errors.push(`sample project: missing ${key}.file`)
        continue
      }
      const json = readJson(join(projectDir, file), errors)
      if (json && json.schemaVersion && json.schemaVersion !== '1.0') {
        errors.push(`sample project: ${key} (${file}) must declare schemaVersion 1.0`)
      }
    }
    const cell = readJson(join(projectDir, manifest.cell?.file ?? ''), errors)
    if (cell) {
      if (!Array.isArray(cell.equipment) || cell.equipment.length === 0) {
        errors.push('sample project: reference-cell.cell.json has no equipment')
      }
      if (typeof cell.worldFrameId !== 'string' || !cell.worldFrameId) {
        errors.push('sample project: reference-cell.cell.json is missing worldFrameId')
      }
    }
  }

  const releaseNotes = join(rootDir, 'docs/releases/RELEASE_NOTES_1.0.md')
  if (existsSync(releaseNotes)) {
    const text = readFileSync(releaseNotes, 'utf8')
    if (!/1\.0/.test(text)) errors.push('release notes do not mention the 1.0 release')
  }

  return { errors, checked: { documents: REQUIRED_DOCUMENTS.length, links } }
}

function main() {
  const { errors, checked } = checkDocumentation()
  if (errors.length > 0) {
    console.error(`[docs:check] FAILED (${errors.length} problem(s), ${checked.links} links checked)`)
    for (const error of errors) console.error(`  - ${error}`)
    process.exitCode = 1
    return
  }
  console.log(`[docs:check] passed: ${checked.documents} required documents present, ${checked.links} links resolved`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
}
