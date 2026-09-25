#!/usr/bin/env node
/**
 * Fabrik3D bounded autonomous sprint batch orchestrator.
 *
 * This script owns the batch state machine. It never replaces the atomic
 * `scripts/sprint-runner.mjs`; it only decides WHEN that runner may activate or
 * complete a sprint, supervises one fresh worker per sprint, verifies the
 * resulting repository state independently, and bounds a batch to
 * MAX_BATCH_SPRINTS successful completions.
 *
 * See docs/roadmap/AUTOPILOT.md for the operating contract.
 */

import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_WORKER_MODULE = path.join(SCRIPT_DIR, 'opencode-sprint-worker.mjs')
const DEFAULT_VERIFY_SCRIPT = path.join(SCRIPT_DIR, 'verify-sprint-gates.mjs')

export const SCHEMA_VERSION = '1.0'
export const MAX_BATCH_SPRINTS = 10
export const MAX_REPAIR_ATTEMPTS = 3
export const DEFAULT_WORKER_TIMEOUT_MS = 2 * 60 * 60 * 1000
export const HARD_TIMEOUT_GRACE_MS = 2 * 60 * 1000
export const DEFAULT_WATCH_INTERVAL_MS = 30_000
export const DEFAULT_WATCH_TIMEOUT_MS = 5 * 60 * 1000
export const MAX_LOG_BYTES = 20 * 1024 * 1024
export const STALE_LOCK_MS = 12 * 60 * 60 * 1000

export const TERMINAL_STATUSES = new Set([
  'human_required',
  'blocked_external',
  'failed',
  'stopped',
  'max_reached',
  'roadmap_complete',
  'completed',
])

export const BATCH_STATUSES = new Set(['idle', 'running', 'validating', ...TERMINAL_STATUSES])

export const HUMAN_REASON_CODES = [
  'EXTERNAL_CREDENTIAL_REQUIRED',
  'SECRET_REQUIRED',
  'LICENSE_ACCEPTANCE_REQUIRED',
  'HARDWARE_REQUIRED',
  'EXTERNAL_SOFTWARE_INTERACTION',
  'VISUAL_HUMAN_APPROVAL_REQUIRED',
  'ARCHITECTURAL_DECISION_REQUIRED',
  'DESTRUCTIVE_ACTION_APPROVAL',
  'PRODUCTION_DEPLOYMENT_APPROVAL',
  'UNRELATED_DIRTY_WORKTREE',
  'MERGE_CONFLICT',
  'MANUAL_CERTIFICATE_TRUST',
  'MISSING_DEPENDENCY_REQUIRES_ADMIN',
  'UNRESOLVED_TEST_FAILURE',
  'RATE_LIMIT',
  'PROVIDER_QUOTA',
  'TOOL_FAILURE',
  'ROADMAP_STATE_INCONSISTENT',
  'OTHER',
]

const RATE_LIMIT_PATTERNS = [
  /rate[\s_-]?limit/i,
  /too many requests/i,
  /\b429\b/,
  /resource_exhausted/i,
]
const QUOTA_PATTERNS = [/quota/i, /insufficient_quota/i, /capacity/i, /out of credits/i, /billing/i]
const AUTH_PATTERNS = [/unauthorized/i, /\b401\b/, /authentication (expired|failed|required)/i, /invalid api key/i]
const TRANSIENT_PATTERNS = [
  /ECONNRESET/,
  /ETIMEDOUT/,
  /EAI_AGAIN/,
  /ECONNREFUSED/,
  /socket hang up/i,
  /fetch failed/i,
  /\b50[234]\b/,
  /temporarily unavailable/i,
  /upstream/i,
]

const AUTOPILOT_RELATIVE_DIR = path.join('docs', 'roadmap', 'autopilot')

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

export function nowIso() {
  return new Date().toISOString()
}

export function makeBatchId(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
  ].join('-') + '-' + [pad(date.getUTCHours()), pad(date.getUTCMinutes()), pad(date.getUTCSeconds())].join('')
}

export function clampMaxSprints(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed) || parsed < 1) return { value: MAX_BATCH_SPRINTS, clamped: false, requested: null }
  if (parsed > MAX_BATCH_SPRINTS) return { value: MAX_BATCH_SPRINTS, clamped: true, requested: parsed }
  return { value: parsed, clamped: false, requested: parsed }
}

export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.has(status)
}

export function parseArgs(argv) {
  const first = argv[0]
  const command = first && !first.startsWith('--') ? first : 'help'
  const rest = command === 'help' ? (first ? argv.slice(1) : []) : argv.slice(1)
  const flags = {}
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index]
    if (!token.startsWith('--')) continue
    const name = token.slice(2)
    const next = rest[index + 1]
    if (next !== undefined && !next.startsWith('--')) {
      flags[name] = next
      index += 1
    } else {
      flags[name] = true
    }
  }
  return { command, flags }
}

export function defaultBatchState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    batchId: null,
    status: 'idle',
    requestedMaxSprints: MAX_BATCH_SPRINTS,
    completedThisBatch: 0,
    startedAt: null,
    updatedAt: null,
    startSprint: null,
    currentSprint: null,
    lastCompletedSprint: null,
    stopReason: null,
    repairAttempts: 0,
    workerSessionId: null,
    lastEvidence: null,
    lastGreenCommit: null,
    expectedSprintId: null,
    pendingCompletedBefore: null,
    completedSprints: [],
  }
}

