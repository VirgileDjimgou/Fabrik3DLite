import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  checkDocumentation,
  RELEASE_ERA_DOCUMENTS,
  RELEASE_ERA_PATTERNS,
  REVISION_4_PREP_DOCUMENT,
  REVISION_4_RELEASE_NOTES,
  REVISION_4_VALIDATION,
  REVISION_5_PREP_DOCUMENT,
  REVISION_5_RELEASE_NOTES,
  REVISION_5_VALIDATION,
} from '../docs/check-docs.mjs'
import {
  evaluateRepositoryPolicy,
  isForbiddenExtension,
  isForbiddenPath,
  LFS_THRESHOLD_BYTES,
} from '../repository/repository-policy.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCENARIO_ASSET_ROOT = join(REPO_ROOT, 'Fabrik3D/fabrik3d.client/public/assets/equipment')

function scenarioPackages() {
  return readdirSync(SCENARIO_ASSET_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('scenario-'))
    .map((entry) => join(SCENARIO_ASSET_ROOT, entry.name))
}

function walkFiles(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = join(dir, entry.name)
    if (entry.isDirectory()) walkFiles(absolute, files)
    else files.push(absolute)
  }
  return files
}

test('documentation set passes link, claim and version coherence', () => {
  const { errors, checked } = checkDocumentation()
  assert.deepEqual(errors, [], `documentation problems:\n${errors.join('\n')}`)
  assert.ok(checked.documents >= 28, `expected at least 28 required documents, got ${checked.documents}`)
})

test('current documents distinguish the 1.0, Revision 2, Revision 3, Revision 4 and Revision 5 eras', () => {
  for (const document of RELEASE_ERA_DOCUMENTS) {
    const absolute = join(REPO_ROOT, document)
    assert.ok(existsSync(absolute), `missing release-era document ${document}`)
    const text = readFileSync(absolute, 'utf8')
    for (const { label, pattern } of RELEASE_ERA_PATTERNS) {
      assert.match(text, pattern, `${document} does not distinguish ${label}`)
    }
  }
})

test('Revision 4 release artifacts state version, migration, limitations, validation and media', () => {
  const prepPath = join(REPO_ROOT, REVISION_4_PREP_DOCUMENT)
  assert.ok(existsSync(prepPath), `missing ${REVISION_4_PREP_DOCUMENT}`)
  const prep = readFileSync(prepPath, 'utf8')
  assert.match(prep, /v1\.\d+\.\d+/, 'release preparation must recommend a version tag')
  assert.match(prep, /no migration/i, 'release preparation must state the migration status')
  assert.match(prep, /LIMITATIONS\.md/, 'release preparation must link the known limitations')
  assert.match(prep, /VALIDATION_/, 'release preparation must link validation evidence')
  assert.match(prep, /artifacts\/demo|docs\/demo/, 'release preparation must link media')

  const notesPath = join(REPO_ROOT, REVISION_4_RELEASE_NOTES)
  assert.ok(existsSync(notesPath), `missing ${REVISION_4_RELEASE_NOTES}`)
  const notes = readFileSync(notesPath, 'utf8')
  assert.doesNotMatch(notes, /draft/i, 'S71 must finalize the release notes (remove the draft label)')
  assert.match(notes, /v1\.\d+\.\d+/, 'release notes must state the recommended version')
  assert.match(notes, /VALIDATION_REVISION_4\.md/, 'release notes must link the Revision 4 validation record')
})

test('Revision 4 validation record carries the measured comparison and non-claims', () => {
  const validationPath = join(REPO_ROOT, REVISION_4_VALIDATION)
  assert.ok(existsSync(validationPath), `missing ${REVISION_4_VALIDATION}`)
  const validation = readFileSync(validationPath, 'utf8')
  assert.match(validation, /acceleration=(hardware|software)/i, 'validation must record an honest acceleration class')
  assert.match(validation, /Revision 3/, 'validation must reference Revision 3 measurements')
  assert.match(validation, /Revision 4/, 'validation must reference Revision 4 measurements')
  assert.match(validation, /compar/i, 'validation must present the measured comparison')
  assert.match(validation, /gpu-benchmark\.json/, 'validation must point at the recorded benchmark artifact')
  assert.match(validation, /palletizing[\s\S]{0,6000}vision[- ]sorting/i, 'validation must cover the five flagship scenarios')
  assert.match(validation, /deferred|non-claim/i, 'validation must preserve the deferred/non-claim statements')
})

