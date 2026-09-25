import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const ORCHESTRATOR = path.join(REPO_ROOT, 'scripts', 'sprint-batch-runner.mjs')
const FAKE_WORKER = path.join(REPO_ROOT, 'scripts', 'tests', 'fixtures', 'fake-opencode-worker.mjs')
const REAL_RUNNER = path.join(REPO_ROOT, 'scripts', 'sprint-runner.mjs')
const REAL_VERIFY = path.join(REPO_ROOT, 'scripts', 'verify-sprint-gates.mjs')

const WORK_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'fabrik3d-autopilot-tests-'))

after(() => {
  fs.rmSync(WORK_ROOT, { recursive: true, force: true })
})

function iso() {
  return new Date().toISOString()
}

function runGit(root, args) {
  return spawnSync('git', ['-c', 'init.defaultBranch=main', ...args], { cwd: root, encoding: 'utf8', windowsHide: true })
}

function createFixture({ sprintCount = 12, completedCount = 0, activeSprint = null, git = false } = {}) {
  const root = fs.mkdtempSync(path.join(WORK_ROOT, 'repo-'))
  fs.mkdirSync(path.join(root, 'docs', 'roadmap', 'sprints'), { recursive: true })
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true })
  fs.copyFileSync(REAL_RUNNER, path.join(root, 'scripts', 'sprint-runner.mjs'))
  fs.copyFileSync(REAL_VERIFY, path.join(root, 'scripts', 'verify-sprint-gates.mjs'))

  const sprints = []
  for (let index = 1; index <= sprintCount; index += 1) {
    const id = `S${String(index).padStart(2, '0')}`
    const previous = `S${String(index - 1).padStart(2, '0')}`
    sprints.push({
      id,
      phase: 1,
      title: `Fixture sprint ${id}`,
      file: `docs/roadmap/sprints/${id}.md`,
      dependsOn: index === 1 ? [] : [previous],
    })
    fs.writeFileSync(path.join(root, 'docs', 'roadmap', 'sprints', `${id}.md`), `# ${id} fixture brief\n\nDeterministic fixture brief for ${id}.\n`, 'utf8')
  }

  const completed = new Set()
  for (let index = 1; index <= completedCount; index += 1) completed.add(`S${String(index).padStart(2, '0')}`)

  const state = { version: 1, activeSprint: null, updatedAt: iso(), sprints: {} }
  for (const sprint of sprints) {
    if (completed.has(sprint.id)) {
      state.sprints[sprint.id] = {
        status: 'completed',
        startedAt: iso(),
        completedAt: iso(),
        summary: `Fixture completion of ${sprint.id}`,
        evidence: `fixture evidence for ${sprint.id}`,
      }
    } else {
      state.sprints[sprint.id] = { status: 'planned' }
    }
  }
  if (activeSprint) {
    state.activeSprint = activeSprint
    state.sprints[activeSprint] = { status: 'active', startedAt: iso() }
  }

  fs.writeFileSync(path.join(root, 'docs', 'roadmap', 'roadmap.json'), `${JSON.stringify({ version: 1, sprintCeiling: sprintCount, name: 'Fixture roadmap', sprints }, null, 2)}\n`, 'utf8')
  fs.writeFileSync(path.join(root, 'docs', 'roadmap', 'state.json'), `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  fs.writeFileSync(
    path.join(root, 'docs', 'roadmap', 'CURRENT_SPRINT.md'),
    activeSprint
      ? `# Active sprint: ${activeSprint} - Fixture sprint ${activeSprint}\n`
      : '# No active sprint\n\nLast completed: none\n',
    'utf8',
  )

  if (git) {
    runGit(root, ['init', '-q'])
    runGit(root, ['config', 'user.email', 'autopilot-tests@example.com'])
    runGit(root, ['config', 'user.name', 'Autopilot Tests'])
    runGit(root, ['config', 'commit.gpgsign', 'false'])
    runGit(root, ['add', '-A'])
    runGit(root, ['commit', '-q', '-m', 'fixture baseline'])
  }
  return root
}

function writeScenario(root, scenario) {
  const dir = path.join(root, 'docs', 'roadmap', 'autopilot')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'test-scenario.json'), `${JSON.stringify(scenario, null, 2)}\n`, 'utf8')
}

function writeBatchState(root, value) {
  const dir = path.join(root, 'docs', 'roadmap', 'autopilot')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'state.json'), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function readJson(root, relative) {
  return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'))
}