function readJsonSafe(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf8')
    return { ok: true, value: JSON.parse(text) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  fs.renameSync(temporary, filePath)
}

function removeIfExists(filePath) {
  try {
    fs.rmSync(filePath, { force: true })
  } catch {
    // best effort
  }
}

function truncate(text, limit = 4000) {
  if (typeof text !== 'string') return ''
  return text.length <= limit ? text : `${text.slice(0, limit)}… [truncated]`
}

export function autopilotPaths(root) {
  const dir = path.join(root, AUTOPILOT_RELATIVE_DIR)
  return {
    dir,
    state: path.join(dir, 'state.json'),
    humanGate: path.join(dir, 'HUMAN_REQUIRED.json'),
    gateHistory: path.join(dir, 'GATE_HISTORY.json'),
    stop: path.join(dir, 'STOP'),
    lock: path.join(dir, 'batch.lock'),
    logs: path.join(dir, 'logs'),
    workerResult: path.join(dir, 'worker-result.json'),
    workerPrompt: path.join(dir, 'WORKER_PROMPT.md'),
    workerScript: path.join(root, 'scripts', 'sprint-runner.mjs'),
  }
}

export function loadBatchState(paths) {
  const read = readJsonSafe(paths.state)
  if (!read.ok || typeof read.value !== 'object' || read.value === null) return defaultBatchState()
  return { ...defaultBatchState(), ...read.value }
}

export function saveBatchState(paths, batch) {
  batch.updatedAt = nowIso()
  writeJsonAtomic(paths.state, batch)
}

export function readRoadmapAndState(root) {
  const roadmap = readJsonSafe(path.join(root, 'docs', 'roadmap', 'roadmap.json'))
  const state = readJsonSafe(path.join(root, 'docs', 'roadmap', 'state.json'))
  return { roadmap, state }
}

export function completedIds(state) {
  const sprints = state?.sprints ?? {}
  return Object.keys(sprints).filter((id) => sprints[id]?.status === 'completed').sort()
}

/**
 * Deterministic projection of the sprint sequence a bounded batch would run.
 * Never mutates roadmap or state.
 */
export function selectSprintSequence(roadmap, state, limit) {
  const sequence = []
  if (!roadmap || !Array.isArray(roadmap.sprints)) return sequence
  const statusOf = (id) => state?.sprints?.[id]?.status ?? 'planned'
  const simulatedCompleted = new Set(completedIds(state))
  if (state?.activeSprint && simulatedCompleted.has(state.activeSprint) === false) {
    if (state.activeSprint in (state.sprints ?? {})) {
      sequence.push(state.activeSprint)
      simulatedCompleted.add(state.activeSprint)
    }
  }
  for (const sprint of roadmap.sprints) {
    if (sequence.length >= limit) break
    if (simulatedCompleted.has(sprint.id)) continue
    if (statusOf(sprint.id) === 'completed') continue
    const dependencies = Array.isArray(sprint.dependsOn) ? sprint.dependsOn : []
    const unmet = dependencies.filter((dependency) => !simulatedCompleted.has(dependency))
    if (unmet.length > 0) continue
    sequence.push(sprint.id)
    simulatedCompleted.add(sprint.id)
  }
  return sequence
}

// ---------------------------------------------------------------------------
// Git safety
// ---------------------------------------------------------------------------

const ALLOWED_DIRTY_PREFIXES = [
  'docs/roadmap/autopilot/',
  'docs/roadmap/state.json',
  'docs/roadmap/CURRENT_SPRINT.md',
]

export function gitStatus(root) {
  const result = spawnSync('git', ['-C', root, 'status', '--porcelain=v1', '--untracked-files=all'], {
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.error || result.status !== 0) {
    return { available: false, entries: [], error: truncate(result.error?.message ?? result.stderr ?? 'git status failed', 500) }
  }
  const entries = result.stdout
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => ({ code: line.slice(0, 2), file: line.slice(3).replaceAll('\\', '/').trim() }))
  return { available: true, entries, error: null }
}

export function hasMergeConflict(entries) {
  return entries.some((entry) => /^(DD|AU|UD|UA|DU|AA|UU)$/.test(entry.code))
}

function isAllowedDirtyFile(file) {
  return ALLOWED_DIRTY_PREFIXES.some((prefix) => file === prefix || file.startsWith(prefix))
}

export function findUnrelatedDirtyFiles(entries, expectedPaths = []) {
  const expected = new Set(expectedPaths)
  return entries
    .filter((entry) => !isAllowedDirtyFile(entry.file) && !expected.has(entry.file))
    .map((entry) => `${entry.code} ${entry.file}`)
}

// ---------------------------------------------------------------------------
// Lock
// ---------------------------------------------------------------------------

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

export function readLock(paths) {
  const read = readJsonSafe(paths.lock)
  return read.ok ? read.value : null
}

export function acquireLock(paths, batchId, log = () => {}) {
  const existing = readLock(paths)
  if (existing) {
    const alive = isPidAlive(existing.pid)
    const sameOwner = Number(existing.pid) === process.pid
    if (alive && !sameOwner) {
      return {
        ok: false,
        reason: `another batch is already running (batchId=${existing.batchId ?? 'unknown'}, pid=${existing.pid}, created=${existing.createdAt ?? 'unknown'})`,
      }
    }
    const ageMs = Date.now() - Date.parse(existing.createdAt ?? '') || Number.POSITIVE_INFINITY
    const stale = !alive || ageMs > STALE_LOCK_MS
    log(`[lock] reclaiming ${stale ? 'stale ' : ''}lock from pid ${existing.pid} (batch ${existing.batchId ?? 'unknown'})`)
  }
  const lock = { schemaVersion: SCHEMA_VERSION, batchId, pid: process.pid, host: process.env.COMPUTERNAME ?? null, createdAt: nowIso() }
  writeJsonAtomic(paths.lock, lock)
  return { ok: true, lock }
}

export function releaseLock(paths, batchId) {
  const existing = readLock(paths)
  if (existing && existing.batchId === batchId) removeIfExists(paths.lock)
}

// ---------------------------------------------------------------------------
// Human gate + stop file
// ---------------------------------------------------------------------------

export function readHumanGate(paths) {
  const read = readJsonSafe(paths.humanGate)
  return read.ok ? read.value : null
}

export function writeHumanGate(paths, gate) {
  writeJsonAtomic(paths.humanGate, {
    schemaVersion: SCHEMA_VERSION,
    batchId: gate.batchId ?? null,
    sprintId: gate.sprintId ?? null,
    reasonCode: gate.reasonCode,
    summary: gate.summary,
    requiredHumanActions: gate.requiredHumanActions ?? [],
    safeToResume: gate.safeToResume !== false,
    createdAt: nowIso(),
  })
}

export function stopRequested(paths) {
  return fs.existsSync(paths.stop)
}

export function clearStop(paths, log = () => {}) {
  if (!stopRequested(paths)) return
  removeIfExists(paths.stop)
  log('[stop] cleared an existing manual STOP request because an explicit batch start/resume was requested')
}

// ---------------------------------------------------------------------------
// Worker result contract
// ---------------------------------------------------------------------------

function normalizeWorkerResult(value) {
  if (!value || typeof value !== 'object') return null
  const allowedResults = new Set(['DONE', 'HUMAN_REQUIRED', 'BLOCKED', 'FAILED'])
  if (!allowedResults.has(value.result)) return null
  return {
    schemaVersion: value.schemaVersion ?? SCHEMA_VERSION,
    batchId: value.batchId ?? null,
    sprintId: value.sprintId ?? null,
    attempt: Number.isInteger(value.attempt) ? value.attempt : null,
    result: value.result,
    roadmapState: typeof value.roadmapState === 'string' ? value.roadmapState : null,
    mandatoryGatesPassed: value.mandatoryGatesPassed === true,
    tests: Array.isArray(value.tests) ? value.tests : [],
    builds: Array.isArray(value.builds) ? value.builds : [],
    humanRequired: value.humanRequired === true || value.result === 'HUMAN_REQUIRED',
    blocker: typeof value.blocker === 'string' ? value.blocker : null,
    reasonCode: typeof value.reasonCode === 'string' ? value.reasonCode : null,
    summary: typeof value.summary === 'string' ? value.summary : null,
    requiredHumanActions: Array.isArray(value.requiredHumanActions)
      ? value.requiredHumanActions.filter((item) => typeof item === 'string')
      : [],
    notes: Array.isArray(value.notes) ? value.notes.filter((item) => typeof item === 'string') : [],
  }
}

export function readWorkerResult(paths, batchId, sprintId) {
  const read = readJsonSafe(paths.workerResult)
  if (read.ok) {
    const normalized = normalizeWorkerResult(read.value)
    if (normalized) {
      return {
        value: normalized,
        error:
          normalized.sprintId && normalized.sprintId !== sprintId
            ? `worker result reported sprint ${normalized.sprintId} but ${sprintId} was expected`
            : normalized.batchId && batchId && normalized.batchId !== batchId
              ? `worker result batchId ${normalized.batchId} does not match batch ${batchId}`
              : null,
      }
    }
    return { value: null, error: 'worker-result.json is not a valid result payload' }
  }
  return { value: null, error: read.error }
}

export function classifyScanText(text) {
  if (!text) return null
  if (RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(text))) return 'RATE_LIMIT'
  if (QUOTA_PATTERNS.some((pattern) => pattern.test(text))) return 'PROVIDER_QUOTA'
  if (AUTH_PATTERNS.some((pattern) => pattern.test(text))) return 'TOOL_FAILURE'
  return null
}

export function isTransientText(text) {
  if (!text) return false
  return TRANSIENT_PATTERNS.some((pattern) => pattern.test(text))
}

export function readLogTail(filePath, maxBytes = 16 * 1024) {
  try {
    const stat = fs.statSync(filePath)
    const start = Math.max(0, stat.size - maxBytes)
    const descriptor = fs.openSync(filePath, 'r')
    const buffer = Buffer.alloc(stat.size - start)
    fs.readSync(descriptor, buffer, 0, buffer.length, start)
    fs.closeSync(descriptor)
    return buffer.toString('utf8')
  } catch {
    return ''
  }
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function createLogger(paths, { quiet = false } = {}) {
  fs.mkdirSync(paths.logs, { recursive: true })
  const filePath = path.join(paths.logs, 'orchestrator.log')
  let stream = null
  try {
    const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null
    if (stat && stat.size > MAX_LOG_BYTES) {
      fs.renameSync(filePath, `${filePath}.old`)
    }
    stream = fs.createWriteStream(filePath, { flags: 'a' })
  } catch {
    stream = null
  }
  const log = (message) => {
    const line = String(message)
    if (!quiet) console.log(line)
    if (stream) {
      try {
        if (stream.bytesWritten < MAX_LOG_BYTES) stream.write(`${line}\n`)
      } catch {
        // ignore log write failures
      }
    }
  }
  log.close = () => {
    try {
      stream?.end()
    } catch {
      // ignore
    }
  }
  return log
}

// ---------------------------------------------------------------------------
// Process helpers
// ---------------------------------------------------------------------------

function runNodeScript(root, script, args, { timeout = 10 * 60 * 1000 } = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout,
    windowsHide: true,
  })
  return {
    status: result.error ? null : result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error ? truncate(result.error.message, 500) : null,
  }
}

