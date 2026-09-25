import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import {
  MAX_BATCH_SPRINTS,
  clampMaxSprints,
  selectSprintSequence,
  findUnrelatedDirtyFiles,
  classifyScanText,
  isTransientText,
  completedIds,
  defaultBatchState,
} from '../sprint-batch-runner.mjs'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8'))
}

test('the hard batch maximum is exactly 10', () => {
  assert.equal(MAX_BATCH_SPRINTS, 10)
  assert.deepEqual(clampMaxSprints('25'), { value: 10, clamped: true, requested: 25 })
  assert.deepEqual(clampMaxSprints('10'), { value: 10, clamped: false, requested: 10 })
  assert.deepEqual(clampMaxSprints('3'), { value: 3, clamped: false, requested: 3 })
  assert.deepEqual(clampMaxSprints(undefined), { value: 10, clamped: false, requested: null })
  assert.deepEqual(clampMaxSprints('not-a-number'), { value: 10, clamped: false, requested: null })
  assert.deepEqual(clampMaxSprints('0'), { value: 10, clamped: false, requested: null })
})

test('sprint selection is bounded, dependency-aware and read-only', () => {
  const roadmap = {
    sprints: Array.from({ length: 12 }, (_, index) => {
      const number = index + 1
      return {
        id: `S${String(number).padStart(2, '0')}`,
        dependsOn: number === 1 ? [] : [`S${String(number - 1).padStart(2, '0')}`],
      }
    }),
  }
  const state = { activeSprint: null, sprints: { S01: { status: 'completed' }, S02: { status: 'completed' } } }
  const before = JSON.stringify(state)
  const selection = selectSprintSequence(roadmap, state, MAX_BATCH_SPRINTS)
  assert.deepEqual(selection, ['S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12'])
  assert.equal(selection.length, 10)
  assert.equal(JSON.stringify(state), before)

  const short = selectSprintSequence(roadmap, state, 3)
  assert.deepEqual(short, ['S03', 'S04', 'S05'])

  const withActive = {
    activeSprint: 'S03',
    sprints: { S01: { status: 'completed' }, S02: { status: 'completed' }, S03: { status: 'active' } },
  }
  assert.deepEqual(selectSprintSequence(roadmap, withActive, 2), ['S03', 'S04'])

  const unmet = { activeSprint: null, sprints: { S01: { status: 'planned' } } }
  assert.deepEqual(selectSprintSequence({ sprints: [{ id: 'S02', dependsOn: ['S99'] }, { id: 'S01', dependsOn: [] }] }, unmet, 10), ['S01'])
})

test('dirty worktree filtering only ignores autopilot-owned paths', () => {
  const entries = [
    { code: ' M', file: 'docs/roadmap/autopilot/state.json' },
    { code: ' M', file: 'docs/roadmap/state.json' },
    { code: ' M', file: 'docs/roadmap/CURRENT_SPRINT.md' },
    { code: '??', file: 'user-notes.txt' },
    { code: ' M', file: 'src/code.cs' },
  ]
  assert.deepEqual(findUnrelatedDirtyFiles(entries), ['?? user-notes.txt', ' M src/code.cs'])
  assert.deepEqual(findUnrelatedDirtyFiles(entries, ['src/code.cs']), ['?? user-notes.txt'])
})

test('provider, quota and transient classification is stable', () => {
  assert.equal(classifyScanText('429 Too Many Requests'), 'RATE_LIMIT')
  assert.equal(classifyScanText('Your quota has been exhausted'), 'PROVIDER_QUOTA')
  assert.equal(classifyScanText('401 Unauthorized: invalid api key'), 'TOOL_FAILURE')
  assert.equal(classifyScanText('all good'), null)
  assert.equal(isTransientText('read ECONNRESET'), true)
  assert.equal(isTransientText('503 Service Unavailable'), true)
  assert.equal(isTransientText('deterministic test failure'), false)
})

test('package scripts preserve the atomic runner and add the batch commands', () => {
  const pkg = readJson('package.json')
  const scripts = pkg.scripts
  assert.equal(scripts['sprint:status'], 'node scripts/sprint-runner.mjs status')
  assert.equal(scripts['sprint:validate'], 'node scripts/sprint-runner.mjs validate')
  assert.equal(scripts['sprint:next'], 'node scripts/sprint-runner.mjs start-next')
  assert.equal(scripts['sprint:show'], 'node scripts/sprint-runner.mjs show')
  assert.equal(scripts['sprint:complete'], 'node scripts/sprint-runner.mjs complete')
  assert.equal(scripts['sprint:batch:start'], 'node scripts/sprint-batch-runner.mjs start')
  assert.equal(scripts['sprint:batch:resume'], 'node scripts/sprint-batch-runner.mjs resume')
  assert.equal(scripts['sprint:batch:status'], 'node scripts/sprint-batch-runner.mjs status')
  assert.equal(scripts['sprint:batch:watch'], 'node scripts/sprint-batch-runner.mjs watch')
  assert.equal(scripts['sprint:batch:stop'], 'node scripts/sprint-batch-runner.mjs stop')
  assert.equal(scripts['sprint:batch:resolve-gate'], 'node scripts/sprint-batch-runner.mjs resolve-gate')
  assert.equal(scripts['sprint:batch:dry-run'], 'node scripts/sprint-batch-runner.mjs dry-run')
  assert.equal(scripts['sprint:batch:test'], 'node --test "scripts/tests/*.test.mjs"')
})