function readBatchState(root) {
  return readJson(root, path.join('docs', 'roadmap', 'autopilot', 'state.json'))
}

function readInvocations(root) {
  const file = path.join(root, 'docs', 'roadmap', 'autopilot', 'test-invocations.log')
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
}

function runBatch(root, extra = []) {
  return spawnSync(
    process.execPath,
    [ORCHESTRATOR, 'run', '--root', root, '--worker', FAKE_WORKER, '--mode', 'fresh', ...extra],
    { encoding: 'utf8', windowsHide: true, timeout: 120_000 },
  )
}

function invocationCounts(invocations) {
  const counts = {}
  for (const item of invocations) counts[item.sprint] = (counts[item.sprint] ?? 0) + 1
  return counts
}

test('runs at most 10 sprints and leaves the 11th untouched', { timeout: 60_000 }, () => {
  const root = createFixture({ sprintCount: 12 })
  writeScenario(root, { default: 'complete' })
  const result = runBatch(root, ['--max', '10'])
  assert.equal(result.status, 0, result.stderr)
  const state = readJson(root, path.join('docs', 'roadmap', 'state.json'))
  const batch = readBatchState(root)
  for (let index = 1; index <= 10; index += 1) {
    assert.equal(state.sprints[`S${String(index).padStart(2, '0')}`].status, 'completed')
  }
  assert.equal(state.sprints.S11.status, 'planned')
  assert.equal(state.sprints.S12.status, 'planned')
  assert.equal(batch.completedThisBatch, 10)
  assert.equal(batch.requestedMaxSprints, 10)
  assert.equal(batch.status, 'max_reached')
  assert.equal(readInvocations(root).length, 10)
})

test('clamps a requested maximum of 25 to the hard limit of 10', { timeout: 60_000 }, () => {
  const root = createFixture({ sprintCount: 12 })
  writeScenario(root, { default: 'complete' })
  const result = runBatch(root, ['--max', '25'])
  assert.equal(result.status, 0, result.stderr)
  const batch = readBatchState(root)
  assert.equal(batch.requestedMaxSprints, 10)
  assert.equal(batch.completedThisBatch, 10)
  assert.equal(batch.status, 'max_reached')
  assert.match(`${result.stdout}${result.stderr}`, /clamped/i)
  const state = readJson(root, path.join('docs', 'roadmap', 'state.json'))
  assert.equal(state.sprints.S11.status, 'planned')
})

test('completes a roadmap shorter than the batch limit', { timeout: 60_000 }, () => {
  const root = createFixture({ sprintCount: 3 })
  writeScenario(root, { default: 'complete' })
  const result = runBatch(root, ['--max', '10'])
  assert.equal(result.status, 0, result.stderr)
  const batch = readBatchState(root)
  const state = readJson(root, path.join('docs', 'roadmap', 'state.json'))
  assert.equal(batch.status, 'roadmap_complete')
  assert.equal(batch.completedThisBatch, 3)
  assert.equal(state.sprints.S03.status, 'completed')
})

test('stops after 3 unsuccessful repairs and never starts the next sprint', { timeout: 60_000 }, () => {
  const root = createFixture({ sprintCount: 5, completedCount: 2 })
  writeScenario(root, { sprints: { S03: ['fail', 'fail', 'fail', 'fail', 'fail'] } })
  const result = runBatch(root, ['--max', '10'])
  assert.notEqual(result.status, 0)
  const batch = readBatchState(root)
  const state = readJson(root, path.join('docs', 'roadmap', 'state.json'))
  assert.equal(batch.status, 'failed')
  assert.match(batch.stopReason, /UNRESOLVED_TEST_FAILURE/)
  assert.equal(state.activeSprint, 'S03')
  assert.equal(state.sprints.S03.status, 'active')
  assert.equal(state.sprints.S04.status, 'planned')
  const counts = invocationCounts(readInvocations(root))
  assert.equal(counts.S03, 4)
  assert.equal(counts.S04, undefined)
})

test('continues when a repair attempt fixes the failure', { timeout: 60_000 }, () => {
  const root = createFixture({ sprintCount: 4, completedCount: 2 })
  writeScenario(root, { sprints: { S03: ['fail', 'complete'] } })
  const result = runBatch(root, ['--max', '10'])
  assert.equal(result.status, 0, result.stderr)
  const batch = readBatchState(root)
  const state = readJson(root, path.join('docs', 'roadmap', 'state.json'))
  assert.equal(batch.status, 'roadmap_complete')
  assert.equal(batch.completedThisBatch, 2)
  assert.equal(state.sprints.S03.status, 'completed')
  assert.equal(state.sprints.S04.status, 'completed')
  const counts = invocationCounts(readInvocations(root))
  assert.equal(counts.S03, 2)
})

