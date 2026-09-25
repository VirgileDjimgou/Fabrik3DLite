#!/usr/bin/env node
/**
 * Fabrik3D sprint worker invocation wrapper.
 *
 * Runs exactly one non-interactive OpenCode session for one active roadmap
 * sprint. The repository batch orchestrator owns sequencing; this wrapper only
 * launches the child session, enforces its timeout, and preserves its logs.
 *
 * Exit codes (consumed by scripts/sprint-batch-runner.mjs):
 *   0..96  passthrough of the OpenCode exit code
 *   97     worker exceeded the timeout and was terminated
 *   98     OpenCode CLI could not be resolved or spawned
 *   99     worker prompt file missing/invalid
 */

import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const EXIT_TIMEOUT = 97
const EXIT_NO_OPENCODE = 98
const EXIT_BAD_PROMPT = 99

function parseArgs(argv) {
  const flags = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) continue
    const name = token.slice(2)
    const next = argv[index + 1]
    if (next !== undefined && !next.startsWith('--')) {
      flags[name] = next
      index += 1
    } else {
      flags[name] = true
    }
  }
  return flags
}

function findOnPath(name) {
  const pathValue = process.env.PATH ?? ''
  const extensions = process.platform === 'win32'
    ? (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').map((extension) => extension.toLowerCase())
    : ['']
  for (const directory of pathValue.split(path.delimiter)) {
    if (!directory) continue
    for (const extension of extensions) {
      const candidate = path.join(directory, `${name}${extension}`)
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
      } catch {
        // ignore unreadable PATH entries
      }
    }
  }
  return null
}

function extractExeFromShim(shimPath) {
  try {
    const content = fs.readFileSync(shimPath, 'utf8')
    const match = /"([^"]+\.exe)"/i.exec(content)
    if (!match) return null
    const candidate = path.resolve(path.dirname(shimPath), match[1])
    return fs.existsSync(candidate) ? candidate : null
  } catch {
    return null
  }
}

export function resolveOpencodeExecutable() {
  if (process.env.FABRIK3D_OPENCODE_BIN) {
    return fs.existsSync(process.env.FABRIK3D_OPENCODE_BIN) ? process.env.FABRIK3D_OPENCODE_BIN : null
  }
  const candidates = []
  if (process.platform === 'win32') {
    const onPath = findOnPath('opencode')
    if (onPath) candidates.push(onPath)
    if (process.env.APPDATA) {
      candidates.push(path.join(process.env.APPDATA, 'npm', 'node_modules', 'opencode-ai', 'bin', 'opencode.exe'))
    }
    if (process.env.LOCALAPPDATA) {
      candidates.push(path.join(process.env.LOCALAPPDATA, 'opencode', 'opencode-cli.exe'))
      candidates.push(path.join(process.env.LOCALAPPDATA, 'opencode', 'OpenCode.exe'))
    }
  } else {
    const onPath = findOnPath('opencode')
    if (onPath) candidates.push(onPath)
  }
  for (const candidate of candidates) {
    if (!candidate || !fs.existsSync(candidate)) continue
    if (/\.exe$/i.test(candidate)) return candidate
    if (/\.(cmd|bat)$/i.test(candidate)) {
      const exe = extractExeFromShim(candidate)
      if (exe) return exe
      continue
    }
    return candidate
  }
  return null
}

function killProcessTree(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
    return
  }
  try {
    process.kill(-pid, 'SIGKILL')
  } catch {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // ignore
    }
  }
}

function appendLog(logFile, text) {
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true })
    fs.appendFileSync(logFile, text, 'utf8')
  } catch {
    // logging must never break the worker
  }
}

function buildPrompt(promptBody, flags) {
  const parameters = [
    '',
    '## Orchestrator parameters (authoritative)',
    '',
    `- batchId: ${flags['batch-id'] ?? 'unknown'}`,
    `- expectedSprintId: ${flags.sprint ?? 'unknown'}`,
    `- attempt: ${flags.attempt ?? '1'} of ${flags['max-attempts'] ?? '1'}`,
    `- maxSprintsThisBatch: ${flags['max-sprints'] ?? '10'}`,
    `- resultFile: ${flags['result-file'] ?? 'docs/roadmap/autopilot/worker-result.json'}`,
    `- workerLogFile: ${flags['log-file'] ?? 'docs/roadmap/autopilot/logs/worker.log'}`,
    `- repositoryRoot: ${flags.root ?? process.cwd()}`,
    '',
    `You must implement only sprint **${flags.sprint ?? 'the active sprint'}**. Do not activate, implement or complete any other sprint.`,
    'Write the structured result JSON to the resultFile path exactly as specified, then stop.',
    '',
  ].join('\n')
  return `${promptBody.trimEnd()}\n${parameters}`
}

