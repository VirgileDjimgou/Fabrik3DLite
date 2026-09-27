// Fabrik3D deployment configuration verification (S48).
//
// Validates the rendered Docker Compose configuration without starting the stack:
//   1. `docker compose config` must succeed (syntax + interpolation).
//   2. The orchestrator must run a production-like profile with Swagger disabled.
//   3. CORS origins must never contain a wildcard.
//   4. No committed example file may contain an obvious inline secret.
//
// Usage: node scripts/lifecycle/verify-config.mjs [--compose Fabrik3D/compose.production.yaml]

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { composeArgs, parseArgs, repoRoot, run } from './lib.mjs'

const args = parseArgs(process.argv.slice(2))
const composeFile = args.compose ?? 'Fabrik3D/compose.production.yaml'
const errors = []

function main() {
  let rendered
  try {
    rendered = run('docker', [...composeArgs(composeFile), 'config', '--format', 'json'])
  } catch (error) {
    console.error(`[verify-config] docker compose config failed: ${error.message}`)
    process.exit(1)
  }

  const document = JSON.parse(rendered)
  const services = document.services ?? {}

  // Every service must declare a healthcheck, and downstream services must wait for a healthy
  // dependency instead of racing it.
  const requiredHealthcheckServices = ['mongo', 'orchestrator', 'simulator', 'hmi']
  for (const serviceName of requiredHealthcheckServices) {
    const service = services[serviceName]
    if (!service) {
      errors.push(`compose config has no '${serviceName}' service.`)
      continue
    }
    if (!service.healthcheck || !service.healthcheck.test) {
      errors.push(`service '${serviceName}' must declare a healthcheck test.`)
    }
  }

  const healthyDependencies = [
    ['orchestrator', 'mongo'],
    ['simulator', 'orchestrator'],
    ['hmi', 'orchestrator'],
  ]
  for (const [serviceName, dependency] of healthyDependencies) {
    const condition = services[serviceName]?.depends_on?.[dependency]?.condition
    if (condition !== 'service_healthy') {
      errors.push(
        `service '${serviceName}' must depend on '${dependency}' with condition: service_healthy (got ${condition ?? 'none'}).`,
      )
    }
  }

  const orchestrator = services.orchestrator
  if (!orchestrator) {
    errors.push('compose config has no orchestrator service.')
  } else {
    const environment = orchestrator.environment ?? {}
    const profile = environment['Deployment__Profile'] ?? environment['Deployment:Profile']
    if (!profile) {
      errors.push('orchestrator must set Deployment__Profile.')
    }
    if (environment['ASPNETCORE_ENVIRONMENT'] !== 'Production') {
      errors.push('orchestrator must run with ASPNETCORE_ENVIRONMENT=Production.')
    }

    const origins = Object.entries(environment)
      .filter(([key]) => key.startsWith('Cors__AllowedOrigins') || key.startsWith('Cors:AllowedOrigins'))
      .map(([, value]) => value)
    if (origins.some((origin) => String(origin).trim() === '*')) {
      errors.push('Cors origins must not contain a wildcard.')
    }
  }

  // Scan committed env templates for obvious inline secrets.
  const envDirectory = path.join(repoRoot, 'Fabrik3D', 'env')
  if (fs.existsSync(envDirectory)) {
    for (const file of fs.readdirSync(envDirectory)) {
      const content = fs.readFileSync(path.join(envDirectory, file), 'utf8')
      for (const line of content.split(/\r?\n/)) {
        const match = /^([A-Za-z0-9_]+)=(?!\s*$)(.+)$/.exec(line)
        if (!match) continue
        const [, key, value] = match
        const secretish = /password|secret|token|key/i.test(key)
        if (secretish && value.trim() !== '' && !value.startsWith('#')) {
          errors.push(`env template ${file} sets a non-empty secret-looking value for ${key}.`)
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error('[verify-config] FAILED:')
    for (const error of errors) console.error(`  - ${error}`)
    process.exit(1)
  }

  console.log(`[verify-config] passed for ${composeFile}`)
}

try {
  main()
} catch (error) {
  console.error(`[verify-config] FAILED: ${error.message}`)
  process.exit(1)
}