export function killProcessTree(pid, log = () => {}) {
  if (!Number.isInteger(pid) || pid <= 0) return
  if (process.platform === 'win32') {
    try {
      spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
    } catch {
      // ignore
    }
    return
  }
  try {
    process.kill(-pid, 'SIGKILL')
  } catch {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      log(`[kill] unable to kill process ${pid}`)
    }
  }
}

function waitForChild(child) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    child.on('error', (error) => finish({ code: null, spawnError: error.message }))
    child.on('close', (code) => finish({ code, spawnError: null }))
  })
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

function resolveOptions(flags) {
  const root = path.resolve(flags.root ?? process.cwd())
  const clamp = clampMaxSprints(flags.max ?? MAX_BATCH_SPRINTS)
  const timeoutRaw = Number.parseInt(String(flags.timeout ?? process.env.FABRIK3D_WORKER_TIMEOUT_MS ?? DEFAULT_WORKER_TIMEOUT_MS), 10)
  const workerTimeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : DEFAULT_WORKER_TIMEOUT_MS
  const workerModule = path.resolve(flags.worker ?? DEFAULT_WORKER_MODULE)
  const verifyScript = path.resolve(flags['verify-command'] ?? DEFAULT_VERIFY_SCRIPT)
  const watchIntervalRaw = Number.parseInt(String(flags.interval ?? DEFAULT_WATCH_INTERVAL_MS), 10)
  const watchTimeoutRaw = Number.parseInt(String(flags['watch-timeout'] ?? DEFAULT_WATCH_TIMEOUT_MS), 10)
  return {
    root,
    foreground: flags.foreground === true,
    verbose: flags.verbose === true,
    maxSprints: clamp.value,
    maxClampedFrom: clamp.clamped ? clamp.requested : null,
    workerModule,
    verifyScript,
    workerTimeoutMs,
    agent: typeof flags.agent === 'string' ? flags.agent : process.env.FABRIK3D_SPRINT_AGENT ?? 'sprint-worker',
    model: typeof flags.model === 'string' ? flags.model : process.env.FABRIK3D_SPRINT_MODEL ?? null,
    watchIntervalMs: Number.isFinite(watchIntervalRaw) && watchIntervalRaw > 0 ? watchIntervalRaw : DEFAULT_WATCH_INTERVAL_MS,
    watchTimeoutMs: Number.isFinite(watchTimeoutRaw) && watchTimeoutRaw > 0 ? watchTimeoutRaw : DEFAULT_WATCH_TIMEOUT_MS,
    reason: typeof flags.reason === 'string' ? flags.reason : null,
    mode: typeof flags.mode === 'string' ? flags.mode : 'auto',
    batchId: typeof flags['batch-id'] === 'string' ? flags['batch-id'] : null,
  }
}

function makeContext(options) {
  const paths = autopilotPaths(options.root)
  const log = createLogger(paths, { quiet: options.foreground ? false : process.env.FABRIK3D_BATCH_CHILD === '1' })
  return { options, root: options.root, paths, log }
}

function makeReadOnlyContext(options) {
  const paths = autopilotPaths(options.root)
  return { options, root: options.root, paths, log: (message) => console.log(String(message)) }
}