test('OpenCode project config enables the queue plugin without a root config duplicate', () => {
  const projectConfig = readJson('.opencode/opencode.json')
  assert.ok(Array.isArray(projectConfig.plugin))
  assert.ok(projectConfig.plugin.includes('opencode-queue'))
  assert.equal(fs.existsSync(path.join(REPO_ROOT, 'opencode.json')), false)
  const rootConfig = fs.existsSync(path.join(REPO_ROOT, 'opencode.jsonc'))
  assert.equal(rootConfig, false)
})

test('OpenCode commands and the sprint-worker agent exist', () => {
  const commands = [
    'start-next-sprint.md',
    'start-one-sprint.md',
    'sprint-batch-status.md',
    'stop-sprint-batch.md',
    'resolve-sprint-gate.md',
    'resume-sprint-batch.md',
  ]
  for (const command of commands) {
    const file = path.join(REPO_ROOT, '.opencode', 'commands', command)
    assert.equal(fs.existsSync(file), true, `missing command ${command}`)
  }
  const batchCommand = fs.readFileSync(path.join(REPO_ROOT, '.opencode', 'commands', 'start-next-sprint.md'), 'utf8')
  assert.match(batchCommand, /sprint:batch:start/)
  assert.ok(!/sprint:next`/.test(batchCommand), 'the batch command must not implement sprints directly')
  const oneCommand = fs.readFileSync(path.join(REPO_ROOT, '.opencode', 'commands', 'start-one-sprint.md'), 'utf8')
  assert.match(oneCommand, /npm run sprint:next/)

  const agent = fs.readFileSync(path.join(REPO_ROOT, '.opencode', 'agents', 'sprint-worker.md'), 'utf8')
  assert.match(agent, /^---/)
  assert.match(agent, /mode: primary/)
})

test('autopilot state sample and worker prompt are committed', () => {
  const sample = readJson(path.join('docs', 'roadmap', 'autopilot', 'state.json'))
  const expected = defaultBatchState()
  assert.equal(sample.schemaVersion, '1.0')
  assert.equal(sample.status, 'idle')
  assert.equal(sample.batchId, null)
  assert.equal(sample.requestedMaxSprints, 10)
  assert.deepEqual(Object.keys(expected).sort(), Object.keys(sample).sort())
  assert.equal(fs.existsSync(path.join(REPO_ROOT, 'docs', 'roadmap', 'autopilot', 'WORKER_PROMPT.md')), true)
  assert.equal(fs.existsSync(path.join(REPO_ROOT, 'docs', 'roadmap', 'AUTOPILOT.md')), true)
  assert.equal(fs.existsSync(path.join(REPO_ROOT, 'docs', 'roadmap', 'autopilot', 'HUMAN_REQUIRED.json')), false)
})

test('the real roadmap was not mutated by this infrastructure work', () => {
  const roadmap = readJson(path.join('docs', 'roadmap', 'roadmap.json'))
  const state = readJson(path.join('docs', 'roadmap', 'state.json'))
  assert.equal(roadmap.sprintCeiling, 50)
  assert.equal(roadmap.sprints.length, 50)
  assert.equal(state.activeSprint, null)
  assert.equal(state.sprints.S33.status, 'planned')
  assert.equal(state.sprints.S31.status, 'completed')
  assert.equal(state.sprints.S32.status, 'completed')
  for (let index = 1; index <= 30; index += 1) {
    const id = `S${String(index).padStart(2, '0')}`
    assert.equal(state.sprints[id].status, 'completed', `${id} historical record changed`)
    assert.ok(state.sprints[id].summary, `${id} lost its summary`)
    assert.ok(state.sprints[id].evidence, `${id} lost its evidence`)
  }
  assert.equal(completedIds(state).length, 32)
  const selection = selectSprintSequence(roadmap, state, MAX_BATCH_SPRINTS)
  assert.deepEqual(selection, ['S33', 'S34', 'S35', 'S36', 'S37', 'S38', 'S39', 'S40', 'S41', 'S42'])
  assert.ok(!selection.includes('S43'), 'the 11th sprint must never be selected in one batch')
})

test('the existing roadmap validator still passes unchanged', { timeout: 60_000 }, () => {
  const result = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts', 'sprint-runner.mjs'), 'validate'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
  })
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
})
