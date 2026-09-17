import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const openApiUrl = process.env.FABRIK3D_OPENAPI_URL ?? 'http://127.0.0.1:7249/swagger/v1/swagger.json'
const packageRoot = path.join(root, 'Fabrik3D', 'fabrik3d-ts-contracts')
const openApiPath = path.join(packageRoot, 'openapi.json')
const outputPath = path.join(packageRoot, 'src', 'orchestrator.generated.ts')
const checkOnly = process.argv.includes('--check')

async function main() {
  const response = await fetch(openApiUrl)
  if (!response.ok) {
    throw new Error(`Unable to download the OpenAPI contract from ${openApiUrl}: HTTP ${response.status}`)
  }

  const document = await response.json()
  const formattedDocument = `${JSON.stringify(document, null, 2)}\n`
  const existingDocument = fs.existsSync(openApiPath) ? fs.readFileSync(openApiPath, 'utf8') : ''

  if (checkOnly && existingDocument !== formattedDocument) {
    throw new Error('OpenAPI snapshot is stale. Run npm run contracts:generate while the server is running.')
  }

  if (!checkOnly) {
    fs.writeFileSync(openApiPath, formattedDocument, 'utf8')
  }

  const cli = path.join(root, 'node_modules', 'openapi-typescript', 'bin', 'cli.js')
  if (!fs.existsSync(cli)) {
    throw new Error('openapi-typescript is not installed. Run npm install from the repository root.')
  }

  const temporaryOutput = `${outputPath}.tmp`
  execFileSync(process.execPath, [cli, openApiPath, '--output', temporaryOutput], { stdio: 'inherit' })
  const generated = fs.readFileSync(temporaryOutput, 'utf8')
  fs.unlinkSync(temporaryOutput)
  const existingGenerated = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : ''

  if (checkOnly && existingGenerated !== generated) {
    throw new Error('Generated TypeScript contracts are stale. Run npm run contracts:generate.')
  }

  if (!checkOnly) {
    fs.writeFileSync(outputPath, generated, 'utf8')
  }

  console.log(`[contracts] ${checkOnly ? 'verified' : 'generated'} from ${openApiUrl}`)
}

main().catch((error) => {
  console.error(`[contracts] ${error.message}`)
  process.exit(1)
})