test('refuses to continue when independent verification fails after DONE', { timeout: 60_000 }, () => {
  const root = createFixture({ sprintCount: 5, completedCount: 2 })
  writeScenario(root, { default: 'complete' })
  const failVerify = path.join(root, 'scripts', 'fail-verify.mjs')
  fs.writeFileSync(failVerify, "console.error('[verify] forced verification failure')\nprocess.exit(1)\n", 'utf8')
  const result = runBatch(root, ['--max', '10', '--verify-command', failVerify])
  assert.notEqual(result.status, 0)
  const batch = readBatchState(root)
  const state = readJson(root, path.join('docs', 'roadmap', 'state.json'))
  assert.equal(batch.status, 'failed')
  assert.match(batch.stopReason, /VERIFICATION_FAILED/)
  assert.equal(state.sprints.S04.status, 'planned')
  const counts = invocationCounts(readInvocations(root))
  assert.equal(counts.S04, undefined)
})

test('rejects an unexpected extra completed sprint during verification', { timeout: 60_000 }, () => {
  const root = createFixture({ sprintCount: 5, completedCount: 2 })
  writeScenario(root, { sprints: { S03: ['complete_and_extra'] }, otherSprint: 'S04' })
  const result = runBatch(root, ['--max', '10'])
  assert.notEqual(result.status, 0)
  const batch = readBatchState(root)
  assert.equal(batch.status, 'failed')
  assert.match(batch.stopReason, /VERIFICATION_FAILED/)
  const counts = invocationCounts(readInvocations(root))
  assert.equal(counts.S04, undefined)
})

test('stops on HUMAN_REQUIRED and writes a machine-readable gate', { timeout: 60_000 }, () => {
  const root = createFixture({ sprintCount: 5, completedCount: 2 })
  writeScenario(root, {
    sprints: { S03: ['human'] },
    humanReasonCode: 'EXTERNAL_CREDENTIAL_REQUIRED',
    humanSummary: 'A real certificate must be trusted.',
    humanActions: ['trust the certificate'],
  })
  const result = runBatch(root, ['--max', '10'])
  assert.equal(result.status, 2)
  const batch = readBatchState(root)
  assert.equal(batch.status, 'human_required')
  const gate = readJson(root, path.join('docs', 'roadmap', 'autopilot', 'HUMAN_REQUIRED.json'))
  assert.equal(gate.reasonCode, 'EXTERNAL_CREDENTIAL_REQUIRED')
  assert.deepEqual(gate.requiredHumanActions, ['trust the certificate'])
  assert.equal(gate.batchId, batch.batchId)
  const state = readJson(root, path.join('docs', 'roadmap', 'state.json'))
  assert.equal(state.sprints.S04.status, 'planned')
  const counts = invocationCounts(readInvocations(root))
  assert.equal(counts.S04, undefined)
})

test('resumes an already active sprint instead of skipping it', { timeout: 60_000 }, () => {
  const root = createFixture({ sprintCount: 5, completedCount: 2, activeSprint: 'S03' })
  writeScenario(root, { default: 'complete' })
  const result = runBatch(root, ['--max', '10'])
  assert.equal(result.status, 0, result.stderr)
  const batch = readBatchState(root)
  const state = readJson(root, path.join('docs', 'roadmap', 'state.json'))
  assert.equal(batch.startSprint, 'S03')
  assert.equal(batch.status, 'roadmap_complete')
  assert.equal(state.sprints.S03.status, 'completed')
  const counts = invocationCounts(readInvocations(root))
  assert.equal(counts.S03, 1)
  assert.equal(counts.S04, 1)
})

test('stops on an unrelated dirty worktree without touching user files', { timeout: 60_000 }, () => {
  const root = createFixture({ sprintCount: 3, git: true })
  writeScenario(root, { default: 'complete' })
  const userFile = path.join(root, 'user-notes.txt')
  fs.writeFileSync(userFile, 'user work in progress\n', 'utf8')
  const result = runBatch(root, ['--max', '10'])
  assert.equal(result.status, 2)
  const batch = readBatchState(root)
  assert.equal(batch.status, 'human_required')
  const gate = readJson(root, path.join('docs', 'roadmap', 'autopilot', 'HUMAN_REQUIRED.json'))
  assert.equal(gate.reasonCode, 'UNRELATED_DIRTY_WORKTREE')
  assert.equal(fs.readFileSync(userFile, 'utf8'), 'user work in progress\n')
  assert.equal(readInvocations(root).length, 0)
  const state = readJson(root, path.join('docs', 'roadmap', 'state.json'))
  assert.equal(state.activeSprint, null)
  assert.equal(state.sprints.S01.status, 'planned')
})