async function main() {
  const flags = parseArgs(process.argv.slice(2))
  const root = path.resolve(flags.root ?? process.cwd())
  const sprint = typeof flags.sprint === 'string' ? flags.sprint : null
  const logFile = path.resolve(root, flags['log-file'] ?? path.join('docs', 'roadmap', 'autopilot', 'logs', 'worker.log'))
  const promptFile = path.resolve(root, flags['prompt-file'] ?? path.join('docs', 'roadmap', 'autopilot', 'WORKER_PROMPT.md'))
  const timeoutMs = Number.parseInt(String(flags['timeout-ms'] ?? '7200000'), 10)

  appendLog(logFile, `\n===== Fabrik3D worker start ${new Date().toISOString()} sprint=${sprint ?? 'unknown'} attempt=${flags.attempt ?? '1'} =====\n`)

  if (!fs.existsSync(promptFile)) {
    const message = `[worker] prompt file not found: ${promptFile}`
    appendLog(logFile, `${message}\n`)
    console.error(message)
    process.exitCode = EXIT_BAD_PROMPT
    return
  }
  if (!sprint || !/^S\d{2}$/.test(sprint)) {
    const message = `[worker] missing or invalid --sprint value: ${sprint ?? 'none'}`
    appendLog(logFile, `${message}\n`)
    console.error(message)
    process.exitCode = EXIT_BAD_PROMPT
    return
  }

  const executable = resolveOpencodeExecutable()
  if (!executable) {
    const message = '[worker] the OpenCode CLI could not be resolved. Install it or set FABRIK3D_OPENCODE_BIN.'
    appendLog(logFile, `${message}\n`)
    console.error(message)
    process.exitCode = EXIT_NO_OPENCODE
    return
  }

  const promptBody = fs.readFileSync(promptFile, 'utf8')
  const prompt = buildPrompt(promptBody, flags)
  const args = ['run', prompt, '--agent', flags.agent ?? 'sprint-worker', '--dir', root]
  if (typeof flags.model === 'string' && flags.model !== '') args.push('--model', flags.model)
  if (typeof flags.title === 'string' && flags.title !== '') args.push('--title', flags.title)
  if (process.env.FABRIK3D_SPRINT_AUTO !== '0') args.push('--auto')

  appendLog(logFile, `[worker] executable: ${executable}\n[worker] args: run <prompt> --agent ${flags.agent ?? 'sprint-worker'} --dir ${root}${flags.model ? ` --model ${flags.model}` : ''}\n`)

  let child
  try {
    child = spawn(executable, args, {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: process.platform !== 'win32',
    })
  } catch (error) {
    const message = `[worker] failed to spawn OpenCode: ${error instanceof Error ? error.message : String(error)}`
    appendLog(logFile, `${message}\n`)
    console.error(message)
    process.exitCode = EXIT_NO_OPENCODE
    return
  }

  const forward = (chunk, streamName) => {
    const text = chunk.toString()
    appendLog(logFile, text)
    if (process.env.FABRIK3D_WORKER_ECHO === '1') process[streamName === 'out' ? 'stdout' : 'stderr'].write(text)
  }
  child.stdout?.on('data', (chunk) => forward(chunk, 'out'))
  child.stderr?.on('data', (chunk) => forward(chunk, 'err'))

  let timedOut = false
  const effectiveTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 7_200_000
  const timeoutHandle = setTimeout(() => {
    timedOut = true
    appendLog(logFile, `[worker] timeout after ${effectiveTimeout} ms; terminating the OpenCode process tree\n`)
    killProcessTree(child.pid)
  }, effectiveTimeout)

  const exitCode = await new Promise((resolve) => {
    child.on('error', (error) => {
      appendLog(logFile, `[worker] spawn/runtime error: ${error.message}\n`)
      resolve(null)
    })
    child.on('close', (code) => resolve(code))
  })
  clearTimeout(timeoutHandle)

  appendLog(logFile, `===== Fabrik3D worker end ${new Date().toISOString()} exit=${exitCode ?? 'error'} timedOut=${timedOut} =====\n`)
  if (timedOut) {
    process.exitCode = EXIT_TIMEOUT
    return
  }
  process.exitCode = typeof exitCode === 'number' ? exitCode : EXIT_NO_OPENCODE
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectRun) {
  main().catch((error) => {
    console.error(`[worker] fatal: ${error instanceof Error ? error.stack : String(error)}`)
    process.exitCode = 4
  })
}