function sprintRunner(root, command, args = []) {
  return runNodeScript(root, path.join(root, 'scripts', 'sprint-runner.mjs'), [command, ...args])
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

async function verifySprint(ctx, sprintId, completedBefore, workerRun) {
  const errors = []
  const { root, paths, log, options } = ctx
  const { roadmap, state } = readRoadmapAndState(root)
  if (!roadmap.ok) errors.push(`roadmap.json unreadable: ${roadmap.error}`)
  if (!state.ok) errors.push(`state.json unreadable: ${state.error}`)
  if (!roadmap.ok || !state.ok) return { ok: false, errors }

  const entry = state.value.sprints?.[sprintId]
  if (!entry || entry.status !== 'completed') {
    errors.push(`expected sprint ${sprintId} is not marked completed`)
  } else {
    if (!entry.summary) errors.push(`${sprintId} completed without a summary`)
    if (!entry.evidence) errors.push(`${sprintId} completed without evidence`)
    if (!entry.completedAt) errors.push(`${sprintId} completed without completedAt`)
  }
  if (state.value.activeSprint) errors.push(`an active sprint remains: ${state.value.activeSprint}`)

  const nowCompleted = completedIds(state.value)
  const added = nowCompleted.filter((id) => !completedBefore.includes(id))
  if (added.length !== 1 || added[0] !== sprintId) {
    errors.push(`expected exactly one new completed sprint (${sprintId}); observed: ${added.join(', ') || 'none'}`)
  }
  const lost = completedBefore.filter((id) => !nowCompleted.includes(id))
  if (lost.length > 0) errors.push(`previously completed sprints changed status: ${lost.join(', ')}`)

  const known = new Set((roadmap.value.sprints ?? []).map((sprint) => sprint.id))
  if (!known.has(sprintId)) errors.push(`${sprintId} is not part of the roadmap`)

  const currentPath = path.join(root, 'docs', 'roadmap', 'CURRENT_SPRINT.md')
  if (fs.existsSync(currentPath)) {
    const text = fs.readFileSync(currentPath, 'utf8')
    if (!text.includes('No active sprint')) errors.push('CURRENT_SPRINT.md still reports an active sprint')
  }

  if (!workerRun?.result && !workerRun?.recovered) {
    errors.push('worker did not report a DONE result')
  } else if (!workerRun?.recovered) {
    if (workerRun.result.result !== 'DONE') errors.push('worker did not report a DONE result')
    if (workerRun.result.mandatoryGatesPassed !== true) errors.push('worker reported failing mandatory gates')
    if (workerRun.result.humanRequired) errors.push('worker reported humanRequired=true')
  }

  if (readHumanGate(paths)) errors.push('a HUMAN_REQUIRED gate exists for this sprint')

  const git = gitStatus(root)
  if (git.available && hasMergeConflict(git.entries)) errors.push('git repository has unresolved merge conflicts')

  if (errors.length === 0 && options.verifyScript && fs.existsSync(options.verifyScript)) {
    const verification = runNodeScript(root, options.verifyScript, ['--root', root, '--sprint', sprintId])
    if (verification.status !== 0) {
      errors.push(`independent verification script failed: ${truncate(`${verification.stdout}\n${verification.stderr}`.trim(), 1000)}`)
    }
  } else if (errors.length === 0) {
    errors.push(`verification script not found: ${options.verifyScript}`)
  }

  if (errors.length > 0) {
    for (const error of errors) log(`[verify] ${sprintId}: ${error}`)
    return { ok: false, errors }
  }
  log(`[verify] ${sprintId}: independent verification passed`)
  return { ok: true, errors: [] }
}

// ---------------------------------------------------------------------------
// Worker execution
// ---------------------------------------------------------------------------

async function launchWorkerOnce(ctx, sprintId, attempt) {
  const { root, paths, options, batch, log } = ctx
  const attemptNumber = attempt + 1
  const logFile = path.join(paths.logs, `${batch.batchId}-${sprintId}-attempt${attemptNumber}.log`)
  const resultFile = paths.workerResult
  removeIfExists(resultFile)

  const args = [
    options.workerModule,
    '--root', root,
    '--sprint', sprintId,
    '--attempt', String(attemptNumber),
    '--max-attempts', String(MAX_REPAIR_ATTEMPTS + 1),
    '--batch-id', batch.batchId,
    '--max-sprints', String(batch.requestedMaxSprints),
    '--prompt-file', paths.workerPrompt,
    '--result-file', resultFile,
    '--log-file', logFile,
    '--timeout-ms', String(options.workerTimeoutMs),
    '--title', `Fabrik3D ${sprintId} (batch ${batch.batchId})`,
  ]
  if (options.agent) args.push('--agent', options.agent)
  if (options.model) args.push('--model', options.model)

  const startedAt = Date.now()
  log(`[worker] launching ${sprintId} attempt ${attemptNumber}/${MAX_REPAIR_ATTEMPTS + 1}`)
  const child = spawn(process.execPath, args, {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    detached: process.platform !== 'win32',
  })

  const captured = []
  const capture = (text) => {
    captured.push(text)
    const joined = captured.join('')
    if (joined.length > 32_768) captured.splice(0, captured.length, joined.slice(-32_768))
  }
  const forward = (chunk, streamName) => {
    const text = chunk.toString()
    capture(text)
    for (const line of text.split(/\r?\n/)) {
      if (line.trim() !== '' && options.verbose) log(`[worker:${streamName}] ${line}`)
    }
  }
  child.stdout?.on('data', (chunk) => forward(chunk, 'out'))
  child.stderr?.on('data', (chunk) => forward(chunk, 'err'))

  let timedOut = false
  const graceMs = Math.min(HARD_TIMEOUT_GRACE_MS, Math.max(1000, Math.round(options.workerTimeoutMs * 0.1)))
  const hardTimeout = setTimeout(() => {
    timedOut = true
    log(`[worker] ${sprintId} exceeded the ${options.workerTimeoutMs} ms timeout; terminating the worker process tree`)
    killProcessTree(child.pid, log)
  }, options.workerTimeoutMs + graceMs)

  const outcome = await waitForChild(child)
  clearTimeout(hardTimeout)
  const durationMs = Date.now() - startedAt

  const { roadmap, state } = readRoadmapAndState(root)
  const stateCompleted = Boolean(
    state.ok && state.value.sprints?.[sprintId]?.status === 'completed' && !state.value.activeSprint,
  )
  const result = readWorkerResult(paths, batch.batchId, sprintId)
  let resultValue = result.value
  if (!resultValue) {
    const tail = readLogTail(logFile)
    const sentinelMatch = /FABRIK3D_WORKER_RESULT:\s*(\{[\s\S]*\})/.exec(tail)
    if (sentinelMatch) {
      try {
        resultValue = normalizeWorkerResult(JSON.parse(sentinelMatch[1]))
      } catch {
        resultValue = null
      }
    }
  }
  const fileTail = readLogTail(logFile)
  const logTail = fileTail.trim() !== '' ? fileTail : captured.join('')

  log(`[worker] ${sprintId} attempt ${attemptNumber} finished: exit=${outcome.code ?? 'spawn-error'} duration=${Math.round(durationMs / 1000)}s completed=${stateCompleted}`)

  return {
    sprintId,
    attempt: attemptNumber,
    exitCode: outcome.code,
    spawnError: outcome.spawnError,
    timedOut,
    durationMs,
    result: resultValue,
    resultError: result.error,
    logFile,
    logTail,
    stateCompleted,
    roadmapOk: roadmap.ok,
    stateOk: state.ok,
  }
}

async function launchWorker(ctx, sprintId, repairAttempts) {
  const { log } = ctx
  const transientRetries = 2
  for (let transientAttempt = 0; transientAttempt <= transientRetries; transientAttempt += 1) {
    const run = await launchWorkerOnce(ctx, sprintId, repairAttempts)
    if (run.stateCompleted) return { ...run, transientAttempt }
    const scanned = scanRunForExternalFailure(run)
    if (!scanned || scanned.kind !== 'TRANSIENT' || transientAttempt >= transientRetries) {
      return { ...run, transientAttempt }
    }
    const backoffMs = transientAttempt === 0 ? 5000 : 15000
    log(`[worker] transient infrastructure failure detected; retrying in ${backoffMs} ms (${transientAttempt + 1}/${transientRetries})`)
    if (stopRequested(ctx.paths)) return { ...run, transientAttempt }
    await sleep(backoffMs)
  }
  return null
}

function scanRunForExternalFailure(run) {
  const text = `${run.logTail}\n${run.resultError ?? ''}\n${run.result?.blocker ?? ''}\n${run.result?.notes?.join('\n') ?? ''}`
  if (run.exitCode === 98) {
    return { kind: 'HUMAN_REQUIRED', reasonCode: 'TOOL_FAILURE', summary: 'The OpenCode CLI could not be executed by the sprint worker.' }
  }
  if (run.exitCode === 99) {
    return { kind: 'HUMAN_REQUIRED', reasonCode: 'TOOL_FAILURE', summary: 'The sprint worker prompt file is missing or invalid.' }
  }
  const external = classifyScanText(text)
  if (external === 'RATE_LIMIT' || external === 'PROVIDER_QUOTA') {
    return { kind: 'BLOCKED_EXTERNAL', reasonCode: external }
  }
  if (external === 'TOOL_FAILURE') {
    return { kind: 'BLOCKED_EXTERNAL', reasonCode: 'TOOL_FAILURE' }
  }
  if (run.timedOut || run.exitCode === 97) {
    return { kind: 'TIMEOUT', reasonCode: 'TOOL_FAILURE' }
  }
  if (isTransientText(text)) return { kind: 'TRANSIENT', reasonCode: 'TOOL_FAILURE' }
  return null
}

// ---------------------------------------------------------------------------
// Batch loop
// ---------------------------------------------------------------------------

function printProgress(log, batch, sprintId, label, extra = '') {
  const counter = `${Math.min(batch.completedThisBatch + (label === 'RUNNING' ? 1 : 0), batch.requestedMaxSprints)}/${batch.requestedMaxSprints}`
  log(`[${counter}] ${sprintId} — ${label}${extra ? ` (${extra})` : ''}`)
}

function printBatchReport(ctx, batch) {
  const { log, root } = ctx
  const { roadmap, state } = readRoadmapAndState(root)
  log('')
  log('Fabrik3D autonomous sprint batch finished')
  log('')
  log(`Batch ID: ${batch.batchId ?? 'none'}`)
  log(`Status: ${batch.status}`)
  log(`Completed: ${batch.completedThisBatch}/${batch.requestedMaxSprints}`)
  const completed = batch.completedSprints ?? []
  if (completed.length > 0) {
    log('')
    log('Completed:')
    for (const item of completed) log(`  ${item.sprintId} (${item.durationMs ? `${Math.round(item.durationMs / 1000)}s` : 'unknown duration'})`)
  }
  if (batch.stopReason) {
    log('')
    log(`Reason: ${batch.stopReason}`)
  }
  const nextSprint = selectSprintSequence(roadmap.value ?? {}, state.value ?? {}, 1)[0] ?? null
  if (batch.status === 'human_required') {
    const gate = readHumanGate(ctx.paths)
    if (gate) {
      log('')
      log(`Human gate: ${gate.reasonCode} — ${gate.summary}`)
      if (Array.isArray(gate.requiredHumanActions) && gate.requiredHumanActions.length > 0) {
        log('Required actions:')
        for (const action of gate.requiredHumanActions) log(`  - ${action}`)
      }
      log('Next action: perform the actions above, then run /resolve-sprint-gate (or npm run sprint:batch:resolve-gate -- --reason "...")')
    }
  }
  if (batch.status === 'max_reached') {
    log('')
    log(`Batch limit reached successfully (${batch.completedThisBatch}/${batch.requestedMaxSprints}).`)
    log('Autopilot intentionally stopped for human product review.')
  }
  if (state.value?.activeSprint) {
    log('')
    log(`Repository state: ${state.value.activeSprint} remains active and NOT completed.`)
  } else if (nextSprint) {
    log('')
    log(`Repository state: no active sprint; next roadmap sprint is ${nextSprint}.`)
  }
  log('')
}

function finalizeBatch(ctx, batch, status, stopReason) {
  batch.status = status
  batch.stopReason = stopReason
  batch.currentSprint = null
  batch.expectedSprintId = null
  batch.pendingCompletedBefore = null
  saveBatchState(ctx.paths, batch)
  ctx.log(`[batch] stopped: status=${status} reason=${stopReason}`)
  printBatchReport(ctx, batch)
  return status
}

function humanGateFromWorker(run, batch, sprintId) {
  const result = run.result ?? {}
  const reasonCode = HUMAN_REASON_CODES.includes(result.reasonCode) ? result.reasonCode : 'OTHER'
  return {
    batchId: batch.batchId,
    sprintId,
    reasonCode,
    summary: result.summary ?? result.blocker ?? `Worker requested human intervention for ${sprintId}.`,
    requiredHumanActions:
      result.requiredHumanActions.length > 0
        ? result.requiredHumanActions
        : ['Review the worker result and complete the required action, then run /resolve-sprint-gate.'],
    safeToResume: true,
  }
}

function bookkeepCompletion(ctx, batch, sprintId, entry, { attempt = 1, durationMs = 0, workerExitCode = null } = {}) {
  batch.completedThisBatch += 1
  batch.lastCompletedSprint = sprintId
  batch.lastEvidence = truncate(entry.evidence, 2000)
  batch.completedSprints = [
    ...(batch.completedSprints ?? []),
    {
      sprintId,
      completedAt: entry.completedAt ?? nowIso(),
      attempt,
      durationMs,
      workerExitCode,
    },
  ]
  batch.repairAttempts = 0
  batch.currentSprint = null
  batch.expectedSprintId = null
  batch.pendingCompletedBefore = null
  batch.status = 'running'
  saveBatchState(ctx.paths, batch)
  printProgress(ctx.log, batch, sprintId, 'COMPLETED', `${Math.round(durationMs / 1000)}s`)
  ctx.log(`[batch] completed ${batch.completedThisBatch}/${batch.requestedMaxSprints} (${sprintId})`)
}

async function runBatchCore(ctx) {
  const { paths, root, log, options } = ctx
  let batch = loadBatchState(paths)
  const effectiveBatchId =
    options.mode === 'fresh' ? (options.batchId ?? makeBatchId()) : (batch.batchId ?? options.batchId ?? makeBatchId())
  const lock = acquireLock(paths, effectiveBatchId, log)
  if (!lock.ok) {
    log(`[batch] refusing to start: ${lock.reason}`)
    return { status: 'lock_conflict', exitCode: 6 }
  }
  if (options.mode === 'fresh') {
    batch = defaultBatchState()
    batch.batchId = lock.lock.batchId
    batch.status = 'validating'
    batch.requestedMaxSprints = options.maxSprints
    batch.startedAt = nowIso()
    if (options.maxClampedFrom) batch.maxClampedFrom = options.maxClampedFrom
  }
  batch.batchId = lock.lock.batchId
  ctx.batch = batch

  let result
  try {
    if (options.maxClampedFrom) {
      log(`[batch] requested --max ${options.maxClampedFrom} was clamped to the hard maximum of ${MAX_BATCH_SPRINTS} completed sprints.`)
    }
    batch.status = 'validating'
    batch.updatedAt = nowIso()
    saveBatchState(paths, batch)

    const preflight = preflightCheck(ctx, batch)
    if (preflight.blocked) {
      result = finalizeBatch(ctx, batch, preflight.status, preflight.stopReason)
      return { status: result, exitCode: preflight.exitCode ?? 2 }
    }

    batch.status = 'running'
    batch.updatedAt = nowIso()
    if (!batch.startedAt) batch.startedAt = nowIso()
    if (!batch.startSprint) {
      const { roadmap, state } = readRoadmapAndState(root)
      batch.startSprint = state.ok && state.value.activeSprint
        ? state.value.activeSprint
        : selectSprintSequence(roadmap.value ?? {}, state.value ?? {}, 1)[0] ?? null
    }
    saveBatchState(paths, batch)
    log(`[batch] running batch ${batch.batchId} (limit ${batch.requestedMaxSprints}, start ${batch.startSprint ?? 'none'})`)

    while (true) {
      if (isTerminalStatus(batch.status) && batch.status !== 'running') {
        result = batch.status
        return { status: result, exitCode: 0 }
      }
      if (batch.completedThisBatch >= batch.requestedMaxSprints) {
        const status = batch.requestedMaxSprints >= MAX_BATCH_SPRINTS && batch.completedThisBatch === MAX_BATCH_SPRINTS
          ? 'max_reached'
          : 'completed'
        result = finalizeBatch(ctx, batch, status, status === 'max_reached' ? 'BATCH_LIMIT_REACHED' : 'REQUESTED_COUNT_REACHED')
        return { status: result, exitCode: 0 }
      }
      if (stopRequested(paths)) {
        result = finalizeBatch(ctx, batch, 'stopped', 'STOP_REQUESTED')
        return { status: result, exitCode: 5 }
      }
      const pendingGate = readHumanGate(paths)
      if (pendingGate) {
        result = finalizeBatch(ctx, batch, 'human_required', `HUMAN_GATE_PENDING: ${pendingGate.reasonCode}`)
        return { status: result, exitCode: 2 }
      }

      const { roadmap, state } = readRoadmapAndState(root)
      if (!roadmap.ok || !state.ok) {
        result = finalizeBatch(ctx, batch, 'human_required', 'ROADMAP_STATE_INCONSISTENT: roadmap.json or state.json is unreadable')
        writeHumanGate(paths, {
          batchId: batch.batchId,
          sprintId: state.ok ? state.value.activeSprint : null,
          reasonCode: 'ROADMAP_STATE_INCONSISTENT',
          summary: 'The roadmap registry or roadmap state could not be parsed; the batch cannot decide safely whether a sprint may run.',
          requiredHumanActions: ['Repair docs/roadmap/roadmap.json or docs/roadmap/state.json, then run npm run sprint:batch:resume.'],
        })
        return { status: result, exitCode: 2 }
      }

      // Crash recovery: the worker finished the sprint but the parent process
      // failed before bookkeeping. Reconcile from repository truth before
      // activating anything new; never re-run a sprint that is already done.
      const pendingId = batch.expectedSprintId
      const pendingRecorded = (batch.completedSprints ?? []).some((item) => item.sprintId === pendingId)
      if (
        pendingId &&
        !pendingRecorded &&
        !state.value.activeSprint &&
        state.value.sprints?.[pendingId]?.status === 'completed'
      ) {
        ctx.log(`[recovery] ${pendingId} was completed before bookkeeping; verifying and recording it`)
        const before = batch.pendingCompletedBefore ?? completedIds(state.value).filter((id) => id !== pendingId)
        const verification = await verifySprint(ctx, pendingId, before, { recovered: true })
        if (!verification.ok) {
          result = finalizeBatch(ctx, batch, 'failed', `VERIFICATION_FAILED: ${verification.errors.join(' | ')}`)
          return { status: result, exitCode: 4 }
        }
        bookkeepCompletion(ctx, batch, pendingId, state.value.sprints[pendingId], { attempt: (batch.repairAttempts ?? 0) + 1 })
        continue
      }

      let expected = state.value.activeSprint ?? null
      if (!expected) {
        const activation = sprintRunner(root, 'start-next')
        if (activation.status !== 0) {
          const combined = `${activation.stdout}\n${activation.stderr}`
          log(`[batch] sprint:next failed: ${truncate(combined.trim(), 800)}`)
          result = finalizeBatch(ctx, batch, 'failed', 'SPRINT_ACTIVATION_FAILED')
          return { status: result, exitCode: 4 }
        }
        const after = readRoadmapAndState(root)
        expected = after.state.ok ? after.state.value.activeSprint : null
        if (!expected) {
          const remaining = selectSprintSequence(after.roadmap.value ?? {}, after.state.value ?? {}, 1)
          if (remaining.length === 0) {
            result = finalizeBatch(ctx, batch, 'roadmap_complete', 'ROADMAP_COMPLETE')
            return { status: result, exitCode: 0 }
          }
          log(`[batch] no sprint could be activated although ${remaining[0]} is selectable`)
          result = finalizeBatch(ctx, batch, 'failed', 'SPRINT_ACTIVATION_FAILED')
          return { status: result, exitCode: 4 }
        }
        log(`[batch] activated ${expected}`)
      } else {
        log(`[batch] resuming active sprint ${expected}`)
      }
      if (!batch.startSprint) batch.startSprint = expected

      const completedBefore = completedIds(state.value)
      batch.currentSprint = expected
      batch.expectedSprintId = expected
      batch.pendingCompletedBefore = completedBefore
      batch.repairAttempts = 0
      saveBatchState(paths, batch)

      let sprintDone = false
      for (let attempt = 0; attempt <= MAX_REPAIR_ATTEMPTS && !sprintDone; attempt += 1) {
        if (stopRequested(paths)) {
          result = finalizeBatch(ctx, batch, 'stopped', 'STOP_REQUESTED')
          return { status: result, exitCode: 5 }
        }
        batch.repairAttempts = attempt
        batch.currentSprint = expected
        saveBatchState(paths, batch)
        if (attempt === 0) printProgress(log, batch, expected, 'RUNNING')
        else printProgress(log, batch, expected, 'RUNNING', `repair ${attempt}/${MAX_REPAIR_ATTEMPTS}`)

        const run = await launchWorker(ctx, expected, attempt)
        const stateAfter = readRoadmapAndState(root)
        const completedNow = Boolean(
          stateAfter.state.ok &&
            stateAfter.state.value.sprints?.[expected]?.status === 'completed' &&
            !stateAfter.state.value.activeSprint,
        )

        if (completedNow) {
          const before = batch.pendingCompletedBefore ?? completedBefore
          // A worker that died after writing repository truth (crash/restart) may
          // have no result file; the repository state is then authoritative and is
          // verified with the recovery contract. A present non-DONE result is a
          // contradiction and must fail verification.
          const verificationWorker = run.result ? run : { recovered: true }
          const verification = await verifySprint(ctx, expected, before, verificationWorker)
          if (verification.ok) {
            bookkeepCompletion(ctx, batch, expected, stateAfter.state.value.sprints[expected], {
              attempt: attempt + 1,
              durationMs: run.durationMs,
              workerExitCode: run.exitCode,
            })
            sprintDone = true
            break
          }
          log(`[verify] independent verification failed for ${expected}; refusing to continue`)
          result = finalizeBatch(ctx, batch, 'failed', `VERIFICATION_FAILED: ${verification.errors.join(' | ')}`)
          return { status: result, exitCode: 4 }
        }

        const external = scanRunForExternalFailure(run)
        if (external?.kind === 'HUMAN_REQUIRED') {
          writeHumanGate(paths, {
            batchId: batch.batchId,
            sprintId: expected,
            reasonCode: external.reasonCode,
            summary: external.summary,
            requiredHumanActions: [
              'Install or repair the OpenCode CLI so that `opencode --version` works from the repository root, then run npm run sprint:batch:resume.',
            ],
          })
          result = finalizeBatch(ctx, batch, 'human_required', `${external.reasonCode}: ${external.summary}`)
          return { status: result, exitCode: 2 }
        }
        if (external?.kind === 'BLOCKED_EXTERNAL' || external?.kind === 'TRANSIENT') {
          result = finalizeBatch(
            ctx,
            batch,
            'blocked_external',
            `${external.reasonCode}${run.logTail ? `: ${truncate(run.logTail.trim().split(/\r?\n/).slice(-3).join(' | '), 600)}` : ''}`,
          )
          return { status: result, exitCode: 3 }
        }
        if (external?.kind === 'TIMEOUT') {
          result = finalizeBatch(
            ctx,
            batch,
            'failed',
            `WORKER_TIMEOUT: ${expected} did not finish within ${options.workerTimeoutMs} ms; the sprint remains active and no following sprint was started.`,
          )
          return { status: result, exitCode: 4 }
        }

        const workerResult = run.result
        if (workerResult?.result === 'HUMAN_REQUIRED') {
          const gate = humanGateFromWorker(run, batch, expected)
          writeHumanGate(paths, gate)
          result = finalizeBatch(ctx, batch, 'human_required', `${gate.reasonCode}: ${gate.summary}`)
          return { status: result, exitCode: 2 }
        }
        if (workerResult?.result === 'BLOCKED') {
          result = finalizeBatch(ctx, batch, 'blocked_external', `${workerResult.reasonCode ?? 'EXTERNAL_SOFTWARE_INTERACTION'}: ${workerResult.blocker ?? workerResult.summary ?? 'worker reported a blocker'}`)
          return { status: result, exitCode: 3 }
        }

        const failureDetail = workerResult?.summary ?? workerResult?.blocker ?? run.resultError ?? `worker exited with code ${run.exitCode ?? 'unknown'}`
        if (attempt >= MAX_REPAIR_ATTEMPTS) {
          log(`[batch] ${expected} still not completed after ${MAX_REPAIR_ATTEMPTS} repair attempts`)
          result = finalizeBatch(
            ctx,
            batch,
            'failed',
            `UNRESOLVED_TEST_FAILURE: ${expected} not completed after ${MAX_REPAIR_ATTEMPTS} repair attempts (${truncate(failureDetail, 500)})`,
          )
          return { status: result, exitCode: 4 }
        }
        log(`[repair] attempt ${attempt + 1} failed for ${expected}: ${truncate(failureDetail, 500)}`)
        log(`[repair] launching repair attempt ${attempt + 1}/${MAX_REPAIR_ATTEMPTS}`)
        batch.status = 'validating'
        saveBatchState(paths, batch)
      }

      if (!sprintDone) {
        result = finalizeBatch(ctx, batch, 'failed', `SPRINT_NOT_COMPLETED: ${expected}`)
        return { status: result, exitCode: 4 }
      }
      batch.status = 'running'
      saveBatchState(paths, batch)
    }
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error)
    log(`[batch] fatal error: ${truncate(message, 2000)}`)
    result = finalizeBatch(ctx, batch, 'failed', `ORCHESTRATOR_ERROR: ${truncate(message, 800)}`)
    return { status: result, exitCode: 4 }
  } finally {
    releaseLock(paths, batch.batchId)
    log.close()
  }
}