test('Revision 5 release artifacts state version, migration, limitations, validation and media', () => {
  const prepPath = join(REPO_ROOT, REVISION_5_PREP_DOCUMENT)
  assert.ok(existsSync(prepPath), `missing ${REVISION_5_PREP_DOCUMENT}`)
  const prep = readFileSync(prepPath, 'utf8')
  assert.match(prep, /v1\.\d+\.\d+/, 'release preparation must recommend a version tag')
  assert.match(prep, /migration/i, 'release preparation must state the migration status')
  assert.match(prep, /LIMITATIONS\.md/, 'release preparation must link the known limitations')
  assert.match(prep, /VALIDATION_/, 'release preparation must link validation evidence')
  assert.match(prep, /artifacts\/demo|docs\/demo/, 'release preparation must link media')

  const notesPath = join(REPO_ROOT, REVISION_5_RELEASE_NOTES)
  assert.ok(existsSync(notesPath), `missing ${REVISION_5_RELEASE_NOTES}`)
  const notes = readFileSync(notesPath, 'utf8')
  assert.doesNotMatch(notes, /draft/i, 'S76 must finalize the release notes (remove the draft label)')
  assert.match(notes, /v1\.\d+\.\d+/, 'release notes must state the recommended version')
  assert.match(notes, /VALIDATION_REVISION_5\.md/, 'release notes must link the Revision 5 validation record')
})

test('Revision 5 validation record carries the measured comparison and non-claims', () => {
  const validationPath = join(REPO_ROOT, REVISION_5_VALIDATION)
  assert.ok(existsSync(validationPath), `missing ${REVISION_5_VALIDATION}`)
  const validation = readFileSync(validationPath, 'utf8')
  assert.match(validation, /acceleration=(hardware|software)/i, 'validation must record an honest acceleration class')
  assert.match(validation, /Revision 4/, 'validation must reference Revision 4 measurements')
  assert.match(validation, /Revision 5/, 'validation must reference Revision 5 measurements')
  assert.match(validation, /compar/i, 'validation must present the measured comparison')
  assert.match(validation, /gpu-benchmark\.json/, 'validation must point at the recorded benchmark artifact')
  assert.match(validation, /palletizing[\s\S]{0,6000}vision[- ]sorting/i, 'validation must cover the five flagship scenarios')
  assert.match(validation, /deferred|non-claim/i, 'validation must preserve the deferred/non-claim statements')
})

test('generated scenario assets satisfy the binary and size policy', () => {
  const packages = scenarioPackages()
  assert.ok(packages.length >= 20, `expected the generated scenario asset packages, found ${packages.length}`)
  const records = []
  for (const pkg of packages) {
    for (const file of walkFiles(pkg)) {
      const relativePath = file.slice(REPO_ROOT.length + 1).replace(/\\/g, '/')
      assert.equal(isForbiddenPath(relativePath), false, `forbidden scenario asset path ${relativePath}`)
      assert.equal(isForbiddenExtension(relativePath), false, `forbidden scenario asset extension ${relativePath}`)
      records.push({ path: relativePath, sizeBytes: statSync(file).size, lfs: false })
    }
  }
  assert.deepEqual(evaluateRepositoryPolicy(records), [], 'scenario assets must not require Git LFS')
  for (const record of records) {
    assert.ok(record.sizeBytes < LFS_THRESHOLD_BYTES, `${record.path} exceeds the LFS threshold`)
  }
})

test('generated scenario assets record SI provenance, bounds, hashes and license', () => {
  const packages = scenarioPackages()
  for (const pkg of packages) {
    const manifestPath = join(pkg, 'equipment.asset.json')
    assert.ok(existsSync(manifestPath), `missing manifest in ${pkg}`)
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    assert.equal(manifest.schemaVersion, '1.0', `${manifest.id} schemaVersion`)
    assert.equal(manifest.coordinateSystem.units, 'meters', `${manifest.id} units`)
    assert.equal(manifest.coordinateSystem.upAxis, 'Y', `${manifest.id} up axis`)
    assert.equal(manifest.coordinateSystem.origin, 'equipment-base', `${manifest.id} origin`)
    for (const axis of ['x', 'y', 'z']) {
      assert.ok(Number(manifest.boundsMeters[axis]) > 0, `${manifest.id} boundsMeters.${axis}`)
    }
    assert.match(manifest.visual.glb.sha256, /^[0-9a-f]{64}$/, `${manifest.id} primary sha256`)
    assert.match(manifest.integrity.sha256, /^[0-9a-f]{64}$/, `${manifest.id} integrity sha256`)
    assert.match(manifest.license.name, /Fabrik3D/i, `${manifest.id} license provenance`)
  }
})

test('release packaging configuration is present', () => {
  assert.ok(existsSync(join(REPO_ROOT, 'Fabrik3D/compose.production.yaml')), 'missing production compose file')
  assert.ok(existsSync(join(REPO_ROOT, 'scripts/lifecycle/verify-config.mjs')), 'missing lifecycle config verifier')
})
