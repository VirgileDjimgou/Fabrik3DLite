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
  'docs/operations/VALIDATION_REVISION_4.md',
  'docs/operations/RELEASE_PREPARATION_REVISION_4.md',
  'docs/operations/FLAGSHIP_DEMO.md',
  'docs/development/TROUBLESHOOTING.md',
  'docs/releases/RELEASE_NOTES_1.0.md',
  'docs/releases/RELEASE_NOTES_REVISION_3.md',
  'docs/releases/RELEASE_NOTES_REVISION_4.md',
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
  'docs/operations/VALIDATION_REVISION_4.md',
  'docs/operations/RELEASE_PREPARATION_REVISION_4.md',
  'docs/operations/FLAGSHIP_DEMO.md',
  'docs/development/TROUBLESHOOTING.md',
  'docs/releases/RELEASE_NOTES_1.0.md',
  'docs/releases/RELEASE_NOTES_REVISION_3.md',
  'docs/releases/RELEASE_NOTES_REVISION_4.md',
  `${SAMPLE_PROJECT_DIR}/README.md`,
]

/** Current documents that must distinguish the four release eras (1.0, Revision 2, Revision 3, Revision 4). */
export const RELEASE_ERA_DOCUMENTS = [
  'README.md',
  'docs/DOCUMENTATION_INDEX.md',
  'docs/operations/LIMITATIONS.md',
  'docs/roadmap/README.md',
  'docs/architecture/OVERVIEW.md',
]

export const RELEASE_ERA_PATTERNS = [
  { label: '1.0 baseline', pattern: /1\.0/ },
  { label: 'Revision 2', pattern: /Revision 2/i },
  { label: 'Revision 3', pattern: /Revision 3/i },
  { label: 'Revision 4', pattern: /Revision 4/i },
]

export const REVISION_4_PREP_DOCUMENT = 'docs/operations/RELEASE_PREPARATION_REVISION_4.md'
export const REVISION_4_RELEASE_NOTES = 'docs/releases/RELEASE_NOTES_REVISION_4.md'
export const REVISION_4_VALIDATION = 'docs/operations/VALIDATION_REVISION_4.md'

/**
 * Stale claims a current document must not repeat. Each names the files to check and why the claim
 * was superseded, so the failure message explains the contradiction instead of only the regex.
 */
export const SUPERSEDED_CLAIMS = [
  {
    pattern: /remain an open measurement/i,
    documents: ['docs/architecture/HERO_REFERENCE_CELL.md', 'docs/architecture/ASSET_RUNTIME.md'],
    reason: 'hardware GPU frame time is measured by S62/S68, not an open measurement',
  },
  {
    pattern: /will be available in a future update/i,
    documents: ['Fabrik3D/fabrik3d.hmi/src/i18n/en.ts', 'Fabrik3D/fabrik3d.hmi/src/i18n/fr.ts', 'Fabrik3D/fabrik3d.hmi/src/i18n/de.ts'],
    reason: 'the Robot Positions placeholder text was removed when the surface was implemented',
  },
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
 * S70 release coherence: current documents must distinguish the four release eras, must not repeat
 * superseded claims, and the Revision 4 release artifacts must state version, migration, limitations,
 * validation and media information before final validation.
 *
 * S71 finalization: once S71 has produced `VALIDATION_REVISION_4.md`, the Revision 4 release notes
 * must no longer be labelled draft, must link the validation record, and the validation record itself
 * must carry the measured hardware benchmark, the Revision 3 → Revision 4 comparison and its
 * explicit non-claims.
 * @param {string} rootDir
 * @param {string[]} errors
 */
export function verifyReleaseCoherence(rootDir, errors) {
  for (const document of RELEASE_ERA_DOCUMENTS) {
    const absolute = join(rootDir, document)
    if (!existsSync(absolute)) continue
    const text = readFileSync(absolute, 'utf8')
    for (const { label, pattern } of RELEASE_ERA_PATTERNS) {
      if (!pattern.test(text)) errors.push(`${document}: does not distinguish ${label}`)
    }
  }

  for (const { pattern, documents, reason } of SUPERSEDED_CLAIMS) {
    for (const document of documents) {
      const absolute = join(rootDir, document)
      if (!existsSync(absolute)) continue
      if (pattern.test(readFileSync(absolute, 'utf8'))) {
        errors.push(`${document}: repeats a superseded claim (${reason})`)
      }
    }
  }

  const prep = join(rootDir, REVISION_4_PREP_DOCUMENT)
  if (existsSync(prep)) {
    const text = readFileSync(prep, 'utf8')
    const required = [
      ['a version/tag recommendation', /v1\.\d+\.\d+/],
      ['a migration statement', /no migration/i],
      ['a known-limitations link', /LIMITATIONS\.md/],
      ['a validation link', /VALIDATION_/],
      ['a media link', /artifacts\/demo|docs\/demo/],
    ]
    for (const [label, pattern] of required) {
      if (!pattern.test(text)) errors.push(`${REVISION_4_PREP_DOCUMENT}: missing ${label}`)
    }
  }

  const notes = join(rootDir, REVISION_4_RELEASE_NOTES)
  if (existsSync(notes)) {
    const text = readFileSync(notes, 'utf8')
    if (/draft/i.test(text)) errors.push(`${REVISION_4_RELEASE_NOTES}: must be finalized by S71 (remove the draft label)`)
    if (!/v1\.\d+\.\d+/.test(text)) errors.push(`${REVISION_4_RELEASE_NOTES}: missing a version recommendation`)
    if (!/VALIDATION_REVISION_4\.md/.test(text)) errors.push(`${REVISION_4_RELEASE_NOTES}: missing the Revision 4 validation link`)
  }

  const validation = join(rootDir, REVISION_4_VALIDATION)
  if (existsSync(validation)) {
    const text = readFileSync(validation, 'utf8')
    const requiredValidation = [
      ['a hardware/acceleration classification', /acceleration=(hardware|software)/i],
      ['the Revision 3 comparison', /Revision 3/],
      ['the Revision 4 comparison', /Revision 4/],
      ['an explicit comparison statement', /compar/i],
      ['the hardware benchmark artifact path', /gpu-benchmark\.json/],
      ['the five flagship scenarios', /palletizing[\s\S]{0,6000}vision[- ]sorting/i],
      ['an explicit deferred or non-claim statement', /deferred|non-claim/i],
    ]
    for (const [label, pattern] of requiredValidation) {
      if (!pattern.test(text)) errors.push(`${REVISION_4_VALIDATION}: missing ${label}`)
    }
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

  verifyReleaseCoherence(rootDir, errors)

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
