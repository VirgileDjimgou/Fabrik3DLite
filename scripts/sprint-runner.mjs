import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const roadmapDir = path.join(root, 'docs', 'roadmap')
const registryPath = path.join(roadmapDir, 'roadmap.json')
const statePath = path.join(roadmapDir, 'state.json')
const currentPath = path.join(roadmapDir, 'CURRENT_SPRINT.md')

function fail(message) {
  console.error(`[sprint] ${message}`)
  process.exit(1)
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) fail(`Missing required file: ${path.relative(root, filePath)}`)
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function load() {
  const roadmap = readJson(registryPath)
  const state = readJson(statePath)
  const knownIds = new Set(roadmap.sprints.map((sprint) => sprint.id))

  for (const sprint of roadmap.sprints) {
    state.sprints[sprint.id] ??= { status: 'planned' }
  }

  for (const id of Object.keys(state.sprints)) {
    if (!knownIds.has(id)) fail(`State references unknown sprint ${id}`)
  }

  return { roadmap, state }
}

function sprintById(roadmap, id) {
  return roadmap.sprints.find((sprint) => sprint.id === id)
}

function briefPath(sprint) {
  return path.join(root, sprint.file)
}

function repoRelative(filePath) {
  return path.relative(root, filePath).replaceAll('\\', '/')
}

function markdownLinks(markdown) {
  const links = []
  const pattern = /\[[^\]]*\]\(([^)]+)\)/g
  let match
  while ((match = pattern.exec(markdown)) !== null) {
    links.push(match[1].trim())
  }
  return links
}

function validateMarkdownLinks(filePath, errors) {
  if (!fs.existsSync(filePath)) return
  const markdown = fs.readFileSync(filePath, 'utf8')
  for (const rawLink of markdownLinks(markdown)) {
    if (/^(https?:|mailto:|tel:|data:)/i.test(rawLink)) continue
    if (rawLink.startsWith('#')) continue
    const withoutAnchor = rawLink.split('#')[0]
    if (!withoutAnchor || withoutAnchor.startsWith('#')) continue
    const candidates = [
      path.resolve(root, withoutAnchor),
      path.resolve(path.dirname(filePath), withoutAnchor),
    ]
    if (!candidates.some((candidate) => fs.existsSync(candidate))) {
      errors.push(`${repoRelative(filePath)}: broken relative link '${rawLink}'`)
    }
  }
}

