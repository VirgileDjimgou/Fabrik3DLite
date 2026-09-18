import path from 'node:path'
import process from 'node:process'
import { chromium } from '../Fabrik3D/fabrik3d.client/node_modules/playwright/index.mjs'

const output = path.join(process.cwd(), 'docs', 'demo', 'screenshots')
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } })
const base = 'https://127.0.0.1:5174'

await page.goto(`${base}/`, { waitUntil: 'networkidle' })
await page.screenshot({ path: path.join(output, 's25-reference-3d-scene.png'), fullPage: true })

await page.goto(`${base}/?view=scenario`, { waitUntil: 'networkidle' })
await page.locator('[data-scenario="robot-axes"]').click()
await page.locator('[data-action="run-scenario"]').click()
await page.locator('[data-scenario-status]').waitFor({ state: 'visible' })
await page.waitForFunction(() => document.querySelector('[data-scenario-status]')?.textContent === 'completed')
await page.screenshot({ path: path.join(output, 's25-basic-robot-axes-complete.png'), fullPage: true })

await page.goto(`${base}/?view=scenario`, { waitUntil: 'networkidle' })
await page.locator('[data-scenario="pallet-processing"]').click()
await page.locator('[data-action="run-scenario"]').click()
await page.waitForFunction(() => document.querySelector('[data-scenario-status]')?.textContent === 'completed')
await page.screenshot({ path: path.join(output, 's25-complex-pallet-cnc-complete.png'), fullPage: true })

await page.goto(`${base}/?view=cell-editor`, { waitUntil: 'networkidle' })
const cnc = page.locator('[data-placement="cnc-1"]')
const robot = page.locator('[data-placement="robot-1"]')
const cncBox = await cnc.boundingBox(); const robotBox = await robot.boundingBox()
if (!cncBox || !robotBox) throw new Error('Editor placements were not rendered.')
await page.mouse.move(cncBox.x + cncBox.width / 2, cncBox.y + cncBox.height / 2)
await page.mouse.down(); await page.mouse.move(robotBox.x + robotBox.width / 2, robotBox.y + robotBox.height / 2, { steps: 8 }); await page.mouse.up()
await page.locator('[data-invalid-indicator]').waitFor({ state: 'visible' })
await page.screenshot({ path: path.join(output, 's25-editor-overlap-diagnostic.png'), fullPage: true })

await page.goto('http://127.0.0.1:5071/swagger/index.html', { waitUntil: 'networkidle' })
await page.screenshot({ path: path.join(output, 's25-backend-api-swagger.png'), fullPage: true })

await browser.close()
console.log(`Captured evidence in ${output}`)
