import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  evaluateRepositoryPolicy,
  isBinaryPath,
  isForbiddenExtension,
  isForbiddenPath,
  isLfsTracked,
  normalizePath,
  parseLfsPatterns,
  HARD_MAX_BYTES,
  LFS_THRESHOLD_BYTES,
} from '../repository/repository-policy.mjs'

test('normalizePath converts separators and strips a leading ./', () => {
  assert.equal(normalizePath('Fabrik3D\\file.glb'), 'Fabrik3D/file.glb')
  assert.equal(normalizePath('./docs/x.md'), 'docs/x.md')
})

test('binary and forbidden classification', () => {
  assert.equal(isBinaryPath('a/b/model.glb'), true)
  assert.equal(isBinaryPath('a/b/readme.md'), false)
  assert.equal(isForbiddenPath('Fabrik3D/obj/Debug/net8.0/x.dll'), true)
  assert.equal(isForbiddenPath('node_modules/pkg/index.js'), true)
  assert.equal(isForbiddenPath('Fabrik3D/fabrik3d.client/dist/index.html'), true)
  assert.equal(isForbiddenPath('Fabrik3D/fabrik3d.client/src/main.ts'), false)
  assert.equal(isForbiddenExtension('recording.tmp'), true)
  assert.equal(isForbiddenExtension('archive.zip'), false, 'zip is a binary asset, not a temp extension')
})

test('parses Git LFS patterns from .gitattributes', () => {
  const patterns = parseLfsPatterns(
    ['# comment', 'media/*.gif filter=lfs diff=lfs merge=lfs -text', '*.mp4 filter=lfs diff=lfs merge=lfs -text', '!keep.bin filter=lfs'].join('\n'),
  )
  assert.deepEqual(patterns, ['media/*.gif', '*.mp4'])
})

test('isLfsTracked matches single and double star patterns', () => {
  assert.equal(isLfsTracked('media/Simulator.gif', ['media/*.gif']), true)
  assert.equal(isLfsTracked('a/deep/b/file.mp4', ['**/*.mp4']), true)
  assert.equal(isLfsTracked('a/file.mp4', ['**/*.mp4']), true)
  assert.equal(isLfsTracked('a/file.mp4', ['media/*.gif']), false)
})

test('build output, dependencies and temporary files are always violations', () => {
  const violations = evaluateRepositoryPolicy([
    { path: 'Fabrik3D/Fabrik3D.Server/obj/Debug/net8.0/x.dll', sizeBytes: 10 },
    { path: 'node_modules/pkg/index.js', sizeBytes: 10 },
    { path: 'recording.tmp', sizeBytes: 10 },
  ])
  assert.deepEqual(
    violations.map((v) => v.reason).sort(),
    ['forbidden-build-or-dependency-path', 'forbidden-build-or-dependency-path', 'forbidden-temporary-or-archive-extension'],
  )
})

test('a large binary is a violation until it is tracked by Git LFS', () => {
  const record = { path: 'assets/new.glb', sizeBytes: LFS_THRESHOLD_BYTES + 1, lfs: false }
  assert.deepEqual(evaluateRepositoryPolicy([record]), [
    { path: 'assets/new.glb', reason: 'binary-requires-git-lfs', sizeBytes: LFS_THRESHOLD_BYTES + 1 },
  ])
  assert.deepEqual(evaluateRepositoryPolicy([{ ...record, lfs: true }]), [])
})

test('a small binary and a large text file are allowed without LFS', () => {
  assert.deepEqual(evaluateRepositoryPolicy([{ path: 'assets/small.glb', sizeBytes: 1024, lfs: false }]), [])
  assert.deepEqual(
    evaluateRepositoryPolicy([{ path: 'docs/big.md', sizeBytes: HARD_MAX_BYTES + 1, lfs: false }]),
    [{ path: 'docs/big.md', reason: 'exceeds-hard-size-limit', sizeBytes: HARD_MAX_BYTES + 1 }],
  )
})

test('the frozen baseline grandfathers pre-existing offenders but never bypasses forbidden paths', () => {
  const records = [
    { path: 'media/legacy.gif', sizeBytes: HARD_MAX_BYTES + 1, lfs: false },
    { path: 'build/obj/thing.dll', sizeBytes: 10, lfs: false },
  ]
  const violations = evaluateRepositoryPolicy(records, { baselinePaths: ['media/legacy.gif', 'build/obj/thing.dll'] })
  assert.deepEqual(violations.map((v) => v.path), ['build/obj/thing.dll'])
})
