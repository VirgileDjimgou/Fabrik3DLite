#!/usr/bin/env node
/**
 * Independent post-sprint verification for the Fabrik3D sprint autopilot.
 *
 * This script re-derives the important claims from repository truth after a
 * worker reports success. It deliberately does not trust the worker result:
 * it re-reads roadmap state, evidence, active-sprint consistency, git conflict
 * state and re-runs the roadmap validator.
 *
 * Exit code 0 = verification passed, 1 = verification failed.
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

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
  try {
    return { ok: true, value: JSON.parse(fs.readFileSync(filePath, 'utf8')) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

function main() {
  const flags = parseArgs(process.argv.slice(2))
  const root = path.resolve(flags.root ?? process.cwd())
  const sprintId = typeof flags.sprint === 'string' ? flags.sprint : null
  const errors = []

  if (!sprintId || !/^S\d{2}$/.test(sprintId)) {
    console.error('[verify] --sprint Sxx is required')
    process.exitCode = 1
    return
  }

  const roadmap = readJson(path.join(root, 'docs', 'roadmap', 'roadmap.json'))
  const state = readJson(path.join(root, 'docs', 'roadmap', 'state.json'))
  if (!roadmap.ok) errors.push(`roadmap.json unreadable: ${roadmap.error}`)
  if (!state.ok) errors.push(`state.json unreadable: ${state.error}`)
  if (!roadmap.ok || !state.ok) {
    for (const error of errors) console.error(`[verify] ${error}`)
    process.exitCode = 1
    return
  }

  const sprint = roadmap.value.sprints?.find((item) => item.id === sprintId)
  if (!sprint) errors.push(`${sprintId} does not exist in roadmap.json`)

  const entry = state.value.sprints?.[sprintId]
  if (!entry || entry.status !== 'completed') {
    errors.push(`${sprintId} is not marked completed in state.json`)
  } else {
    if (!entry.summary) errors.push(`${sprintId} has no completion summary`)
    if (!entry.evidence) errors.push(`${sprintId} has no completion evidence`)
    if (!entry.completedAt) errors.push(`${sprintId} has no completedAt timestamp`)
    if (entry.startedAt && entry.completedAt && entry.startedAt > entry.completedAt) {
      errors.push(`${sprintId} completedAt precedes startedAt`)
    }
  }

  if (state.value.activeSprint) errors.push(`state.json still has activeSprint=${state.value.activeSprint}`)

  if (sprint) {
    for (const dependency of sprint.dependsOn ?? []) {
      if (state.value.sprints?.[dependency]?.status !== 'completed') {
        errors.push(`${sprintId} dependency ${dependency} is not completed`)
      }
    }
  }

  const currentPath = path.join(root, 'docs', 'roadmap', 'CURRENT_SPRINT.md')
  if (fs.existsSync(currentPath)) {
    const current = fs.readFileSync(currentPath, 'utf8')
    if (!current.includes('No active sprint')) errors.push('CURRENT_SPRINT.md still reports an active sprint')
  } else {
    errors.push('CURRENT_SPRINT.md is missing')
  }

  const runnerPath = path.join(root, 'scripts', 'sprint-runner.mjs')
  if (!fs.existsSync(runnerPath)) {
    errors.push(`scripts/sprint-runner.mjs is missing under ${root}`)
  } else {
    const validation = spawnSync(process.execPath, [runnerPath, 'validate'], { cwd: root, encoding: 'utf8', windowsHide: true })
    if (validation.status !== 0) {
      errors.push(`sprint-runner validate failed: ${(validation.stdout ?? '').trim()} ${(validation.stderr ?? '').trim()}`.trim())
    }
  }

  const git = spawnSync('git', ['-C', root, 'status', '--porcelain=v1', '--untracked-files=all'], { encoding: 'utf8', windowsHide: true })
  if (!git.error && git.status === 0) {
    const unmerged = git.stdout.split(/\r?\n/).filter((line) => /^(DD|AU|UD|UA|DU|AA|UU) /.test(line))
    if (unmerged.length > 0) errors.push(`git has unresolved merge conflicts: ${unmerged.slice(0, 5).join(' | ')}`)
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(`[verify] ${error}`)
    process.exitCode = 1
    return
  }
  console.log(`[verify] OK ${sprintId} is completed with evidence, no active sprint, dependencies satisfied and roadmap validation green.`)
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectRun) {
  try {
    main()
  } catch (error) {
    console.error(`[verify] fatal: ${error instanceof Error ? error.stack : String(error)}`)
    process.exitCode = 1
  }
}
