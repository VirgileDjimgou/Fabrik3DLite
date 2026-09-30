/**
 * End-to-end demo video recorder (HMI -> orchestrator -> simulator).
 *
 * Records ONE continuous video of the complete flow:
 *   server (console + API) / HMI operator / 3D simulator, in a single page with
 *   live iframes and a server console pane, step-by-step captions in French.
 *
 * Prerequisites (started separately):
 *   - orchestrator on DEMO_API_URL   (default https://localhost:7351)
 *   - HMI dev server on DEMO_HMI_URL (default http://localhost:5174)
 *   - simulator dev server on DEMO_SIM_URL (default http://localhost:56055)
 *
 * Usage:
 *   node scripts/record-demo-video.mjs            # record (webm) into ../../artifacts/demo/video
 *   FAST=1 RECORD=0 node scripts/record-demo-video.mjs   # quick dry run, no video
 */
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')
const ART = path.join(ROOT, 'artifacts', 'demo', 'video')
const SERVER_LOG = process.env.DEMO_SERVER_LOG ?? path.join(ART, 'server-console.log')

const HMI_URL = process.env.DEMO_HMI_URL ?? 'http://localhost:5174'
const SIM_URL = process.env.DEMO_SIM_URL ?? 'http://localhost:56055'
const API_URL = (process.env.DEMO_API_URL ?? 'https://localhost:7351').replace(/\/+$/, '')

const RECORD = process.env.RECORD !== '0'
const FAST = process.env.FAST === '1'
const JOB_NAME = process.env.DEMO_JOB_NAME ?? 'DEMO VIDEO - Usinage palette CNC'
const VIEWPORT = { width: 1600, height: 900 }

const stamp = new Date().toISOString().slice(11, 19)
console.log(`[${stamp}] recorder starting (record=${RECORD}, fast=${FAST})`)
console.log(`[${stamp}] hmi=${HMI_URL} sim=${SIM_URL} api=${API_URL}`)

// ── API helpers (server side, outside the browser) ──────────────────

let adminToken = null
async function api(pathname, options = {}) {
  const res = await fetch(`${API_URL}/api${pathname}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}),
      ...(options.headers ?? {}),
    },
  })
  if (res.status === 204) return undefined
  if (!res.ok) throw new Error(`API ${pathname} -> ${res.status}`)
  return res.json()
}

async function loginAdmin() {
  const res = await fetch(`${API_URL}/api/auth/dev-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'Administrator', subject: 'demo-video-recorder' }),
  })
  if (!res.ok) throw new Error(`dev-token -> ${res.status}`)
  adminToken = (await res.json()).accessToken
}

async function cleanupOldDemoJobs() {
  try {
    const jobs = await api('/jobs')
    const stale = jobs.filter((j) => j.name.startsWith('DEMO VIDEO'))
    for (const job of stale) {
      await api(`/jobs/${job.id}`, { method: 'DELETE' })
      console.log(`cleaned old demo job ${job.id} (${job.name})`)
    }
  } catch (err) {
    console.warn('cleanup skipped:', err.message)
  }
}

// ── Wrapper page (one page = one continuous video) ──────────────────