function validateRoadmap(roadmap, state) {
  const errors = []
  if (!roadmap || typeof roadmap !== 'object') {
    return ['roadmap.json is not an object']
  }
  if (typeof roadmap.name !== 'string' || roadmap.name.trim() === '') {
    errors.push('roadmap.name is required')
  }
  if (!Array.isArray(roadmap.sprints) || roadmap.sprints.length === 0) {
    return [...errors, 'roadmap.sprints must be a non-empty array']
  }

  const ids = new Set()
  const byId = new Map()
  for (const sprint of roadmap.sprints) {
    if (!sprint || typeof sprint.id !== 'string' || !/^S\d{2}$/.test(sprint.id)) {
      errors.push(`invalid sprint id: ${JSON.stringify(sprint?.id)}`)
      continue
    }
    if (ids.has(sprint.id)) errors.push(`duplicate sprint id ${sprint.id}`)
    ids.add(sprint.id)
    byId.set(sprint.id, sprint)
    if (typeof sprint.title !== 'string' || sprint.title.trim() === '') {
      errors.push(`${sprint.id}: title is required`)
    }
    if (!Number.isInteger(sprint.phase) || sprint.phase < 1) {
      errors.push(`${sprint.id}: phase must be a positive integer`)
    }
    if (typeof sprint.file !== 'string' || !sprint.file.endsWith('.md')) {
      errors.push(`${sprint.id}: file must reference a markdown brief`)
    }
    if (!Array.isArray(sprint.dependsOn)) {
      errors.push(`${sprint.id}: dependsOn must be an array`)
    }
  }

  if (Number.isInteger(roadmap.sprintCeiling)) {
    for (const id of ids) {
      const number = Number.parseInt(id.slice(1), 10)
      if (number > roadmap.sprintCeiling) {
        errors.push(`${id} exceeds the roadmap ceiling of ${roadmap.sprintCeiling}`)
      }
    }
  }

  for (const sprint of roadmap.sprints) {
    if (!sprint || typeof sprint.id !== 'string') continue
    for (const dependency of sprint.dependsOn ?? []) {
      if (dependency === sprint.id) errors.push(`${sprint.id} depends on itself`)
      if (!ids.has(dependency)) errors.push(`${sprint.id} depends on unknown sprint ${dependency}`)
    }
  }

  const visiting = new Set()
  const visited = new Set()
  function visit(id, chain) {
    if (visited.has(id)) return
    if (visiting.has(id)) {
      errors.push(`dependency cycle detected: ${[...chain, id].join(' -> ')}`)
      return
    }
    visiting.add(id)
    const sprint = byId.get(id)
    for (const dependency of sprint?.dependsOn ?? []) {
      if (byId.has(dependency)) visit(dependency, [...chain, id])
    }
    visiting.delete(id)
    visited.add(id)
  }
  for (const id of ids) visit(id, [])

  const knownStatuses = new Set(['planned', 'active', 'completed', 'blocked'])
  for (const id of Object.keys(state.sprints)) {
    if (!ids.has(id)) errors.push(`state.json references unknown sprint ${id}`)
    const entry = state.sprints[id]
    if (entry && entry.status && !knownStatuses.has(entry.status)) {
      errors.push(`${id}: unknown status '${entry.status}'`)
    }
  }

  for (const sprint of roadmap.sprints) {
    const entry = state.sprints[sprint.id]
    if (!entry) continue
    if (entry.status === 'completed') {
      if (!entry.summary) errors.push(`${sprint.id}: completed without a summary`)
      if (!entry.evidence) errors.push(`${sprint.id}: completed without evidence`)
      if (!entry.completedAt) errors.push(`${sprint.id}: completed without completedAt`)
      if (entry.startedAt && entry.completedAt && entry.startedAt > entry.completedAt) {
        errors.push(`${sprint.id}: completedAt precedes startedAt`)
      }
      for (const dependency of sprint.dependsOn ?? []) {
        if (state.sprints[dependency]?.status !== 'completed') {
          errors.push(`${sprint.id} is completed but dependency ${dependency} is not`)
        }
      }
    }
  }

  const activeIds = Object.keys(state.sprints).filter((id) => state.sprints[id]?.status === 'active')
  if (activeIds.length > 1) {
    errors.push(`state.json has multiple active sprints: ${activeIds.join(', ')}`)
  }
  if (state.activeSprint && state.sprints[state.activeSprint]?.status !== 'active') {
    errors.push(`activeSprint ${state.activeSprint} does not have status 'active'`)
  }
  if (!state.activeSprint && activeIds.length > 0) {
    errors.push(`state.json has active sprint ${activeIds[0]} but activeSprint is null`)
  }

  for (const sprint of roadmap.sprints) {
    if (typeof sprint.file !== 'string') continue
    const file = briefPath(sprint)
    if (!fs.existsSync(file)) {
      errors.push(`${sprint.id}: missing brief ${sprint.file}`)
    } else {
      validateMarkdownLinks(file, errors)
    }
  }

  if (fs.existsSync(currentPath)) {
    const current = fs.readFileSync(currentPath, 'utf8')
    if (state.activeSprint) {
      if (!current.includes(`Active sprint: ${state.activeSprint}`)) {
        errors.push(`CURRENT_SPRINT.md does not match active sprint ${state.activeSprint}`)
      }
    } else if (!current.includes('No active sprint')) {
      errors.push('CURRENT_SPRINT.md should report no active sprint')
    }
  }

  return errors
}

function renderCurrent(sprint, brief, stateEntry) {
  const header = [
    '<!-- Generated by scripts/sprint-runner.mjs. Do not edit this file directly. -->',
    '',
    `# Active sprint: ${sprint.id} - ${sprint.title}`,
    '',
    `Started: ${stateEntry.startedAt}`,
    '',
    'Source brief: [`' + sprint.file + '`](../../' + sprint.file.replaceAll('\\', '/') + ')',
    '',
    '## Execution contract',
    '',
    '1. Inspect the current implementation before changing files.',
    '2. Preserve existing behavior unless the brief explicitly changes it.',
    '3. Implement only this sprint and document discovered follow-up work.',
    '4. Add the tests required by this brief and run the applicable baseline gates.',
    '5. Do not mark the sprint complete while a required gate is failing.',
    '',
    '---',
    '',
  ].join('\n')

  fs.writeFileSync(currentPath, `${header}${brief.trim()}\n`, 'utf8')
}

function printSprint(sprint) {
  console.log(`[sprint] ${sprint.id} - ${sprint.title}`)
  console.log(`[sprint] Brief: ${sprint.file}`)
  console.log(`[sprint] Active brief: docs/roadmap/CURRENT_SPRINT.md`)
}

function status(roadmap, state) {
  const counts = { planned: 0, active: 0, completed: 0, blocked: 0 }
  for (const sprint of roadmap.sprints) {
    const value = state.sprints[sprint.id]?.status ?? 'planned'
    counts[value] = (counts[value] ?? 0) + 1
  }

  console.log(`[sprint] Roadmap: ${roadmap.name}`)
  console.log(`[sprint] Progress: ${counts.completed}/${roadmap.sprints.length} completed`)
  console.log(`[sprint] Planned=${counts.planned} Active=${counts.active} Blocked=${counts.blocked}`)

  if (state.activeSprint) {
    const sprint = sprintById(roadmap, state.activeSprint)
    if (sprint) printSprint(sprint)
  } else {
    const next = roadmap.sprints.find((sprint) => state.sprints[sprint.id]?.status === 'planned')
    console.log(next ? `[sprint] Next: ${next.id} - ${next.title}` : '[sprint] Roadmap complete')
  }
}