test('stops with MERGE_CONFLICT when the repository has unmerged files', { timeout: 60_000 }, () => {
  const root = createFixture({ sprintCount: 3, git: true })
  writeScenario(root, { default: 'complete' })
  const conflictFile = path.join(root, 'conflict.txt')
  fs.writeFileSync(conflictFile, 'base\n', 'utf8')
  runGit(root, ['add', 'conflict.txt'])
  runGit(root, ['commit', '-q', '-m', 'add conflict base'])
  runGit(root, ['checkout', '-q', '-b', 'branch-a'])
  fs.writeFileSync(conflictFile, 'branch a\n', 'utf8')
  runGit(root, ['commit', '-q', '-am', 'branch a change'])
  runGit(root, ['checkout', '-q', 'main'])
  runGit(root, ['checkout', '-q', '-b', 'branch-b'])
  fs.writeFileSync(conflictFile, 'branch b\n', 'utf8')
  runGit(root, ['commit', '-q', '-am', 'branch b change'])
  runGit(root, ['merge', 'branch-a'])
  const result = runBatch(root, ['--max', '10'])
  assert.equal(result.status, 2)
  const gate = readJson(root, path.join('docs', 'roadmap', 'autopilot', 'HUMAN_REQUIRED.json'))
  assert.equal(gate.reasonCode, 'MERGE_CONFLICT')
  assert.equal(readInvocations(root).length, 0)
})

test('rejects a second batch while a live lock exists', { timeout: 60_000 }, () => {
  const root = createFixture({ sprintCount: 3 })
  writeScenario(root, { default: 'complete' })
  const autopilotDir = path.join(root, 'docs', 'roadmap', 'autopilot')
  fs.mkdirSync(autopilotDir, { recursive: true })
  fs.writeFileSync(
    path.join(autopilotDir, 'batch.lock'),
    `${JSON.stringify({ schemaVersion: '1.0', batchId: 'live-batch', pid: process.pid, createdAt: iso() }, null, 2)}\n`,
    'utf8',
  )
  const result = runBatch(root, ['--max', '10'])
  assert.equal(result.status, 6)
  assert.equal(readInvocations(root).length, 0)
  const statePath = path.join(root, 'docs', 'roadmap', 'state.json')
  assert.equal(readJson(root, path.join('docs', 'roadmap', 'state.json')).activeSprint, null)
  void statePath
})

test('recovers when a worker completed the sprint but the parent did not bookkeep', { timeout: 60_000 }, () => {
  const root = createFixture({ sprintCount: 5, completedCount: 3 })
  writeScenario(root, { default: 'complete' })
  writeBatchState(root, {
    schemaVersion: '1.0',
    batchId: 'recovery-batch',
    status: 'running',
    requestedMaxSprints: 10,
    completedThisBatch: 2,
    startedAt: iso(),
    updatedAt: iso(),
    startSprint: 'S01',
    currentSprint: 'S03',
    lastCompletedSprint: 'S02',
    stopReason: null,
    repairAttempts: 0,
    workerSessionId: null,
    lastEvidence: null,
    lastGreenCommit: null,
    expectedSprintId: 'S03',
    pendingCompletedBefore: ['S01', 'S02'],
    completedSprints: [
      { sprintId: 'S01', completedAt: iso(), attempt: 1, durationMs: 5, workerExitCode: 0 },
      { sprintId: 'S02', completedAt: iso(), attempt: 1, durationMs: 5, workerExitCode: 0 },
    ],
  })
  const result = spawnSync(
    process.execPath,
    [ORCHESTRATOR, 'run', '--root', root, '--worker', FAKE_WORKER, '--mode', 'resume', '--max', '10'],
    { encoding: 'utf8', windowsHide: true, timeout: 120_000 },
  )
  assert.equal(result.status, 0, `${result.stderr}\n${JSON.stringify(readBatchState(root))}`)
  const batch = readBatchState(root)
  assert.equal(batch.status, 'roadmap_complete')
  assert.equal(batch.completedThisBatch, 5)
  assert.deepEqual(batch.completedSprints.map((item) => item.sprintId), ['S01', 'S02', 'S03', 'S04', 'S05'])
  const counts = invocationCounts(readInvocations(root))
  assert.equal(counts.S03, undefined)
  assert.equal(counts.S04, 1)
})

