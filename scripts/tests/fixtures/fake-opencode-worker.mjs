#!/usr/bin/env node
/**
 * Deterministic fake OpenCode sprint worker used by the batch orchestrator
 * tests. It never touches the network and never calls OpenCode.
 *
 * Behaviour is driven by docs/roadmap/autopilot/test-scenario.json:
 *
 * {
 *   "sprints": { "S03": ["complete", "fail", "complete"] },
 *   "plan": ["complete"],
 *   "default": "complete",
 *   "humanReasonCode": "EXTERNAL_CREDENTIAL_REQUIRED",
 *   "humanSummary": "...",
 *   "humanActions": ["..."],
 *   "otherSprint": "S09"
 * }
 *
 * Behaviours: complete, fail, human, blocked, malformed, none, crash,
 * complete_then_crash, complete_then_stop, complete_no_evidence, complete_and_extra,
 * fail_then_complete, quota, timeout, bad_sprint.
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function runSprintRunner(root, command, args) {
  return spawnSync(process.execPath, [path.join(root, 'scripts', 'sprint-runner.mjs'), command, ...args], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  })
}

function recordInvocation(root, entry) {
  const file = path.join(root, 'docs', 'roadmap', 'autopilot', 'test-invocations.log')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.appendFileSync(file, `${JSON.stringify(entry)}\n`, 'utf8')
}

function nextPlannedId(root) {
  const roadmap = readJson(path.join(root, 'docs', 'roadmap', 'roadmap.json'))
  const state = readJson(path.join(root, 'docs', 'roadmap', 'state.json'))
  return roadmap.sprints.find((sprint) => state.sprints[sprint.id]?.status === 'planned')?.id ?? null
}

function main() {
  const flags = parseArgs(process.argv.slice(2))
  const root = path.resolve(flags.root ?? process.cwd())
  const sprint = flags.sprint ?? 'S00'
  const attempt = Number.parseInt(String(flags.attempt ?? '1'), 10)
  const resultFile = path.resolve(root, flags['result-file'] ?? path.join('docs', 'roadmap', 'autopilot', 'worker-result.json'))
  const scenarioPath = path.join(root, 'docs', 'roadmap', 'autopilot', 'test-scenario.json')
  const scenario = fs.existsSync(scenarioPath) ? readJson(scenarioPath) : {}
  const plan = scenario.sprints?.[sprint] ?? scenario.plan ?? []
  const behavior = plan[attempt - 1] ?? scenario.default ?? 'complete'

  recordInvocation(root, { sprint, attempt, behavior, at: new Date().toISOString(), pid: process.pid })

  const writeResult = (result, extra = {}) => {
    writeJson(resultFile, {
      schemaVersion: '1.0',
      batchId: flags['batch-id'] ?? null,
      sprintId: sprint,
      attempt,
      result,
      roadmapState: result === 'DONE' ? 'completed' : 'active',
      mandatoryGatesPassed: result === 'DONE',
      tests: result === 'DONE' ? ['fixture tests'] : [],
      builds: result === 'DONE' ? ['fixture build'] : [],
      humanRequired: result === 'HUMAN_REQUIRED',
      blocker: null,
      reasonCode: null,
      summary: `Fixture ${result} for ${sprint}`,
      requiredHumanActions: [],
      notes: [],
      ...extra,
    })
  }

  const complete = () => {
    const result = runSprintRunner(root, 'complete', [
      '--summary', `Fixture completion of ${sprint}`,
      '--evidence', 'fixture worker: fixture tests passed; fixture build passed',
    ])
    if (result.status !== 0) {
      console.error(`[fake-worker] sprint-runner complete failed: ${result.stdout} ${result.stderr}`)
    }
  }

  switch (behavior) {
    case 'complete':
      complete()
      writeResult('DONE')
      process.exitCode = 0
      return
    case 'fail':
      writeResult('FAILED', { notes: ['fixture failure'] })
      process.exitCode = 1
      return
    case 'human':
      writeResult('HUMAN_REQUIRED', {
        reasonCode: scenario.humanReasonCode ?? 'EXTERNAL_CREDENTIAL_REQUIRED',
        summary: scenario.humanSummary ?? `Human action required for ${sprint}`,
        requiredHumanActions: scenario.humanActions ?? ['perform the documented external action'],
      })
      process.exitCode = 0
      return
    case 'blocked':
      writeResult('BLOCKED', { reasonCode: 'EXTERNAL_SOFTWARE_INTERACTION', blocker: 'external system unavailable' })
      process.exitCode = 1
      return
    case 'malformed':
      fs.mkdirSync(path.dirname(resultFile), { recursive: true })
      fs.writeFileSync(resultFile, '{ this is not json', 'utf8')
      process.exitCode = 0
      return
    case 'none':
      process.exitCode = 0
      return
    case 'crash':
      process.exitCode = 1
      return
    case 'complete_then_crash':
      complete()
      process.exitCode = 1
      return
    case 'complete_then_stop':
      complete()
      fs.writeFileSync(path.join(root, 'docs', 'roadmap', 'autopilot', 'STOP'), `fixture stop ${new Date().toISOString()}\n`, 'utf8')
      writeResult('DONE')
      process.exitCode = 0
      return
    case 'complete_no_evidence': {
      complete()
      const statePath = path.join(root, 'docs', 'roadmap', 'state.json')
      const state = readJson(statePath)
      if (state.sprints[sprint]) delete state.sprints[sprint].evidence
      writeJson(statePath, state)
      writeResult('DONE')
      process.exitCode = 0
      return
    }
    case 'complete_and_extra': {
      complete()
      const other = scenario.otherSprint ?? nextPlannedId(root)
      if (other) {
        const statePath = path.join(root, 'docs', 'roadmap', 'state.json')
        const state = readJson(statePath)
        state.sprints[other] = {
          status: 'completed',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          summary: `unexpected fixture completion of ${other}`,
          evidence: 'unexpected fixture evidence',
        }
        writeJson(statePath, state)
      }
      writeResult('DONE')
      process.exitCode = 0
      return
    }
    case 'bad_sprint':
      writeResult('DONE', { sprintId: scenario.otherSprint ?? 'S99' })
      process.exitCode = 0
      return
    case 'quota':
      console.error('429 rate limit exceeded: rate limit reached for provider')
      process.exitCode = 1
      return
    case 'timeout':
      setTimeout(() => process.exit(0), 60 * 60 * 1000)
      return
    default:
      console.error(`[fake-worker] unknown behavior '${behavior}'`)
      process.exitCode = 2
  }
}

main()