function preflightCheck(ctx, batch) {
  const { root, paths, log, options } = ctx
  const validation = sprintRunner(root, 'validate')
  if (validation.status !== 0) {
    const detail = truncate(`${validation.stdout}\n${validation.stderr}`.trim(), 1000)
    log(`[batch] roadmap validation failed: ${detail}`)
    writeHumanGate(paths, {
      batchId: batch.batchId,
      sprintId: null,
      reasonCode: 'ROADMAP_STATE_INCONSISTENT',
      summary: 'Roadmap validation failed before the batch could start.',
      requiredHumanActions: [
        'Run `npm run sprint:validate` from the repository root, repair the reported roadmap/brief/state problems, then run npm run sprint:batch:resume.',
      ],
    })
    return { blocked: true, status: 'human_required', stopReason: `ROADMAP_STATE_INCONSISTENT: ${detail}`, exitCode: 2 }
  }

  const gate = readHumanGate(paths)
  if (gate) {
    log(`[batch] an unresolved human gate exists: ${gate.reasonCode}`)
    return { blocked: true, status: 'human_required', stopReason: `HUMAN_GATE_PENDING: ${gate.reasonCode}`, exitCode: 2 }
  }

  if (stopRequested(paths)) {
    log('[batch] STOP file present; the batch will not start any sprint')
    return { blocked: true, status: 'stopped', stopReason: 'STOP_REQUESTED', exitCode: 5 }
  }

  const { state } = readRoadmapAndState(root)
  const activeSprint = state.ok ? state.value.activeSprint : null

  const git = gitStatus(root)
  if (!git.available) {
    log(`[batch] git status unavailable (${git.error ?? 'not a repository'}); skipping worktree safety checks`)
    return { blocked: false }
  }
  if (hasMergeConflict(git.entries)) {
    writeHumanGate(paths, {
      batchId: batch.batchId,
      sprintId: activeSprint,
      reasonCode: 'MERGE_CONFLICT',
      summary: 'The git repository has unresolved merge conflicts.',
      requiredHumanActions: ['Resolve the merge conflict, commit or abort the merge, then run npm run sprint:batch:resume.'],
    })
    return { blocked: true, status: 'human_required', stopReason: 'MERGE_CONFLICT', exitCode: 2 }
  }
  const expectedDirty = batch.expectedDirtyPaths ?? []
  const unrelated = findUnrelatedDirtyFiles(git.entries, expectedDirty)
  const batchHasSprintWork = (batch.completedSprints?.length ?? 0) > 0
  if (unrelated.length > 0 && !activeSprint && !batchHasSprintWork) {
    writeHumanGate(paths, {
      batchId: batch.batchId,
      sprintId: null,
      reasonCode: 'UNRELATED_DIRTY_WORKTREE',
      summary: 'Uncommitted changes exist in the worktree and no sprint is active; the batch cannot safely tell sprint work from unrelated user work.',
      requiredHumanActions: [
        'Review the listed paths and either commit, stash or discard them yourself. Never let the automation delete them.',
        ...unrelated.slice(0, 10),
        'Then run npm run sprint:batch:resume.',
      ],
    })
    return {
      blocked: true,
      status: 'human_required',
      stopReason: `UNRELATED_DIRTY_WORKTREE: ${unrelated.slice(0, 5).join(', ')}`,
      exitCode: 2,
    }
  }
  if (unrelated.length > 0) {
    log(`[batch] warning: ${unrelated.length} uncommitted path(s) outside sprint scope (${activeSprint ? `${activeSprint} is active` : 'continued batch work'}); they will be preserved`)
  }
  batch.expectedDirtyPaths = git.entries.map((entry) => entry.file)
  return { blocked: false }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function waitForState(paths, predicate, timeoutMs) {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs
    const tick = () => {
      const state = loadBatchState(paths)
      if (predicate(state)) return resolve(state)
      if (Date.now() > deadline) return resolve(null)
      setTimeout(tick, 250)
    }
    tick()
  })
}