function validateAndReport(roadmap, state) {
  const errors = validateRoadmap(roadmap, state)
  if (errors.length > 0) {
    for (const error of errors) console.error(`[sprint] validation error: ${error}`)
    fail(`roadmap validation failed with ${errors.length} error(s)`)
  }
  const completed = roadmap.sprints.filter((sprint) => state.sprints[sprint.id]?.status === 'completed').length
  console.log(
    `[sprint] Roadmap validation passed: ${roadmap.sprints.length} sprints, ${completed} completed, active=${state.activeSprint ?? 'none'}`,
  )
}

function startNext(roadmap, state) {
  if (state.activeSprint) {
    const active = sprintById(roadmap, state.activeSprint)
    if (!active) fail(`Unknown active sprint ${state.activeSprint}`)
    const brief = fs.readFileSync(briefPath(active), 'utf8')
    renderCurrent(active, brief, state.sprints[active.id])
    console.log('[sprint] An active sprint already exists; resuming it.')
    printSprint(active)
    return
  }

  const next = roadmap.sprints.find((sprint) => state.sprints[sprint.id]?.status === 'planned')
  if (!next) {
    console.log('[sprint] All roadmap sprints are complete.')
    return
  }

  const validationErrors = validateRoadmap(roadmap, state)
  if (validationErrors.length > 0) {
    for (const error of validationErrors) console.error(`[sprint] validation error: ${error}`)
    fail('refusing to activate a sprint while roadmap validation fails')
  }

  const unmet = next.dependsOn.filter((id) => state.sprints[id]?.status !== 'completed')
  if (unmet.length > 0) fail(`${next.id} has unmet dependencies: ${unmet.join(', ')}`)

  const file = briefPath(next)
  if (!fs.existsSync(file)) fail(`Missing sprint brief: ${next.file}`)

  const startedAt = new Date().toISOString()
  state.activeSprint = next.id
  state.sprints[next.id] = { status: 'active', startedAt }
  state.updatedAt = startedAt
  writeJson(statePath, state)
  renderCurrent(next, fs.readFileSync(file, 'utf8'), state.sprints[next.id])

  console.log('[sprint] Activated next sprint.')
  printSprint(next)
  console.log('[sprint] Implement the active brief, run its gates, then complete it with:')
  console.log('npm run sprint:complete -- --summary "..." --evidence "..."')
}

function option(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function complete(roadmap, state) {
  if (!state.activeSprint) fail('No active sprint to complete')
  const summary = option('--summary')
  const evidence = option('--evidence')
  if (!summary || !evidence) {
    fail('Completion requires --summary and --evidence. Evidence should list the executed test/build commands.')
  }

  const sprint = sprintById(roadmap, state.activeSprint)
  if (!sprint) fail(`Unknown active sprint ${state.activeSprint}`)

  const completedAt = new Date().toISOString()
  state.sprints[sprint.id] = {
    ...state.sprints[sprint.id],
    status: 'completed',
    completedAt,
    summary,
    evidence,
  }
  state.activeSprint = null
  state.updatedAt = completedAt
  writeJson(statePath, state)

  fs.writeFileSync(
    currentPath,
    `# No active sprint\n\nLast completed: **${sprint.id} - ${sprint.title}**\n\nRun \`npm run sprint:next\` to activate the next sprint.\n`,
    'utf8',
  )

  console.log(`[sprint] Completed ${sprint.id} - ${sprint.title}`)
  const next = roadmap.sprints.find((item) => state.sprints[item.id]?.status === 'planned')
  console.log(next ? `[sprint] Next: ${next.id} - ${next.title}` : '[sprint] Roadmap complete')
}

const command = process.argv[2] ?? 'status'
const { roadmap, state } = load()

switch (command) {
  case 'status':
    status(roadmap, state)
    break
  case 'validate':
    validateAndReport(roadmap, state)
    break
  case 'start-next':
    startNext(roadmap, state)
    break
  case 'show': {
    if (!state.activeSprint) fail('No active sprint. Run npm run sprint:next first.')
    const sprint = sprintById(roadmap, state.activeSprint)
    printSprint(sprint)
    console.log(fs.readFileSync(currentPath, 'utf8'))
    break
  }
  case 'complete':
    complete(roadmap, state)
    break
  default:
    fail(`Unknown command '${command}'. Use status, validate, start-next, show, or complete.`)
}