test('recovers a worker that completed the sprint and then crashed', { timeout: 60_000 }, () => {
  const root = createFixture({ sprintCount: 4, completedCount: 2 })
  writeScenario(root, { sprints: { S03: ['complete_then_crash'] }, default: 'complete' })
  const result = runBatch(root, ['--max', '10'])
  assert.equal(result.status, 0, `${result.stderr}\n${JSON.stringify(readBatchState(root))}`)
  const batch = readBatchState(root)
  const state = readJson(root, path.join('docs', 'roadmap', 'state.json'))
  assert.equal(state.sprints.S03.status, 'completed')
  assert.equal(state.sprints.S04.status, 'completed')
  assert.equal(batch.status, 'roadmap_complete')
  const counts = invocationCounts(readInvocations(root))
  assert.equal(counts.S03, 1)
  assert.deepEqual(batch.completedSprints.map((item) => item.sprintId), ['S03', 'S04'])
})

test('stops gracefully when a STOP request is written between sprints', { timeout: 60_000 }, () => {
  const root = createFixture({ sprintCount: 5, completedCount: 2 })
  writeScenario(root, { sprints: { S03: ['complete_then_stop'] }, default: 'complete' })
  const result = runBatch(root, ['--max', '10'])
  assert.equal(result.status, 5)
  const batch = readBatchState(root)
  const state = readJson(root, path.join('docs', 'roadmap', 'state.json'))
  assert.equal(batch.status, 'stopped')
  assert.equal(state.sprints.S03.status, 'completed')
  assert.equal(state.sprints.S04.status, 'planned')
  const counts = invocationCounts(readInvocations(root))
  assert.equal(counts.S04, undefined)
})

test('stops on provider rate limit without completing the sprint', { timeout: 60_000 }, () => {
  const root = createFixture({ sprintCount: 4, completedCount: 2 })
  writeScenario(root, { sprints: { S03: ['quota'] } })
  const result = runBatch(root, ['--max', '10'])
  assert.equal(result.status, 3, `${result.stderr}\n${JSON.stringify(readBatchState(root))}`)
  const batch = readBatchState(root)
  const state = readJson(root, path.join('docs', 'roadmap', 'state.json'))
  assert.equal(batch.status, 'blocked_external')
  assert.match(batch.stopReason, /RATE_LIMIT/)
  assert.equal(state.sprints.S03.status, 'active')
  assert.equal(state.sprints.S04.status, 'planned')
})

test('stops when a worker times out', { timeout: 60_000 }, () => {
  const root = createFixture({ sprintCount: 4, completedCount: 2 })
  writeScenario(root, { sprints: { S03: ['timeout'] } })
  const result = runBatch(root, ['--max', '10', '--timeout', '800'])
  assert.equal(result.status, 4)
  const batch = readBatchState(root)
  assert.equal(batch.status, 'failed')
  assert.match(batch.stopReason, /WORKER_TIMEOUT/)
  const state = readJson(root, path.join('docs', 'roadmap', 'state.json'))
  assert.equal(state.sprints.S03.status, 'active')
  assert.equal(state.sprints.S04.status, 'planned')
})

test('dry run lists up to 10 sprints and mutates nothing', { timeout: 30_000 }, () => {
  const root = createFixture({ sprintCount: 12, completedCount: 2 })
  const roadmapBefore = fs.readFileSync(path.join(root, 'docs', 'roadmap', 'roadmap.json'), 'utf8')
  const stateBefore = fs.readFileSync(path.join(root, 'docs', 'roadmap', 'state.json'), 'utf8')
  const result = spawnSync(process.execPath, [ORCHESTRATOR, 'dry-run', '--root', root, '--max', '25'], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30_000,
  })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /clamped/i)
  const listed = result.stdout.split(/\r?\n/).filter((line) => /^S\d{2}( -|$)/.test(line))
  assert.equal(listed.length, 10)
  assert.equal(fs.readFileSync(path.join(root, 'docs', 'roadmap', 'roadmap.json'), 'utf8'), roadmapBefore)
  assert.equal(fs.readFileSync(path.join(root, 'docs', 'roadmap', 'state.json'), 'utf8'), stateBefore)
  assert.equal(fs.existsSync(path.join(root, 'docs', 'roadmap', 'autopilot')), false)
})