async function spawnDetachedRun(ctx, mode, batchId) {
  const { options, root, paths, log } = ctx
  const args = [
    fileURLToPath(import.meta.url),
    'run',
    '--root', root,
    '--mode', mode,
    '--batch-id', batchId,
    '--max', String(options.maxSprints),
    '--worker', options.workerModule,
    '--verify-command', options.verifyScript,
    '--timeout', String(options.workerTimeoutMs),
  ]
  if (options.agent) args.push('--agent', options.agent)
  if (options.model) args.push('--model', options.model)
  if (options.verbose) args.push('--verbose')
  const child = spawn(process.execPath, args, {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, FABRIK3D_BATCH_CHILD: '1' },
  })
  child.unref()
  log(`[batch] detached orchestrator started (pid ${child.pid}, batch ${batchId})`)
  const state = await waitForState(paths, (value) => value.batchId === batchId && value.status !== 'validating', 20_000)
  return { child, state }
}

async function commandStart(options) {
  const ctx = makeContext(options)
  const { paths, log } = ctx

  const gate = readHumanGate(paths)
  if (gate) {
    log(`[batch] refusing to start: an unresolved human gate exists (${gate.reasonCode}).`)
    log(`[batch] ${gate.summary ?? ''}`.trim())
    log('[batch] Complete the required human actions, then run /resolve-sprint-gate before starting a new batch.')
    return 2
  }

  const existingLock = readLock(paths)
  if (existingLock && isPidAlive(existingLock.pid) && Number(existingLock.pid) !== process.pid) {
    log(`[batch] refusing to start: another batch is already running (batchId=${existingLock.batchId}, pid=${existingLock.pid}).`)
    log('[batch] Use npm run sprint:batch:status to inspect it, or npm run sprint:batch:stop to request a graceful stop.')
    return 6
  }

  const previous = loadBatchState(paths)
  if (previous.batchId && !isTerminalStatus(previous.status)) {
    log(`[batch] an unfinished batch exists (${previous.batchId}, status=${previous.status}).`)
    log('[batch] Run npm run sprint:batch:resume to continue it instead of losing its progress accounting.')
    return 6
  }

  if (options.maxClampedFrom) {
    log(`[batch] requested --max ${options.maxClampedFrom} was clamped to the hard maximum of ${MAX_BATCH_SPRINTS} completed sprints.`)
  }
  clearStop(paths, log)
  const batchId = makeBatchId()
  if (options.foreground) {
    const foregroundOptions = { ...options, mode: 'fresh', batchId }
    const foregroundContext = { ...ctx, options: foregroundOptions }
    const result = await runBatchCore(foregroundContext)
    return result.exitCode
  }
  const { state, child } = await spawnDetachedRun(ctx, 'fresh', batchId)
  if (!state || state.status === 'idle') {
    log(`[batch] detached orchestrator did not report a running state within 20 s; inspect ${path.join(paths.logs, 'orchestrator.log')}`)
    return 4
  }
  if (isTerminalStatus(state.status)) {
    log(`[batch] batch ${batchId} finished immediately with status ${state.status}.`)
    commandStatus(options)
    return state.status === 'human_required' ? 2 : state.status === 'blocked_external' ? 3 : state.status === 'failed' ? 4 : 0
  }
  log(`[batch] batch ${batchId} is running with limit ${state.requestedMaxSprints}.`)
  log('[batch] Follow it with: npm run sprint:batch:watch  (or npm run sprint:batch:status)')
  void child
  return 0
}