function wrapperHtml() {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;background:#08141f;color:#e8f3f7;font-family:'Segoe UI',system-ui,sans-serif;overflow:hidden}
  #caption{height:88px;box-sizing:border-box;padding:12px 20px;background:linear-gradient(90deg,#052234,#0c3a58 60%,#0a5a4a);border-bottom:2px solid #00cc88}
  #caption h1{margin:0;font-size:21px;color:#7ff0c0;letter-spacing:.02em}
  #caption p{margin:4px 0 0;font-size:13.5px;color:#a9cede}
  #stage{height:calc(100% - 88px);display:grid;gap:6px;padding:6px;box-sizing:border-box}
  .pane{position:relative;background:#0d2233;border:1px solid #1d4d66;border-radius:6px;overflow:hidden;min-width:0;min-height:0}
  .pane .tag{position:absolute;top:0;left:0;z-index:9;background:#00202ee8;color:#7ff0c0;font-size:11px;padding:3px 10px;border-bottom-right-radius:6px;letter-spacing:.08em;font-weight:600}
  iframe{width:100%;height:100%;border:0;background:#fff;display:block}
  .server-pane{display:flex;flex-direction:column}
  #srvlog{flex:1;min-height:0;margin:0;padding:26px 12px 8px;overflow:hidden;font:11.5px/1.42 Consolas,'Courier New',monospace;color:#bfe8d0;white-space:pre-wrap;box-sizing:border-box}
  #stats{margin:0;padding:8px 12px;font:12px/1.5 Consolas,'Courier New',monospace;color:#ffd479;background:#06131d;border-top:1px solid #1d4d66;white-space:pre-wrap;min-height:96px;box-sizing:border-box}
  body[data-mode="server"] .pane-hmi,body[data-mode="server"] .pane-sim{display:none}
  body[data-mode="server"] #stage{grid-template-columns:1fr}
  body[data-mode="hmi"] .pane-sim,body[data-mode="hmi"] .pane-srv{display:none}
  body[data-mode="hmi"] #stage{grid-template-columns:1fr}
  body[data-mode="sim"] .pane-hmi,body[data-mode="sim"] .pane-srv{display:none}
  body[data-mode="sim"] #stage{grid-template-columns:1fr}
  body[data-mode="split"] .pane-srv{display:none}
  body[data-mode="split"] #stage{grid-template-columns:1fr 1fr}
  body[data-mode="trio"] #stage{grid-template-columns:1fr 1fr;grid-template-rows:minmax(0,1fr) 236px}
  body[data-mode="trio"] .pane-srv{grid-column:1 / span 2}
</style></head>
<body data-mode="server">
  <div id="caption"><h1 id="cap-title">Fabrik3D</h1><p id="cap-sub"></p></div>
  <div id="stage">
    <div class="pane pane-hmi"><span class="tag">HMI OPERATEUR - ${HMI_URL}</span><iframe id="hmi-frame" src="${HMI_URL}"></iframe></div>
    <div class="pane pane-sim"><span class="tag">SIMULATEUR 3D - ${SIM_URL}</span><iframe id="sim-frame" src="${SIM_URL}"></iframe></div>
    <div class="pane pane-srv server-pane"><span class="tag">SERVEUR ORCHESTRATEUR ASP.NET CORE - ${API_URL}</span><pre id="srvlog"></pre><pre id="stats"></pre></div>
  </div>
  <script>
    window.__demo = {
      cap(t, s) { document.getElementById('cap-title').textContent = t; document.getElementById('cap-sub').textContent = s || '' },
      mode(m) { document.body.dataset.mode = m },
      srv(t) { document.getElementById('srvlog').textContent = t },
      stats(t) { document.getElementById('stats').textContent = t },
    }
  </script>
</body></html>`
}

function tailLog(maxLines = 60) {
  try {
    const text = fs.readFileSync(SERVER_LOG, 'utf8')
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
    return lines.slice(-maxLines).join('\n')
  } catch {
    return '(server log unavailable)'
  }
}

// ── Main scenario ───────────────────────────────────────────────────

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  fs.mkdirSync(ART, { recursive: true })
  await loginAdmin()
  await cleanupOldDemoJobs()

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: VIEWPORT,
    ignoreHTTPSErrors: true,
    ...(RECORD ? { recordVideo: { dir: ART, size: VIEWPORT } } : {}),
  })
  const page = await context.newPage()
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log(`[browser:${msg.type()}] ${msg.text().slice(0, 220)}`)
    }
  })
  page.on('pageerror', (err) => console.log(`[browser:pageerror] ${String(err).slice(0, 300)}`))
  let videoPath = null

  // Live server panes: console tail + server-side REST projection.
  let lastLog = ''
  const logTimer = setInterval(async () => {
    const txt = tailLog()
    if (txt !== lastLog) {
      lastLog = txt
      await page.evaluate((t) => window.__demo?.srv(t), txt).catch(() => {})
    }
  }, 1000)

  let currentJobId = null
  const statsTimer = setInterval(async () => {
    try {
      const jobs = await api('/jobs')
      const ours = jobs.find((j) => j.id === currentJobId) ?? jobs.find((j) => j.name === JOB_NAME)
      if (!ours) return
      currentJobId = ours.id
      let sess
      if (ours.simulationSessionId) {
        try { sess = await api(`/simulation-sessions/${ours.simulationSessionId}`) } catch { /* not yet */ }
      }
      let machine
      try { machine = await api('/machine-state/current') } catch { /* none yet */ }
      const line = (v) => (v === undefined || v === null ? '-' : String(v))
      const txt =
        `SERVEUR -> JOB      ${line(ours.id.slice(-6))}   status=${line(ours.status)}\n` +
        `SERVEUR -> SESSION  ${line(sess?.id?.slice(-6))}   status=${line(sess?.status)}  phase=${line(sess?.currentPhase)}\n` +
        `SERVEUR -> COMPTEUR machined=${line(sess?.machinedCount)} remaining=${line(sess?.remainingCount)} total=${line(sess?.totalCount)}\n` +
        `SERVEUR -> MACHINE  robot=${line(machine?.robotState)} cnc=${line(machine?.cncState)} slot=R${line(machine?.currentSlotRow)}C${line(machine?.currentSlotColumn)}`
      await page.evaluate((t) => window.__demo?.stats(t), txt).catch(() => {})
    } catch { /* server offline */ }
  }, 2000)

  const setCaption = async (title, sub = '') => {
    console.log(`CAPTION: ${title}${sub ? ' | ' + sub : ''}`)
    await page.evaluate(([t, s]) => window.__demo.cap(t, s), [title, sub])
  }
  const setMode = async (mode) => {
    console.log(`MODE: ${mode}`)
    await page.evaluate((m) => window.__demo.mode(m), mode)
  }
  const wait = (ms) => page.waitForTimeout(FAST ? Math.min(ms, 1500) : ms)

  const hmi = page.frameLocator('#hmi-frame')
  const sim = page.frameLocator('#sim-frame')

  try {
    await page.setContent(wrapperHtml(), { waitUntil: 'domcontentloaded' })
    await page.evaluate((mode) => window.__demo.mode(mode), 'server')

    // ── 0. Intro ────────────────────────────────────────────────
    await setCaption(
      'Fabrik3D - Job cree au HMI, execute par le Simulateur',
      'Serveur orchestrateur + HMI operateur + Simulateur 3D - demonstration de bout en bout',
    )
    await wait(14_000)

    // ── 1. Server module ────────────────────────────────────────
    await setMode('server')
    await setCaption(
      '1. Module Serveur - orchestrateur ASP.NET Core (Development)',
      `${API_URL} - MongoDB local (base dediee demo) - API REST + SignalR /hubs/orchestration`,
    )
    const version = await fetch(`${API_URL}/api/version`).then((r) => r.json())
    const health = await fetch(`${API_URL}/api/health/ready`).then((r) => r.text())
    const authCfg = await fetch(`${API_URL}/api/auth/config`).then((r) => r.json())
    await page.evaluate(
      ([v, h, a]) => window.__demo.stats(
        `GET /api/version      -> ${v.version} (${v.environment}, runtime ${v.runtime})\n` +
        `GET /api/health/ready -> ${h.slice(0, 120)}\n` +
        `GET /api/auth/config  -> mode=${a.mode} developmentAuth=${a.developmentAuth}`,
      ),
      [version, health, authCfg],
    )
    await wait(22_000)
    await setCaption(
      'Le serveur est la source de verite de l orchestration',
      'Le HMI cree le job, le simulateur le revendique, le serveur diffuse l etat aux deux via SignalR',
    )
    await wait(10_000)

    // ── 2. HMI login ────────────────────────────────────────────
    await setMode('hmi')
    await setCaption('2. Module HMI operateur', `${HMI_URL} - interface de supervision operateur (multi-langue)`)
    await hmi.getByTestId('hmi-login').waitFor({ timeout: 90_000 })
    await wait(4_000)
    await setCaption('Connexion operateur (JWT emis par le serveur)', 'Mode authentification Development - pas une securite de production')
    await hmi.locator('#hmi-login-subject').fill('operateur-demo')
    await hmi.locator('#hmi-login-role').selectOption('Operator')
    await wait(1_500)
    await hmi.getByTestId('hmi-login-submit').click()
    await hmi.getByRole('link', { name: 'New Job' }).waitFor({ timeout: 30_000 })
    await wait(8_000)

    // ── 3. Create job ───────────────────────────────────────────
    await setCaption(
      '3. Creation du job depuis le HMI',
      `"${JOB_NAME}" - le job reste en statut Created (aucun demarrage ici)`,
    )
    await hmi.getByRole('link', { name: 'New Job' }).click()
    await hmi.locator('form input[type="text"]').fill(JOB_NAME)
    await hmi.locator('form textarea').fill('Job cree depuis le HMI pour la demonstration video Fabrik3D')
    await wait(2_500)
    await hmi.getByRole('button', { name: 'Create' }).click()
    await hmi.getByText('Job created successfully.').waitFor({ timeout: 20_000 })
    await wait(8_000)

    // ── 4. Job list ─────────────────────────────────────────────
    await hmi.getByRole('link', { name: 'Back' }).click()
    await hmi.getByText(JOB_NAME).first().waitFor({ timeout: 20_000 })
    await setCaption(
      'Le job apparait cote serveur en statut Created',
      'C est le simulateur qui va le revendiquer (claim) - sinon il tournerait en mode local sans serveur',
    )
    await wait(12_000)

    // ── 5. Simulator + auth ─────────────────────────────────────
    await setMode('sim')
    await setCaption('4. Module Simulateur - cellule robotisee 3D', `${SIM_URL} - scene CNC tending, signaux et cinematique embarques`)
    await sim.locator('[data-auth-open]').waitFor({ timeout: 90_000 })
    await wait(8_000)
    await setCaption('Connexion du simulateur (identite operateur)', 'Le simulateur ne fabrique jamais d identite : jeton serveur requis')
    await sim.locator('[data-auth-open]').click()
    await sim.locator('[data-auth-subject]').fill('simulateur-demo')
    await sim.locator('[data-auth-role]').selectOption('Operator')
    await sim.locator('[data-auth-submit]').click()
    await sim.locator('[data-auth-identity]').waitFor({ timeout: 30_000 })
    await wait(3_000)
    // The hub requires an authenticated principal: reload once so the bridge opens an authenticated
    // SignalR connection (the initial page load happened before the operator signed in).
    await setCaption(
      'Reconnexion du simulateur avec l identite operateur',
      'Le hub SignalR /hubs/orchestration est protege : la connexion est retablie avec le jeton operateur',
    )
    const simFrameObj = page.frames().find((f) => f.url().startsWith(SIM_URL))
    if (simFrameObj) await simFrameObj.goto(SIM_URL, { waitUntil: 'domcontentloaded' })
    await sim.locator('[data-auth-identity]').waitFor({ timeout: 90_000 })
    await sim.locator('.dashboard').waitFor({ timeout: 90_000 })
    await wait(8_000)

    // ── 6. Claim from simulator Start ───────────────────────────
    await setMode('split')
    await setCaption(
      '5. Start du panneau "Pallet machining" cote simulateur',
      'Le bridge cherche un job runnable sur le serveur et le revendique (POST /api/jobs/{id}/claim)',
    )
    // 2x simulation speed for a watchable demo.
    await sim.locator('.step-panel .speed input[type="range"]').evaluate((el) => {
      el.value = '2'
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }).catch(() => {})
    const startButton = sim.locator('.dashboard .btn-row button').first()
    let claimed = false
    for (let attempt = 0; attempt < 40 && !claimed; attempt += 1) {
      await startButton.click().catch(() => {})
      await page.waitForTimeout(FAST ? 400 : 1_500)
      claimed = (await sim.locator('.state-bar.running').count()) > 0
    }
    if (!claimed) throw new Error('simulator start did not reach running state')
    await sim.locator('.dashboard .mode-bar', { hasText: /ORCHESTR/i }).waitFor({ timeout: 30_000 })
    await setCaption(
      'Job revendique : session creee cote serveur, statut Running',
      'La barre de mode passe a "ONLINE - ORCHESTRATED BY SERVER" et les identifiants Job/Session apparaissent',
    )
    await wait(18_000)

    // ── 7. Execution in the simulator ───────────────────────────
    await setMode('sim')
    await setCaption('6. Execution de la cellule par le simulateur', 'Palette -> robot -> CNC -> retour piece, pilote par les signaux industriels')
    const phaseCaption = {
      SELECT_NEXT_SLOT: 'Selection de l emplacement suivant sur la palette',
      MOVE_ABOVE_PALLET_SLOT: 'Approche de la piece brute au-dessus de la palette',
      DESCEND_TO_PICK: 'Descente et prehension de la piece',
      PICK_PART: 'Pince fermee - piece saisie',
      MOVE_TO_CNC_APPROACH: 'Transfert vers la machine CNC',
      OPEN_CNC_DOOR: 'Ouverture de la porte CNC',
      MOVE_TO_CNC_INSERT: 'Insertion de la piece dans la CNC',
      LOAD_PART: 'Depose de la piece dans le mandrin',
      CLOSE_CNC_DOOR: 'Fermeture de la porte CNC',
      MACHINING: 'Usinage CNC en cours (broche, avance, arrosage)',
      OPEN_CNC_DOOR_RETRIEVE: 'Ouverture de la porte pour recuperer la piece',
      RETRIEVE_PART: 'Recuperation de la piece usinee',
      MOVE_ABOVE_ORIGIN_SLOT: 'Retour de la piece usinee vers la palette',
      PLACE_PART_BACK: 'Remise de la piece usinee dans son emplacement',
    }
    const phaseSeen = new Set()
    const executionDeadline = Date.now() + (FAST ? 45_000 : 420_000)
    let machinedTarget = FAST ? 2 : 4
    let machiningHeld = false
    while (Date.now() < executionDeadline) {
      const phase = await sim.locator('.phase-value').textContent().catch(() => null)
      const machined = Number(await sim.locator('.metrics .metric').first().locator('.metric-val').textContent().catch(() => '0'))
      if (phase && !phaseSeen.has(phase) && phaseCaption[phase]) {
        phaseSeen.add(phase)
        await setCaption('6. Execution de la cellule par le simulateur', phaseCaption[phase])
        if (phase === 'MACHINING' && !machiningHeld) {
          machiningHeld = true
          await wait(6_000)
        }
      }
      if (machined >= machinedTarget) break
      await page.waitForTimeout(FAST ? 500 : 2_000)
    }
    await setCaption('Pieces usinees : compteur temps reel cote simulateur', 'Chaque transition de phase est publiee vers le serveur (session + machine-state)')
    await wait(12_000)

    // ── 8. HMI supervision ──────────────────────────────────────
    await setMode('hmi')
    await setCaption('7. Supervision temps reel cote HMI', 'Le simulateur pousse phase, compteurs et etat machine ; le HMI les affiche via SignalR')
    await hmi.getByRole('link', { name: 'Job', exact: true }).click()
    await hmi.getByText(JOB_NAME).first().waitFor({ timeout: 30_000 })
    await hmi.getByText('Machine State').first().waitFor({ timeout: 30_000 })
    await wait(8_000)
    await setCaption(
      'Meme job, meme session, meme etat machine que le simulateur',
      'Statut Running, phase courante, palier usine/restant, robot et CNC en direct',
    )
    await wait(32_000)

    // ── 9. Pause from HMI ───────────────────────────────────────
    await setMode('trio')
    await setCaption('8. Commande HMI -> Simulateur : PAUSE', 'Le HMI appelle POST /api/jobs/{id}/pause ; le serveur notifie le simulateur par SignalR')
    await hmi.getByRole('button', { name: 'Pause' }).click()
    await wait(1_500)
    await hmi.locator('.hmi-confirm button.btn-hmi').click()
    await hmi.getByText('Paused', { exact: true }).first().waitFor({ timeout: 30_000 })
    await sim.locator('.state-bar.paused').waitFor({ timeout: 30_000 })
    await setCaption('Pause propagee : le simulateur s arrete, la session passe Paused', 'Le bras robotise et la CNC sont figes - commande confirmee cote serveur')
    await wait(18_000)

    // ── 10. Resume from HMI ─────────────────────────────────────
    await setCaption('9. Commande HMI -> Simulateur : REPRISE', 'Meme chaine : REST -> SignalR -> reprise de la cellule')
    await hmi.getByRole('button', { name: 'Resume' }).click()
    await wait(1_500)
    await hmi.locator('.hmi-confirm button.btn-hmi').click()
    await sim.locator('.state-bar.running').waitFor({ timeout: 30_000 })
    await hmi.getByText('Running', { exact: true }).first().waitFor({ timeout: 30_000 })
    await setCaption('Reprise effective dans les deux modules', 'Aucune action locale n a ete faite dans le simulateur : tout vient du HMI via le serveur')
    await wait(14_000)

    // ── 11. Stop from HMI ───────────────────────────────────────
    await setCaption('10. Commande HMI -> Simulateur : ARRET', 'Fin de mission : la session est cloturee cote serveur')
    await hmi.getByRole('button', { name: 'Stop' }).click()
    await wait(1_500)
    await hmi.locator('.hmi-confirm button.btn-hmi').click()
    await sim.locator('.state-bar.stopped').waitFor({ timeout: 30_000 })
    await hmi.getByText('Stopped', { exact: true }).first().waitFor({ timeout: 30_000 })
    await wait(12_000)

    // ── 12. Final server state ──────────────────────────────────
    await setMode('server')
    await setCaption('11. Etat final cote serveur', 'Job arrete, session et machine-state coherents avec les deux interfaces')
    await wait(18_000)

    // ── 13. Outro ───────────────────────────────────────────────
    await setCaption(
      'Fin de la demonstration - Serveur, HMI et Simulateur connectes de bout en bout',
      'Job cree au HMI -> revendique et execute par le simulateur -> supervise et commande depuis le HMI',
    )
    await wait(14_000)

    console.log(`[${new Date().toISOString().slice(11, 19)}] scenario complete`)
  } catch (error) {
    console.error('scenario failed:', error)
    await page.screenshot({ path: path.join(ART, 'failure.png') }).catch(() => {})
    process.exitCode = 1
  } finally {
    clearInterval(logTimer)
    clearInterval(statsTimer)
    const video = page.video()
    await context.close()
    await browser.close()
    if (video) videoPath = await video.path().catch(() => null)
    if (videoPath) console.log(`VIDEO: ${videoPath}`)
    console.log('done')
  }
}

main()