test('detached start launches a batch that watch can follow to completion', { timeout: 90_000 }, () => {
  const root = createFixture({ sprintCount: 5 })
  writeScenario(root, { default: 'complete' })
  const start = spawnSync(
    process.execPath,
    [ORCHESTRATOR, 'start', '--root', root, '--worker', FAKE_WORKER, '--max', '2'],
    { encoding: 'utf8', windowsHide: true, timeout: 60_000 },
  )
  assert.equal(start.status, 0, `${start.stdout}\n${start.stderr}`)
  assert.match(start.stdout, /is running with limit 2/)
  const watch = spawnSync(
    process.execPath,
    [ORCHESTRATOR, 'watch', '--root', root, '--interval', '300', '--watch-timeout', '60000'],
    { encoding: 'utf8', windowsHide: true, timeout: 90_000 },
  )
  assert.equal(watch.status, 0, watch.stdout)
  const batch = readBatchState(root)
  const state = readJson(root, path.join('docs', 'roadmap', 'state.json'))
  assert.equal(batch.status, 'completed')
  assert.equal(batch.requestedMaxSprints, 2)
  assert.equal(batch.completedThisBatch, 2)
  assert.equal(state.sprints.S02.status, 'completed')
  assert.equal(state.sprints.S03.status, 'planned')
  assert.equal(readInvocations(root).length, 2)
})

test('start refuses to launch while an unresolved human gate exists', { timeout: 30_000 }, () => {
  const root = createFixture({ sprintCount: 3 })
  const dir = path.join(root, 'docs', 'roadmap', 'autopilot')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'HUMAN_REQUIRED.json'),
    `${JSON.stringify({ schemaVersion: '1.0', reasonCode: 'HARDWARE_REQUIRED', summary: 'need hardware' }, null, 2)}\n`,
    'utf8',
  )
  const result = spawnSync(process.execPath, [ORCHESTRATOR, 'start', '--root', root, '--worker', FAKE_WORKER], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30_000,
  })
  assert.equal(result.status, 2)
  assert.match(result.stdout, /unresolved human gate/)
  assert.equal(readInvocations(root).length, 0)
  assert.equal(fs.existsSync(path.join(dir, 'HUMAN_REQUIRED.json')), true)
})

test('resolve-gate records the note and resume continues the blocked sprint', { timeout: 90_000 }, () => {
  const root = createFixture({ sprintCount: 4, completedCount: 2 })
  writeScenario(root, { sprints: { S03: ['human'] } })
  const first = runBatch(root, ['--max', '10'])
  assert.equal(first.status, 2)
  const gatePath = path.join(root, 'docs', 'roadmap', 'autopilot', 'HUMAN_REQUIRED.json')
  assert.equal(fs.existsSync(gatePath), true)

  const noReason = spawnSync(process.execPath, [ORCHESTRATOR, 'resolve-gate', '--root', root], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30_000,
  })
  assert.equal(noReason.status, 6)
  assert.equal(fs.existsSync(gatePath), true)

  const resolved = spawnSync(
    process.execPath,
    [ORCHESTRATOR, 'resolve-gate', '--root', root, '--reason', 'fixture human action completed and verified'],
    { encoding: 'utf8', windowsHide: true, timeout: 30_000 },
  )
  assert.equal(resolved.status, 0, resolved.stderr)
  assert.equal(fs.existsSync(gatePath), false)
  const history = readJson(root, path.join('docs', 'roadmap', 'autopilot', 'GATE_HISTORY.json'))
  assert.equal(history.resolved.length, 1)
  assert.equal(history.resolved[0].reasonCode, 'EXTERNAL_CREDENTIAL_REQUIRED')
  assert.equal(history.resolved[0].resolutionNote, 'fixture human action completed and verified')

  writeScenario(root, { default: 'complete' })
  const resumed = spawnSync(
    process.execPath,
    [ORCHESTRATOR, 'run', '--root', root, '--worker', FAKE_WORKER, '--mode', 'resume', '--max', '10'],
    { encoding: 'utf8', windowsHide: true, timeout: 60_000 },
  )
  assert.equal(resumed.status, 0, `${resumed.stderr}\n${JSON.stringify(readBatchState(root))}`)
  const batch = readBatchState(root)
  const state = readJson(root, path.join('docs', 'roadmap', 'state.json'))
  assert.equal(state.sprints.S03.status, 'completed')
  assert.equal(state.sprints.S04.status, 'completed')
  assert.equal(batch.status, 'roadmap_complete')
  assert.equal(batch.completedThisBatch, 2)
})