async function commandResume(options) {
  const ctx = makeContext(options)
  const { paths, log } = ctx

  const gate = readHumanGate(paths)
  if (gate) {
    log(`[batch] refusing to resume: an unresolved human gate exists (${gate.reasonCode}).`)
    log(`[batch] ${gate.summary ?? ''}`.trim())
    log('[batch] Run npm run sprint:batch:resolve-gate -- --reason "..." once the required action is complete.')
    return 2
  }

  const existingLock = readLock(paths)
  if (existingLock && isPidAlive(existingLock.pid) && Number(existingLock.pid) !== process.pid) {
    log(`[batch] refusing to resume: another batch is already running (batchId=${existingLock.batchId}, pid=${existingLock.pid}).`)
    return 6
  }

  const state = loadBatchState(paths)
  if (state.status === 'max_reached' || state.status === 'roadmap_complete' || state.status === 'completed') {
    log(`[batch] the previous batch is complete (status=${state.status}); start a new batch with /start-next-sprint instead.`)
    return 0
  }
  clearStop(paths, log)
  const batchId = state.batchId ?? makeBatchId()
  if (options.foreground || !state.batchId) {
    const resumeOptions = { ...options, mode: state.batchId ? 'resume' : 'fresh', batchId }
    const resumeContext = { ...ctx, options: resumeOptions }
    const result = await runBatchCore(resumeContext)
    return result.exitCode
  }
  const { state: started } = await spawnDetachedRun(ctx, 'resume', batchId)
  if (!started) {
    log(`[batch] detached orchestrator did not report state within 20 s; inspect ${path.join(paths.logs, 'orchestrator.log')}`)
    return 4
  }
  log(`[batch] resumed batch ${batchId} with status ${started.status}.`)
  log('[batch] Follow it with: npm run sprint:batch:watch  (or npm run sprint:batch:status)')
  return 0
}

function commandStatus(options) {
  const ctx = makeReadOnlyContext(options)
  const { paths } = ctx
  const batch = loadBatchState(paths)
  const gate = readHumanGate(paths)
  const lock = readLock(paths)
  const { roadmap, state } = readRoadmapAndState(options.root)
  const lockAlive = lock ? isPidAlive(lock.pid) : false

  console.log('Fabrik3D Sprint Autopilot')
  console.log(`Batch: ${batch.batchId ?? 'none'}`)
  console.log(`Status: ${batch.status}`)
  console.log(`Limit: ${batch.requestedMaxSprints}`)
  console.log(`Completed this batch: ${batch.completedThisBatch}/${batch.requestedMaxSprints}`)
  console.log(`Start sprint: ${batch.startSprint ?? 'none'}`)
  console.log(`Current sprint: ${state.ok ? state.value.activeSprint ?? batch.currentSprint ?? 'none' : batch.currentSprint ?? 'none'}`)
  console.log(`Last completed: ${batch.lastCompletedSprint ?? 'none'}`)
  console.log(`Repair attempts: ${batch.repairAttempts ?? 0}`)
  console.log(`Stop reason: ${batch.stopReason ?? 'none'}`)
  if (gate) {
    console.log(`Human gate: ${gate.reasonCode} — ${gate.summary ?? ''}`.trim())
    for (const action of gate.requiredHumanActions ?? []) console.log(`  - ${action}`)
  } else {
    console.log('Human gate: none')
  }
  if (!lock) console.log('Lock: free')
  else console.log(`Lock: ${lockAlive ? 'held' : 'stale'} by pid ${lock.pid} (batch ${lock.batchId ?? 'unknown'}, created ${lock.createdAt ?? 'unknown'})`)
  if (batch.completedSprints?.length) {
    console.log('Completed sprints:')
    for (const item of batch.completedSprints) console.log(`  ${item.sprintId} (${item.completedAt})`)
  }
  if (roadmap.ok && state.ok) {
    const next = selectSprintSequence(roadmap.value, state.value, 1)[0]
    console.log(next ? `Next roadmap sprint: ${next}` : 'Next roadmap sprint: none (roadmap complete)')
    const completedCount = completedIds(state.value).length
    console.log(`Roadmap progress: ${completedCount}/${roadmap.value.sprints.length} completed`)
  } else {
    console.log('Roadmap progress: unavailable (roadmap/state unreadable)')
  }
  console.log(`STOP file: ${stopRequested(paths) ? 'present' : 'absent'}`)
  return 0
}

async function commandWatch(options) {
  const start = Date.now()
  let lastStatus = null
  while (true) {
    const state = loadBatchState(autopilotPaths(options.root))
    if (state.status !== lastStatus) {
      commandStatus(options)
      console.log('')
      lastStatus = state.status
    }
    if (isTerminalStatus(state.status)) return 0
    if (Date.now() - start >= options.watchTimeoutMs) {
      console.log(`[batch] watch timed out after ${Math.round(options.watchTimeoutMs / 1000)} s; the batch is still running. Re-run npm run sprint:batch:watch to continue watching.`)
      return 7
    }
    await sleep(options.watchIntervalMs)
  }
}

function commandStop(options) {
  const ctx = makeReadOnlyContext(options)
  const { paths, log } = ctx
  const state = loadBatchState(paths)
  const lock = readLock(paths)
  const running = (lock && isPidAlive(lock.pid)) || state.status === 'running' || state.status === 'validating'
  if (!running) {
    console.log(`[batch] no active batch to stop (status=${state.status}); nothing was written.`)
    return 0
  }
  fs.mkdirSync(paths.dir, { recursive: true })
  fs.writeFileSync(paths.stop, `${nowIso()} graceful stop requested\n`, 'utf8')
  log('[batch] STOP request written. The orchestrator stops gracefully after the current worker returns; it will not start another sprint.')
  return 0
}

function commandResolveGate(options) {
  const ctx = makeReadOnlyContext(options)
  const { paths, log } = ctx
  const gate = readHumanGate(paths)
  if (!gate) {
    log('[batch] no HUMAN_REQUIRED gate is present; nothing to resolve.')
    return 0
  }
  if (!options.reason) {
    log('[batch] resolving a human gate requires --reason "what the human did and how it was verified".')
    log(`[batch] Open gate: ${gate.reasonCode} — ${gate.summary ?? ''}`.trim())
    return 6
  }
  const validation = sprintRunner(options.root, 'validate')
  if (validation.status !== 0) {
    log('[batch] refusing to clear the gate: roadmap validation currently fails.')
    log(truncate(`${validation.stdout}\n${validation.stderr}`.trim(), 1000))
    return 4
  }
  const history = readJsonSafe(paths.gateHistory)
  const historyValue = history.ok && typeof history.value === 'object' && history.value !== null ? history.value : { schemaVersion: SCHEMA_VERSION, resolved: [] }
  historyValue.resolved = [
    ...(historyValue.resolved ?? []),
    { ...gate, resolutionNote: options.reason, resolvedAt: nowIso() },
  ]
  writeJsonAtomic(paths.gateHistory, historyValue)
  removeIfExists(paths.humanGate)

  const state = loadBatchState(paths)
  if (state.batchId && state.batchId === gate.batchId && state.status === 'human_required') {
    state.status = 'stopped'
    state.stopReason = `HUMAN_GATE_RESOLVED: ${gate.reasonCode}`
    saveBatchState(paths, state)
  }
  log(`[batch] human gate ${gate.reasonCode} resolved and recorded in ${path.relative(options.root, paths.gateHistory)}.`)
  log('[batch] Run /start-next-sprint for a new bounded batch, or npm run sprint:batch:resume to continue the previous batch.')
  return 0
}

function commandDryRun(options) {
  const { roadmap, state } = readRoadmapAndState(options.root)
  if (!roadmap.ok || !state.ok) {
    console.error(`[batch] cannot dry-run: roadmap=${roadmap.ok ? 'ok' : roadmap.error} state=${state.ok ? 'ok' : state.error}`)
    return 1
  }
  const gate = readHumanGate(autopilotPaths(options.root))
  const sequence = selectSprintSequence(roadmap.value, state.value, options.maxSprints)
  console.log('Fabrik3D Sprint Autopilot — dry run (no mutation)')
  console.log(`Limit: ${options.maxSprints}`)
  if (options.maxClampedFrom) console.log(`Note: requested --max ${options.maxClampedFrom} was clamped to ${MAX_BATCH_SPRINTS}.`)
  if (gate) {
    console.log(`Human gate present: ${gate.reasonCode} — a new batch would refuse to start until it is resolved.`)
  }
  if (state.value.activeSprint) console.log(`Active sprint would be resumed first: ${state.value.activeSprint}`)
  console.log('Would execute:')
  if (sequence.length === 0) console.log('  (no selectable sprint)')
  for (const id of sequence) {
    const sprint = roadmap.value.sprints.find((item) => item.id === id)
    console.log(`${id}${sprint ? ` - ${sprint.title}` : ''}`)
  }
  console.log('No sprint was activated, no worker was launched and no file was modified.')
  return 0
}

function commandHelp() {
  console.log(`Fabrik3D sprint batch orchestrator

Usage: node scripts/sprint-batch-runner.mjs <command> [options]

Commands:
  start        Validate preconditions and launch a bounded batch (detached by default)
  resume       Continue the current batch after a stop or a resolved human gate
  status       Print batch, lock, gate and roadmap state (read-only)
  watch        Poll status until the batch reaches a terminal state or the watch timeout
  stop         Write the graceful STOP request for the running batch
  resolve-gate Clear HUMAN_REQUIRED.json after recording a resolution note
  dry-run      Print the sprint IDs a bounded batch would run (read-only)
  run          Run the batch loop synchronously in this process (internal/test)

Options:
  --root <dir>            Repository root (default: current directory)
  --max <n>               Requested sprints for this batch (hard maximum ${MAX_BATCH_SPRINTS})
  --foreground            start/resume run synchronously instead of detaching
  --worker <module>       Worker module (default scripts/opencode-sprint-worker.mjs)
  --verify-command <path> Independent verification script (default scripts/verify-sprint-gates.mjs)
  --timeout <ms>          Per-worker timeout (default ${DEFAULT_WORKER_TIMEOUT_MS})
  --interval <ms>         watch poll interval (default ${DEFAULT_WATCH_INTERVAL_MS})
  --watch-timeout <ms>    watch maximum wait (default ${DEFAULT_WATCH_TIMEOUT_MS})
  --reason <text>         resolve-gate resolution note (required)
  --agent <name>          OpenCode agent for the worker (default env FABRIK3D_SPRINT_AGENT or sprint-worker)
  --model <provider/model> OpenCode model for the worker (default env FABRIK3D_SPRINT_MODEL)
  --verbose               Stream worker output into the orchestrator log

Environment:
  FABRIK3D_SPRINT_AGENT, FABRIK3D_SPRINT_MODEL, FABRIK3D_WORKER_TIMEOUT_MS, FABRIK3D_OPENCODE_BIN

The hard batch maximum is ${MAX_BATCH_SPRINTS} completed sprints; larger --max values are clamped.`)
  return 0
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2))
  const options = resolveOptions(flags)
  switch (command) {
    case 'start':
      return commandStart(options)
    case 'resume':
      return commandResume(options)
    case 'status':
      return commandStatus(options)
    case 'watch':
      return commandWatch(options)
    case 'stop':
      return commandStop(options)
    case 'resolve-gate':
      return commandResolveGate(options)
    case 'dry-run':
      return commandDryRun(options)
    case 'run': {
      const ctx = makeContext(options)
      if (options.mode === 'auto') {
        const existing = loadBatchState(ctx.paths)
        options.mode = existing.batchId && !isTerminalStatus(existing.status) ? 'resume' : 'fresh'
      }
      const result = await runBatchCore(ctx)
      return result.exitCode
    }
    case 'help':
    default:
      return commandHelp()
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectRun) {
  main()
    .then((code) => {
      process.exitCode = typeof code === 'number' ? code : 0
    })
    .catch((error) => {
      console.error(`[batch] fatal: ${error instanceof Error ? error.stack : String(error)}`)
      process.exitCode = 4
    })
}

