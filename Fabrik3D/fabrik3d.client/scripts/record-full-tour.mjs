/**
 * Fabrik3D — full product tour recorder.
 *
 * Records the complete product tour as numbered chapter segments (one continuous
 * video per chapter), in French, with on-screen captions, chapter title cards,
 * visual marks (pulsing highlights) and a pointer, plus a caption timeline per
 * chapter used later to build the French voice-over (scripts/build-tour-audio.py).
 *
 * Prerequisites (started separately):
 *   - orchestrator (Development) on API_URL, fresh database Fabrik3D_Tour
 *   - HMI dev server on HMI_URL
 *   - simulator dev server on SIM_URL
 *
 * Usage:
 *   node scripts/record-full-tour.mjs                    # record all chapters
 *   FAST=1 RECORD=0 CHAPTERS=3,4 node scripts/record-full-tour.mjs   # dry-run two chapters
 */
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')
const ART = path.join(ROOT, 'artifacts', 'demo', 'tour')
const SEG = path.join(ART, 'segments')
const DOWNLOADS = path.join(ART, 'downloads')

const API_URL = (process.env.DEMO_API_URL ?? 'https://localhost:7351').replace(/\/+$/, '')
const HMI_URL = (process.env.DEMO_HMI_URL ?? 'http://localhost:5174').replace(/\/+$/, '')
const SIM_URL = (process.env.DEMO_SIM_URL ?? 'http://localhost:56055').replace(/\/+$/, '')
const SERVER_LOG = process.env.DEMO_SERVER_LOG ?? path.join(ART, 'server-console.log')

const RECORD = process.env.RECORD !== '0'
const FAST = process.env.FAST === '1'
const ONLY = (process.env.CHAPTERS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const VIEWPORT = { width: 1600, height: 900 }

const log = (msg) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`)

// ── Server API helpers ──────────────────────────────────────────────

const tokenCache = new Map()
const TOKEN_TTL_MS = 10 * 60 * 1000
async function devToken(role, subject) {
  const key = `${role}:${subject}`
  const cached = tokenCache.get(key)
  if (cached && Date.now() - cached.fetchedAt < TOKEN_TTL_MS) return cached
  const res = await fetch(`${API_URL}/api/auth/dev-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, subject }),
  })
  if (!res.ok) throw new Error(`dev-token ${role} -> ${res.status}`)
  const body = await res.json()
  const token = {
    token: body.accessToken,
    identity: { subject, name: subject, roles: [role], mode: body.mode ?? 'Development' },
    role,
    fetchedAt: Date.now(),
  }
  tokenCache.set(key, token)
  return token
}

const tok = (role, subject) => tokenCache.get(`${role}:${subject}`)?.token

async function apiRequest(method, pathname, { token, body } = {}) {
  const res = await fetch(`${API_URL}/api${pathname}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let parsed
  try { parsed = text ? JSON.parse(text) : undefined } catch { parsed = text }
  return { status: res.status, body: parsed }
}

async function apiJson(pathname, opts = {}) {
  return (await apiRequest('GET', pathname, opts)).body
}

async function createJobWithTasks(admin, name, slots) {
  const tasks = slots.map(([row, col]) => ({
    name: `Slot R${row}C${col}`,
    partType: 'raw-billet',
    palletId: 'pallet-0',
    slotRow: row,
    slotColumn: col,
  }))
  const res = await apiRequest('POST', '/jobs', {
    token: admin.token,
    body: { name, description: 'Tour vidéo Fabrik3D', machineMode: 'Automatic', tasks, metadata: { source: 'tour-video' } },
  })
  if (res.status >= 300) throw new Error(`create job -> ${res.status}`)
  return res.body
}

// ── Wrapper page (per chapter) ──────────────────────────────────────

function wrapperHtml({ hmiSrc, simSrc }) {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;background:#08141f;color:#eaf5f9;font-family:'Segoe UI',system-ui,sans-serif;overflow:hidden}
  #caption{height:92px;box-sizing:border-box;padding:12px 22px;background:linear-gradient(90deg,#04202f,#0b3a56 55%,#0a5a4a);border-bottom:2px solid #00cc88;position:relative;z-index:20}
  #caption h1{margin:0;font-size:21px;color:#7ff0c0;letter-spacing:.02em}
  #caption p{margin:4px 0 0;font-size:14px;color:#aed2e0}
  #chapter-tag{position:absolute;right:16px;top:14px;background:#00202ee8;border:1px solid #2c718b;color:#7ff0c0;font-size:12px;padding:4px 10px;border-radius:5px;letter-spacing:.08em}
  #stage{height:calc(100% - 92px);display:grid;gap:6px;padding:6px;box-sizing:border-box;position:relative}
  .pane{position:relative;background:#0d2233;border:1px solid #1d4d66;border-radius:6px;overflow:hidden;min-width:0;min-height:0}
  .pane .tag{position:absolute;top:0;left:0;z-index:9;background:#00202ee8;color:#7ff0c0;font-size:11px;padding:3px 10px;border-bottom-right-radius:6px;letter-spacing:.08em;font-weight:600}
  iframe{width:100%;height:100%;border:0;background:#fff;display:block}
  #srvpre{position:absolute;inset:0;margin:0;padding:28px 12px 8px;overflow:hidden;font:11.5px/1.4 Consolas,monospace;color:#bfe8d0;white-space:pre-wrap;box-sizing:border-box}
  #apipre{position:absolute;inset:0;margin:0;padding:28px 14px 10px;overflow:hidden;font:12px/1.5 Consolas,monospace;color:#ffd479;white-space:pre-wrap;box-sizing:border-box;background:#06131d}
  #board{padding:26px 30px;height:100%;box-sizing:border-box;overflow:hidden;font-size:15px;line-height:1.55}
  #board h2{color:#7ff0c0;margin:0 0 10px;font-size:22px}
  #board .row{display:flex;gap:14px;margin-top:16px}
  #board .box{flex:1;border:1px solid #2c718b;border-radius:10px;padding:14px 16px;background:#0b2434}
  #board .box h3{margin:0 0 6px;color:#8fd8f0;font-size:16px}
  #board .box p{margin:4px 0;color:#c8e3ee;font-size:13.5px}
  #board .chip{display:inline-block;border:1px solid #00cc88;color:#7ff0c0;border-radius:20px;padding:2px 10px;margin:3px 4px 0 0;font-size:12.5px}
  #board .arrow{font-size:26px;color:#00cc88;align-self:center}
  body[data-mode="title"] #stage,body[data-mode="title"] #caption{display:none}
  #titlecard{display:none;position:fixed;inset:0;z-index:40;background:radial-gradient(1000px 500px at 30% 20%,#0d3c5a 0%,#05121d 60%,#040b12 100%);padding:90px 80px;box-sizing:border-box}
  body[data-mode="title"] #titlecard{display:block}
  #titlecard .kicker{color:#00cc88;font-size:15px;letter-spacing:.35em;text-transform:uppercase;margin-bottom:18px}
  #titlecard h1{font-size:46px;margin:0 0 14px;color:#eafcff}
  #titlecard h2{font-size:19px;color:#9fd6e8;font-weight:400;margin:0 0 26px;max-width:1000px;line-height:1.5}
  #titlecard ul{font-size:16.5px;color:#c9e6f2;line-height:1.9;margin:0;padding-left:22px}
  #titlecard li::marker{color:#00cc88}
  #keypoint{display:none;position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:30;background:#00202eee;border:1px solid #00cc88;color:#aef7d6;padding:9px 22px;border-radius:8px;font-size:15px;max-width:70%;text-align:center;box-shadow:0 4px 22px #000a}
  .mk{position:fixed;z-index:25;border:3px solid #ffd23f;border-radius:8px;box-shadow:0 0 0 3px #ffd23f33,0 0 22px #ffd23f66;pointer-events:none;animation:mkp 1.4s ease-in-out infinite}
  .mk .mkl{position:absolute;top:-24px;left:-3px;background:#ffd23f;color:#20180a;font:600 12px 'Segoe UI';padding:2px 9px;border-radius:5px;white-space:nowrap}
  @keyframes mkp{0%,100%{opacity:.95}50%{opacity:.55}}
  #ptr{position:fixed;z-index:26;width:16px;height:16px;border-radius:50%;background:#00e1ff;border:3px solid #00394a;box-shadow:0 0 15px #00e1ffcc;transform:translate(-50%,-50%);pointer-events:none;display:none}
  body[data-mode="server"] .pane-hmi,body[data-mode="server"] .pane-sim,body[data-mode="server"] .pane-board{display:none}
  body[data-mode="server"] #stage{grid-template-columns:1fr}
  body[data-mode="hmi"] .pane-sim,body[data-mode="hmi"] .pane-srv,body[data-mode="hmi"] .pane-board{display:none}
  body[data-mode="hmi"] #stage{grid-template-columns:1fr}
  body[data-mode="sim"] .pane-hmi,body[data-mode="sim"] .pane-srv,body[data-mode="sim"] .pane-board{display:none}
  body[data-mode="sim"] #stage{grid-template-columns:1fr}
  body[data-mode="board"] .pane-hmi,body[data-mode="board"] .pane-sim,body[data-mode="board"] .pane-srv{display:none}
  body[data-mode="board"] #stage{grid-template-columns:1fr}
  body[data-mode="split"] .pane-srv,body[data-mode="split"] .pane-board{display:none}
  body[data-mode="split"] #stage{grid-template-columns:1fr 1fr}
  body[data-mode="hmi-server"] .pane-sim,body[data-mode="hmi-server"] .pane-board{display:none}
  body[data-mode="hmi-server"] #stage{grid-template-columns:1.35fr 1fr}
  body[data-mode="sim-server"] .pane-hmi,body[data-mode="sim-server"] .pane-board{display:none}
  body[data-mode="sim-server"] #stage{grid-template-columns:1.35fr 1fr}
  body[data-mode="trio"] #stage{grid-template-columns:1fr 1fr;grid-template-rows:minmax(0,1fr) 232px}
  body[data-mode="trio"] .pane-srv{grid-column:1 / span 2}
</style></head>
<body data-mode="server">
  <div id="caption"><h1 id="cap-title"></h1><p id="cap-sub"></p><span id="chapter-tag"></span></div>
  <div id="titlecard"><div class="kicker" id="tc-kicker"></div><h1 id="tc-title"></h1><h2 id="tc-sub"></h2><ul id="tc-points"></ul></div>
  <div id="keypoint"></div>
  <div id="ptr"></div>
  <div id="stage">
    <div class="pane pane-hmi"><span class="tag">HMI OPÉRATEUR</span><iframe id="hmi-frame" src="${hmiSrc ?? HMI_URL}"></iframe></div>
    <div class="pane pane-sim"><span class="tag">SIMULATEUR 3D</span><iframe id="sim-frame" src="${simSrc ?? SIM_URL}"></iframe></div>
    <div class="pane pane-srv"><span class="tag">SERVEUR / API</span><pre id="srvpre"></pre><pre id="apipre" style="display:none"></pre></div>
    <div class="pane pane-board"><span class="tag">VUE D'ENSEMBLE</span><div id="board"></div></div>
  </div>
  <script>
    window.__demo = {
      cap(t, s) { document.getElementById('cap-title').textContent = t; document.getElementById('cap-sub').textContent = s || '' },
      tag(t) { document.getElementById('chapter-tag').textContent = t || '' },
      title({ kicker, title, sub, points }) {
        document.getElementById('tc-kicker').textContent = kicker || ''
        document.getElementById('tc-title').textContent = title || ''
        document.getElementById('tc-sub').textContent = sub || ''
        const ul = document.getElementById('tc-points'); ul.innerHTML = ''
        ;(points || []).forEach((p) => { const li = document.createElement('li'); li.textContent = p; ul.appendChild(li) })
      },
      mode(m) { document.body.dataset.mode = m },
      srv(t) { document.getElementById('srvpre').textContent = t },
      api(t) { const el = document.getElementById('apipre'); el.style.display = 'block'; document.getElementById('srvpre').style.display = 'none'; el.textContent = t },
      board(html) { document.getElementById('board').innerHTML = html },
      key(t) { const el = document.getElementById('keypoint'); if (!t) { el.style.display = 'none'; return } el.style.display = 'block'; el.textContent = t },
      marks(list) {
        document.querySelectorAll('.mk').forEach((n) => n.remove())
        ;(list || []).forEach((m) => {
          const d = document.createElement('div'); d.className = 'mk'
          d.style.left = m.x + 'px'; d.style.top = m.y + 'px'; d.style.width = m.w + 'px'; d.style.height = m.h + 'px'
          if (m.label) { const l = document.createElement('span'); l.className = 'mkl'; l.textContent = m.label; d.appendChild(l) }
          document.body.appendChild(d)
        })
      },
      pointer({ x, y }) { const p = document.getElementById('ptr'); p.style.display = 'block'; p.style.left = x + 'px'; p.style.top = y + 'px' },
      hidePointer() { document.getElementById('ptr').style.display = 'none' },
    }
  </script>
</body></html>`
}

function serverLogTail(maxLines = 55) {
  try {
    const lines = fs.readFileSync(SERVER_LOG, 'utf8').split(/\r?\n/).filter((l) => l.trim())
    return lines.slice(-maxLines).join('\n')
  } catch { return '(journal serveur indisponible)' }
}

// ── Chapter framework ───────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const chapters = []
const chapter = (def) => chapters.push(def)

// ── Chapter implementations ─────────────────────────────────────────

chapter({
  id: '01-intro',
  title: 'Ouverture — Fabrik3D, la cellule robotisée éducative',
  auth: {},
  run: async (t) => {
    await t.mode('title')
    await t.title({
      kicker: 'Fabrik3D 1.0 — visite guidée complète',
      title: 'Fabrik3D : simuler, superviser et comprendre une cellule robotisée',
      sub: "Visite pas à pas de toutes les fonctionnalités : opérateur, apprenant, instructeur, ingénieur et administrateur. Toutes les données affichées sont SIMULÉES.",
      points: [
        'Un orchestrateur serveur : jobs, sessions, alarmes, formation, API REST + SignalR',
        'Un HMI opérateur : créer, superviser et commander une mission',
        'Un simulateur 3D : cellule CNC, signaux industriels, pannes, cinématique, édition',
        'Des rôles vérifiés côté serveur : Learner, Operator, Engineer, Instructor, Administrator',
      ],
    })
    await t.cap("Fabrik3D — écosystème de simulation industrielle", "Trois interfaces, un seul serveur d'orchestration, des contrats partagés.", { hold: 9, voice: "Bienvenue dans cette visite guidée complète de Fabrik3D. Fabrik3D est un démonstrateur industriel éducatif : une cellule robotisée simulée, un serveur d'orchestration et une interface opérateur. Cette vidéo sert à la fois de démonstration et de guide utilisateur." })
    await t.mode('board')
    await t.board(`
      <h2>Architecture de l'écosystème</h2>
      <div class="row">
        <div class="box"><h3>Simulateur 3D (Vue + Three.js)</h3><p>Cellule CNC, robots, signaux E/S, pannes simulées, cinématique, édition de cellule.</p><p><span class="chip">Exécution</span><span class="chip">Apprentissage</span><span class="chip">Ingénierie</span></p></div>
        <div class="arrow">⇄</div>
        <div class="box"><h3>Serveur d'orchestration (.NET + MongoDB)</h3><p>Jobs, sessions, état machine, alarmes, formation et évaluation, historien, connecteurs, autorité de contrôle.</p><p><span class="chip">REST /api</span><span class="chip">SignalR /hubs</span></p></div>
        <div class="arrow">⇄</div>
        <div class="box"><h3>HMI opérateur (Vue)</h3><p>Missions, exécution courante, alarmes, messages, réglages, tableau instructeur.</p><p><span class="chip">Opérateur</span><span class="chip">Instructeur</span></p></div>
      </div>
      <p style="margin-top:14px;color:#8fb8c8">Rôles : Learner (apprenant) · Operator · Engineer (ingénieur) · Instructor · Administrator — exigences appliquées côté serveur.</p>`)
    await t.cap("Le serveur est la source de vérité", "Le HMI crée la mission, le simulateur la revendique, le serveur diffuse l'état aux deux via SignalR.", { hold: 9 })
    await t.cap("Toutes les données sont simulées", "Aucune machine réelle n'est connectée : l'écosystème est destiné à la formation et à la mise en service virtuelle.", { hold: 8, voice: "Toutes les valeurs, alarmes et mouvements sont simulés. Fabrik3D n'est ni un système de sécurité certifié, ni un émulateur de constructeur." })
  },
})

chapter({
  id: '02-serveur',
  title: "Chapitre 1 — Le serveur d'orchestration et son API",
  auth: { admin: { role: 'Administrator', subject: 'admin-tour' } },
  run: async (t) => {
    await t.mode('server')
    await t.cap("Le serveur : ASP.NET Core + MongoDB", "Il expose l'API REST, le hub SignalR, les migrations de schéma et l'observabilité.", { hold: 9 })
    await t.cap("Démarrage et journal serveur", "Authentification Development (démo), migrations appliquées, écoute HTTPS sur le port 7351.", { hold: 12 })
    const version = await apiJson('/version')
    const ready = await apiJson('/health/ready')
    const authCfg = await apiJson('/auth/config')
    await t.api(
      `GET /api/version -> ${JSON.stringify(version, null, 1)}\n\n` +
      `GET /api/health/ready -> ${JSON.stringify(ready).slice(0, 260)}\n\n` +
      `GET /api/auth/config -> ${JSON.stringify(authCfg).slice(0, 300)}`)
    await t.cap("Santé, version et découverte d'identité", "Liveness/readiness, profil de déploiement, runtime, et rôles disponibles pour la connexion.", { hold: 12 })
    const admin = { token: tok('Administrator', 'admin-tour') }
    const metrics = await apiJson('/diagnostics/metrics?format=json', admin)
    await t.api(
      `GET /api/diagnostics/metrics?format=json -> ${Array.isArray(metrics) ? metrics.length : '?'} séries\n` +
      `${JSON.stringify(Array.isArray(metrics) ? metrics.slice(0, 4) : metrics, null, 1).slice(0, 900)}\n\n` +
      `GET /api/diagnostics/status -> ${JSON.stringify(await apiJson('/diagnostics/status', admin)).slice(0, 260)}`)
    await t.cap("Observabilité intégrée (S49)", "Traces, métriques et compteurs exposés pour l'exploitation ; export externe désactivé par défaut.", { hold: 10 })
    const connectors = {}
    for (const p of ['opcua', 'mqtt', 'modbus']) connectors[p] = await apiJson(`/connectors/${p}`, admin)
    await t.api(
      `GET /api/connectors/opcua  -> state=${connectors.opcua.state}\n` +
      `GET /api/connectors/mqtt   -> state=${connectors.mqtt.state}\n` +
      `GET /api/connectors/modbus -> state=${connectors.modbus.state}\n\n` +
      `Historien : ${JSON.stringify(await apiJson('/historian/status', admin)).slice(0, 220)}`)
    await t.cap("Tout est désactivé par défaut (fail-closed)", "Connecteurs industriels et historien sont désactivés ; aucune écriture ne part vers un équipement réel.", { hold: 11 })
  },
})

chapter({
  id: '03-roles',
  title: 'Chapitre 2 — Rôles et authentification (RBAC)',
  auth: {},
  run: async (t) => {
    await t.mode('hmi')
    await t.cap("Connexion et rôles", "L'identité est délivrée par le serveur ; chaque rôle ouvre des surfaces différentes.", { hold: 8 })
    const hmi = t.hmi
    await hmi.getByTestId('hmi-login').waitFor({ timeout: 90000 })
    await t.login('Operator', 'demo-operateur')
    await t.cap("Opérateur : créer et commander", "Le rôle Operator peut créer des missions, commander et acquitter. La tuile « New Job » est visible.", { hold: 9 })
    await t.mark('#hmi-frame', hmi.getByRole('link', { name: 'New Job' }), 'New Job (Operator)')
    await t.cap("Opérateur connecté", "Badge de connexion vert : le HMI reçoit les événements SignalR du serveur.", { hold: 7 })
    await t.logout()
    await t.login('Learner', 'demo-apprenant')
    await t.cap("Apprenant : consulter et s'entraîner", "La tuile New Job disparaît : le rôle Learner ne peut pas créer de mission (contrôle serveur).", { hold: 9 })
    const newJobCount = await hmi.getByRole('link', { name: 'New Job' }).count()
    await t.key(`Tuile New Job visible : ${newJobCount} — le menu suit le rôle`)
    await t.wait(5)
    await t.key('')
    await t.logout()
    await t.login('Engineer', 'demo-ingenieur')
    await t.cap("Ingénieur : autorité et configuration", "Le rôle Engineer peut prendre l'autorité de contrôle et enregistrer des gabarits de cellule.", { hold: 9 })
    await t.mark('#hmi-frame', hmi.getByTestId('authority-takeover'), 'Takeover (Engineer)')
    await t.logout()
    await t.login('Instructor', 'demo-instructeur')
    await t.cap("Instructeur : pilotage pédagogique", "Le lien « Instructor » apparaît : classes, affectations, sessions et corrections.", { hold: 9 })
    await t.mark('#hmi-frame', hmi.getByTestId('hmi-instructor-link'), 'Tableau instructeur')
    await t.cap("Sécurité vérifiée côté serveur", "Même en forgeant l'URL, chaque endpoint re-vérifie le rôle : le serveur reste l'autorité.", { hold: 9 })
  },
})

chapter({
  id: '04-operator-jobs',
  title: 'Chapitre 3 — Opérateur : créer, revendiquer et commander une mission',
  auth: { hmi: { role: 'Operator', subject: 'demo-operateur' }, sim: { role: 'Operator', subject: 'demo-simulateur' } },
  run: async (t) => {
    await t.mode('hmi')
    await t.cap("HMI opérateur — tableau de bord", "Tuiles vers les missions, l'exécution courante, les alarmes, les messages et les réglages.", { hold: 8 })
    const hmi = t.hmi
    await hmi.getByRole('link', { name: 'New Job' }).waitFor({ timeout: 60000 })
    await hmi.getByRole('link', { name: 'New Job' }).click()
    await t.cap("Création d'une mission", "Nom, description, mode machine : la mission est créée en statut Created, sans démarrer.", { hold: 8 })
    await t.mark('#hmi-frame', hmi.locator('form input[type="text"]'), 'Nom de la mission')
    await hmi.locator('form input[type="text"]').fill('TOUR VIDEO - Usinage palette')
    await hmi.locator('form textarea').fill('Mission créée depuis le HMI pendant la visite guidée')
    await t.wait(2)
    await hmi.getByRole('button', { name: 'Create' }).click()
    await hmi.getByText('Job created successfully.').waitFor({ timeout: 20000 })
    await t.cap("Mission créée", "Le serveur l'enregistre et prévient tous les clients par l'événement JobStateChanged.", { hold: 8 })
    await t.clearMarks()
    await hmi.getByRole('link', { name: 'Back' }).click()
    await hmi.getByText('TOUR VIDEO - Usinage palette').first().waitFor({ timeout: 20000 })
    await t.mark('#hmi-frame', hmi.getByText('TOUR VIDEO - Usinage palette').first(), 'Statut : Created')
    await t.cap("Liste des missions", "Statut Created : personne ne l'exécute encore. C'est le simulateur qui va la revendiquer.", { hold: 9, voice: "La mission attend un simulateur. Regardez bien : le HMI ne la démarre pas lui-même ; c'est le simulateur qui la revendique auprès du serveur, ce qui évite toute double exécution." })
    await t.mode('split')
    await t.cap("Le simulateur revendique la mission", "Panneau Pallet machining → Start : le simulateur cherche une mission exécutable et la revendique (claim).", { hold: 9 })
    await t.sim.locator('.dashboard').waitFor({ timeout: 90000 })
    await t.sim.locator('.step-panel .speed input[type="range"]').evaluate((el) => {
      el.value = '2'; el.dispatchEvent(new Event('input', { bubbles: true }))
    }).catch(() => {})
    const startButton = t.sim.locator('.dashboard .btn-row button').first()
    let claimed = false
    for (let i = 0; i < 40 && !claimed; i += 1) {
      await startButton.click().catch(() => {})
      await t.page.waitForTimeout(FAST ? 400 : 1500)
      claimed = (await t.sim.locator('.state-bar.running').count()) > 0
    }
    if (!claimed) throw new Error('start non effectif')
    await t.sim.locator('.dashboard .mode-bar', { hasText: /ORCHESTR|SERVEUR/i }).waitFor({ timeout: 30000 })
    await t.mark('#sim-frame', t.sim.locator('.dashboard .mode-bar'), 'ONLINE — orchestré par le serveur')
    await t.cap("Mission revendiquée", "Session créée côté serveur, statut Running, identifiants Job/Session affichés dans le panneau.", { hold: 10 })
    await t.clearMarks()
    await t.mode('hmi')
    await t.cap("Supervision de l'exécution", "Le HMI affiche le même job, la même session et le même état machine, poussés par le simulateur.", { hold: 8 })
    await hmi.getByRole('link', { name: 'Job', exact: true }).click()
    await hmi.getByText('TOUR VIDEO - Usinage palette').first().waitFor({ timeout: 30000 })
    await hmi.getByText('Machine State').first().waitFor({ timeout: 30000 })
    await t.mark('#hmi-frame', hmi.getByText('Machine State').first(), 'État machine temps réel')
    await t.cap("Même état que le simulateur", "Phase, emplacement, robot et CNC sont diffusés par SignalR — sans rechargement.", { hold: 10 })
    await t.clearMarks()
    await t.mode('split')
    await t.cap("Commandes opérateur : Pause", "Chaque commande demande confirmation et identifie la mission cible.", { hold: 8 })
    await hmi.getByRole('button', { name: 'Pause' }).click()
    await t.wait(1.5)
    await t.mark('#hmi-frame', hmi.locator('.hmi-confirm'), 'Confirmation requise')
    await hmi.locator('.hmi-confirm button.btn-hmi').click()
    await t.sim.locator('.state-bar.paused').waitFor({ timeout: 30000 })
    await t.cap("Pause propagée au simulateur", "REST → serveur → SignalR : la cellule s'arrête sans aucune action locale dans le simulateur.", { hold: 9 })
    await t.clearMarks()
    await hmi.getByRole('button', { name: 'Resume' }).click()
    await t.wait(1.5)
    await hmi.locator('.hmi-confirm button.btn-hmi').click()
    await t.sim.locator('.state-bar.running').waitFor({ timeout: 30000 })
    await t.cap("Reprise", "La mission repart là où elle s'était arrêtée.", { hold: 7 })
    await hmi.getByRole('button', { name: 'Stop' }).click()
    await t.wait(1.5)
    await hmi.locator('.hmi-confirm button.btn-hmi').click()
    await t.sim.locator('.state-bar.stopped').waitFor({ timeout: 30000 })
    await t.cap("Arrêt de la mission", "La session est clôturée côté serveur ; le tableau de bord et le HMI repassent en arrêt.", { hold: 9 })
  },
})

chapter({
  id: '05-scenes',
  title: 'Chapitre 4 — Scènes prédéfinies et scénarios guidés',
  auth: { sim: { role: 'Operator', subject: 'demo-simulateur' } },
  run: async (t) => {
    await t.mode('sim')
    await t.gotoSim(`${SIM_URL}/?view=scene-presets`)
    await t.cap("Cinq cellules industrielles prêtes à l'emploi", "Chaque preset indique son état (Simulation ready), son nombre de scénarios et un résumé pédagogique.", { hold: 9 })
    const sim = t.sim
    await sim.locator('[data-scene-selector] summary').click()
    await t.wait(1)
    const presets = ['cnc-machine-tending', 'vision-sorting', 'robot-palletizing', 'assembly-inspection', 'robot-safety-training']
    const labels = {
      'cnc-machine-tending': "CNC machine tending — la cellule de référence complète",
      'vision-sorting': 'Tri par vision — convoyeur, photoélectrique, lecteur, éjecteur et bacs',
      'robot-palletizing': 'Palettisation robotisée — préhenseur à vide et tampons de palettes',
      'assembly-inspection': "Assemblage et inspection — montage, serrage, contrôle et sortie",
      'robot-safety-training': "Sécurité robot — portillon, scanner de zone et arrêt d'urgence",
    }
    for (const id of presets) {
      await sim.locator('[data-scene-select]').selectOption(id)
      await t.wait(0.8)
      await t.cap(labels[id], "Données simulées — usage formation uniquement.", { hold: 7 })
      await t.mark('#sim-frame', sim.locator('[data-scene-capability]'), 'État de la scène')
      await t.clearMarks()
    }
    await sim.locator('[data-action="reset-scene"]').click()
    await t.cap("Panneau de scénarios", "Onze scénarios guidés, du débutant à avancé : axes robot, repères, prise et dépose, chargement CNC, usinage complet.", { hold: 8 })
    await t.gotoSim(`${SIM_URL}/?view=scenario`)
    await sim.locator('[data-scenario]').first().waitFor({ timeout: 30000 })
    for (const id of ['robot-axes', 'coordinate-frames', 'pallet-processing']) {
      await sim.locator(`[data-scenario="${id}"]`).click()
      await t.wait(0.7)
      await t.mark('#sim-frame', sim.locator('[data-selected-scenario]'), 'Scénario sélectionné')
      await t.cap(`Scénario : ${id}`, "Objectifs et niveau affichés ; le déroulé est piloté par les événements simulés.", { hold: 7 })
      await t.clearMarks()
    }
    await sim.locator('[data-action="run-scenario"]').click()
    await sim.locator('[data-scenario-status]', { hasText: 'completed' }).waitFor({ timeout: 30000 })
    await t.mark('#sim-frame', sim.locator('[data-scenario-status-panel]'), 'Scénario terminé — 100%')
    await t.cap("Scénario complété", "Le moteur de scénario vérifie chaque action attendue et produit un rapport d'apprentissage.", { hold: 9 })
  },
})

chapter({
  id: '06-cellule',
  title: 'Chapitre 5 — La cellule de référence : usinage palettisé de bout en bout',
  auth: { sim: { role: 'Operator', subject: 'demo-simulateur' }, admin: { role: 'Administrator', subject: 'admin-tour' } },
  prepare: async () => {
    const admin = await devToken('Administrator', 'admin-tour')
    await createJobWithTasks(admin, 'TOUR VIDEO - Cellule de référence', [[0, 0], [0, 1], [0, 2], [0, 3]])
    log('chapter 06: job de référence créé')
  },
  run: async (t) => {
    await t.mode('sim')
    await t.cap("Cellule CNC de référence", "Palette à 25 emplacements, robot 6 axes, CNC à porte, convoyeur et zone de sécurité.", { hold: 9 })
    await t.gotoSim(`${SIM_URL}/`)
    await t.sim.locator('.dashboard').waitFor({ timeout: 90000 })
    await t.cap("Signaux industriels et flux matière", "Chaque état visuel correspond à un signal : photoélectriques, encodeur, pince, broche, arrosage, porte.", { hold: 9 })
    await t.sim.locator('.step-panel .speed input[type="range"]').evaluate((el) => {
      el.value = '2'; el.dispatchEvent(new Event('input', { bubbles: true }))
    }).catch(() => {})
    const startButton = t.sim.locator('.dashboard .btn-row button').first()
    let claimed = false
    for (let i = 0; i < 40 && !claimed; i += 1) {
      await startButton.click().catch(() => {})
      await t.page.waitForTimeout(FAST ? 400 : 1500)
      claimed = (await t.sim.locator('.state-bar.running').count()) > 0
    }
    if (!claimed) throw new Error('cellule non démarrée')
    await t.mark('#sim-frame', t.sim.locator('.dashboard .metrics'), 'Compteurs usinées / restantes / total')
    await t.cap("Mission revendiquée automatiquement", "Une mission créée par le HMI/API en attente est revendiquée : mode ONLINE, session Running.", { hold: 8 })
    await t.clearMarks()
    const phaseCaption = {
      SELECT_NEXT_SLOT: "Sélection de l'emplacement suivant sur la palette",
      MOVE_ABOVE_PALLET_SLOT: 'Approche de la pièce brute au-dessus de la palette',
      DESCEND_TO_PICK: 'Descente et préhension',
      PICK_PART: 'Pince fermée — pièce saisie',
      MOVE_TO_CNC_APPROACH: 'Transfert vers la CNC',
      OPEN_CNC_DOOR: 'Ouverture de la porte CNC',
      MOVE_TO_CNC_INSERT: 'Insertion dans la broche',
      LOAD_PART: 'Dépose dans le mandrin',
      CLOSE_CNC_DOOR: 'Fermeture et verrouillage de la porte',
      MACHINING: "Usinage : broche, avance, arrosage — la CNC travaille",
      OPEN_CNC_DOOR_RETRIEVE: 'Ouverture pour récupérer la pièce usinée',
      RETRIEVE_PART: 'Récupération de la pièce usinée',
      MOVE_ABOVE_ORIGIN_SLOT: 'Retour vers la palette',
      PLACE_PART_BACK: "Remise de la pièce usinée dans son emplacement",
    }
    const seen = new Set()
    const deadline = Date.now() + (FAST ? 45000 : 360000)
    while (Date.now() < deadline) {
      const phase = await t.sim.locator('.phase-value').textContent().catch(() => null)
      const machined = Number(await t.sim.locator('.metrics .metric').first().locator('.metric-val').textContent().catch(() => '0'))
      if (phase && !seen.has(phase) && phaseCaption[phase]) {
        seen.add(phase)
        await t.cap('Cycle automatisé — piloté par les signaux', phaseCaption[phase], { hold: 5 })
        if (phase === 'MACHINING') {
          await t.mark('#sim-frame', t.sim.locator('.dashboard .section', { hasText: 'CNC' }).first(), 'CNC en usinage')
          await t.wait(5)
          await t.clearMarks()
        }
      }
      if (machined >= (FAST ? 1 : 2)) break
      await t.page.waitForTimeout(FAST ? 500 : 1500)
    }
    await t.mark('#sim-frame', t.sim.locator('.dashboard .metrics'), 'Pièces usinées en temps réel')
    await t.cap("Boucle complète", "Palette → robot → CNC → retour pièce : le cycle se répète pour chaque emplacement, avec compteurs serveur.", { hold: 9 })
    await t.clearMarks()
    await t.sim.locator('.dashboard .btn-row button').nth(3).click().catch(() => {})
    await t.cap("Arrêt propre", "Le compteur s'arrête, la session est clôturée, l'état machine repasse à l'arrêt.", { hold: 6 })
  },
})

chapter({
  id: '07-signaux',
  title: 'Chapitre 6 — Le socle de signaux industriels',
  auth: { sim: { role: 'Engineer', subject: 'demo-ingenieur' } },
  run: async (t) => {
    await t.mode('sim')
    await t.gotoSim(`${SIM_URL}/?view=signals`)
    await t.sim.locator('[data-signal-inspector]').waitFor({ timeout: 30000 })
    await t.cap("Modèle de signaux versionné (schéma 1.0)", "54 signaux indépendants du protocole : type, unité SI, direction, qualité, source et horodatage.", { hold: 10 })
    const sim = t.sim
    const count = await sim.locator('[data-signal-count]').textContent()
    await t.key(`Signaux déclarés : ${count}`)
    await t.wait(5)
    await t.key('')
    await sim.locator('[data-signal-equipment-filter]').selectOption('cnc-1')
    await t.cap("Filtre par équipement : CNC", "Chaque équipement déclare ses signaux ; le registre garantit des identifiants stables.", { hold: 8 })
    await t.mark('#sim-frame', sim.locator('[data-signal-row="cnc-1.SpindleSpeed"]'), 'cnc-1.SpindleSpeed = 8000 tr/min')
    await t.cap("Valeur, qualité et source", "Qualité GOOD, source simulation, horodatage : l'inspecteur ne montre jamais de valeur inventée.", { hold: 9 })
    await t.clearMarks()
    await sim.locator('[data-signal-search]').fill('Spindle')
    await t.cap("Recherche par identifiant ou nom", "Le diagnostic de liaison signale tout signal déclaré sans lecteur ou sans écrivain.", { hold: 8 })
    await sim.locator('[data-signal-search]').fill('')
    await t.cap("Fondation de tout l'écosystème", "Les commandes opérateur, le flux matière, la CNC et la sécurité passent par ce registre unique.", { hold: 9 })
  },
})

chapter({
  id: '08-mapping',
  title: 'Chapitre 7 — Studio de mapping de signaux',
  auth: { sim: { role: 'Engineer', subject: 'demo-ingenieur' } },
  run: async (t) => {
    await t.mode('sim')
    await t.gotoSim(`${SIM_URL}/?view=mapping-studio`)
    await t.sim.locator('[data-mapping-studio]').waitFor({ timeout: 30000 })
    await t.cap("Connecter les signaux internes aux protocoles", "OPC UA, MQTT et Modbus TCP : un fichier de mapping versionné 1.0, importable et exportable.", { hold: 10 })
    const sim = t.sim
    await t.mark('#sim-frame', sim.locator('[data-mapping-row]').first(), '6 correspondances préchargées')
    await sim.locator('[data-action="validate"]').click()
    await t.wait(1)
    await t.cap("Validation ligne par ligne", "Signaux inconnus, types incompatibles, adresses invalides et conflits sont détectés avant toute application.", { hold: 9 })
    await t.clearMarks()
    await sim.locator('[data-mapping-row="opcua-cnc-spindle-speed"]').click()
    await t.mark('#sim-frame', sim.locator('[data-mapping-editor]'), 'Édition : direction, type, échelle, adresse cible')
    await t.cap("Aucune ambiguïté tolérée", "Byte order et word order Modbus sont explicites : le studio refuse de deviner.", { hold: 9 })
    await t.clearMarks()
    await sim.locator('[data-monitor-equipment]').selectOption('cnc-1')
    await t.mark('#sim-frame', sim.locator('[data-monitor-health="opcua-cnc-spindle-speed"]'), 'Fixtures simulées — pas de connexion réelle')
    await t.cap("Moniteur temps réel (fixtures simulées)", "Valeurs internes et externes, qualité et santé : ici les connecteurs sont simulés pour la démo.", { hold: 9 })
    await t.clearMarks()
    await sim.locator('[data-action="apply"]').click()
    await sim.locator('[data-mapping-status]').filter({ hasText: /Applied/ }).waitFor({ timeout: 20000 })
    await t.cap("Application explicite et tout-ou-rien", "Un mapping ne peut ni activer un connecteur ni autoriser une écriture : la politique reste fail-closed.", { hold: 10 })
    const download = t.page.waitForEvent('download', { timeout: 15000 }).catch(() => null)
    await sim.locator('[data-action="export"]').click()
    const dl = await download
    if (dl) await dl.saveAs(path.join(DOWNLOADS, 'reference-cell-mapping.json')).catch(() => {})
    await t.cap("Export déterministe", "Le fichier exporté est stable et revu comme du code — prêt pour Git.", { hold: 7 })
  },
})

chapter({
  id: '09-pannes',
  title: 'Chapitre 8 — Laboratoire de pannes simulées',
  auth: { sim: { role: 'Instructor', subject: 'demo-instructeur' } },
  run: async (t) => {
    await t.mode('sim')
    await t.gotoSim(`${SIM_URL}/?view=fault-lab`)
    await t.sim.locator('[data-fault-lab]').waitFor({ timeout: 30000 })
    await t.cap("Pannes typées, déterministes et sûres", "Forçage, gel, inversion, déconnexion, dégradation, bruit, dérive, pannes d'actionneur et perte de communication.", { hold: 10 })
    const sim = t.sim
    await sim.locator('[data-fault-lab-type]').selectOption('inverted')
    await sim.locator('[data-fault-lab-equipment]').selectOption('conveyor-1')
    await sim.locator('[data-fault-lab-signal]').selectOption('conveyor-1.PhotoeyeStation')
    await t.mark('#sim-frame', sim.locator('[data-fault-lab-target]'), 'Cible : photoélectrique station')
    await t.cap("Injection sur un signal", "L'overlay modifie la valeur publiée sans jamais toucher à la définition canonique du signal.", { hold: 9 })
    await t.clearMarks()
    const before = await sim.locator('[data-fault-lab-value="conveyor-1.PhotoeyeStation"]').textContent()
    await sim.locator('[data-fault-lab-activate]').click()
    await sim.locator('[data-fault-lab-feedback]').waitFor({ timeout: 15000 })
    const after = await sim.locator('[data-fault-lab-value="conveyor-1.PhotoeyeStation"]').textContent()
    await t.key(`Photoélectrique : ${before} → ${after} (inversé)`)
    await t.cap("Propagation observable", "La valeur observée change, la qualité est signalée, et les commandes dangereuses sont refusées sans effet.", { hold: 10 })
    await t.wait(4)
    await t.key('')
    await sim.locator('[data-fault-lab-clear]').click()
    await sim.locator('[data-fault-lab-empty]').waitFor({ timeout: 15000 })
    await t.cap("Récupération déterministe", "Une fois l'overlay retiré, l'état revient exactement au nominal — utile pour rejouer un exercice.", { hold: 9 })
    await t.gotoSim(`${SIM_URL}/?view=fault-lab&authority=external`)
    await t.sim.locator('[data-fault-lab-blocked]').waitFor({ timeout: 20000 })
    await t.mark('#sim-frame', t.sim.locator('[data-fault-lab-blocked]'), 'Injection refusée sous autorité externe')
    await t.cap("Garde-fou d'autorité", "Si un contrôleur externe possède le périmètre, l'injection est refusée : jamais de contournement.", { hold: 10 })
    await t.clearMarks()
  },
})

chapter({
  id: '10-apprenant',
  title: "Chapitre 9 — Apprenant : mode guidé et évaluation",
  auth: { sim: { role: 'Learner', subject: 'demo-apprenant' } },
  prepare: async () => {
    const admin = await devToken('Administrator', 'admin-tour')
    await createJobWithTasks(admin, "TOUR VIDEO - Évaluation apprenant", [[0, 0], [0, 1], [0, 2]])
    log('chapter 10: job apprenant créé')
  },
  run: async (t) => {
    await t.mode('sim')
    await t.gotoSim(`${SIM_URL}/`)
    await t.sim.locator('.dashboard').waitFor({ timeout: 90000 })
    await t.cap("Parcours apprenant", "L'apprenant exécute la cellule en local, s'entraîne en mode pas à pas, puis synchronise son rapport pour une évaluation serveur.", { hold: 9 })
    const sim = t.sim
    await sim.locator('.step-panel input[type="checkbox"]').nth(0).check()
    await t.cap("Mode pas à pas activé", "Le simulateur s'arrêtera à chaque étape logique : l'apprenant observe avant d'avancer.", { hold: 8 })
    await t.sim.locator('.step-panel .speed input[type="range"]').evaluate((el) => {
      el.value = '2'; el.dispatchEvent(new Event('input', { bubbles: true }))
    }).catch(() => {})
    const startButton = sim.locator('.dashboard .btn-row button').first()
    let started = false
    for (let i = 0; i < 40 && !started; i += 1) {
      await startButton.click().catch(() => {})
      await t.page.waitForTimeout(FAST ? 400 : 1500)
      started = (await sim.locator('.state-bar.running, .state-bar.paused').count()) > 0
    }
    if (!started) throw new Error("workflow apprenant non démarré")
    for (let step = 0; step < (FAST ? 2 : 4); step += 1) {
      await sim.locator('.step-panel .controls button').nth(1).click()
      await t.wait(1.2)
      const checkpoint = await sim.locator('.step-panel p b').first().textContent().catch(() => '')
      await t.cap("Point d'étape", checkpoint || "Étape suivante", { hold: 6 })
    }
    await sim.locator('.step-panel input[type="checkbox"]').nth(0).uncheck().catch(() => {})
    await sim.locator('.dashboard .btn-row button').nth(3).click().catch(() => {})
    await t.cap("Rapport d'apprentissage", "Actions attendues vs observées, fautes, indices et violations de sécurité — avec avertissement éducatif.", { hold: 9 })
    const bottomRail = sim.locator('[data-dock="bottom"] .dock-rail')
    await bottomRail.click().catch(() => {})
    await t.wait(1)
    const report = sim.locator('aside.report-panel')
    await report.waitFor({ timeout: 30000 })
    await report.locator('input[maxlength="40"]').first().fill('demo-apprenant').catch(() => {})
    await report.locator('label input[type="checkbox"]').first().check().catch(() => {})
    await t.cap("Mode instructeur du rapport", "Comparaison attendu/observé et export JSON/HTML du rapport local.", { hold: 9 })
    const exportDl = t.page.waitForEvent('download', { timeout: 15000 }).catch(() => null)
    await report.locator('button', { hasText: /Exporter JSON|Export JSON/ }).first().click().catch(() => {})
    const dl = await exportDl
    if (dl) await dl.saveAs(path.join(DOWNLOADS, 'learning-report.json')).catch(() => {})
    await t.cap("Synchronisation au serveur", "Le rapport est envoyé au serveur : identité Learner, actions, indices — le score est recalculé serveur.", { hold: 9, voice: "Le rapport local peut être synchronisé avec le serveur. L'évaluation est alors recalculée côté serveur, avec la version du barème et la version logicielle enregistrées pour être reproductible." })
    const syncButton = report.locator('.sync button').first()
    await syncButton.click()
    await sim.locator('.authority.server').waitFor({ timeout: 30000 })
    await t.mark('#sim-frame', sim.locator('.authority.server'), 'SERVER-ASSESSED — note calculée serveur')
    await t.cap("Évaluation serveur enregistrée", "Le score officiel est serveur ; il apparaîtra dans le tableau instructeur du chapitre suivant.", { hold: 10 })
  },
})

chapter({
  id: '11-timetravel',
  title: 'Chapitre 10 — Voyage dans le temps déterministe',
  auth: { sim: { role: 'Engineer', subject: 'demo-ingenieur' } },
  run: async (t) => {
    await t.mode('sim')
    await t.gotoSim(`${SIM_URL}/?view=time-travel`)
    await t.sim.locator('[data-tt-page]').waitFor({ timeout: 30000 })
    await t.cap("Reconstruire la cellule à un instant donné", "Robot, CNC, matière, signaux, alarmes, pannes, job et autorité : tout est reconstruit depuis la timeline.", { hold: 10 })
    const sim = t.sim
    await t.mark('#sim-frame', sim.locator('[data-tt-mode-chip="replay"]'), 'Mode REPLAY — lecture seule')
    await t.cap("Isolation stricte", "En replay, aucune écriture ni prise d'autorité n'est possible : le code bloque ces chemins.", { hold: 9 })
    await t.clearMarks()
    await sim.locator('[data-tt-scrubber]').fill('1000')
    await t.cap("Curseur temporel", "Déplacement exact dans la fenêtre ; l'exactitude est affichée (exact, interpolé, maintenu, trou).", { hold: 8 })
    await sim.locator('[data-tt-scrubber]').fill('11000')
    await t.mark('#sim-frame', sim.locator('[data-tt-cnc-state]'), 'CNC : MACHINING reconstruit')
    await t.cap("État reconstruit", "La CNC est en usinage à cet instant, avec l'état du robot et de la matière.", { hold: 9 })
    await t.clearMarks()
    await sim.locator('[data-tt-marker]').nth(2).click().catch(() => {})
    await t.cap("Marqueurs d'événements", "Alarmes, pannes, commandes et phases servent de points d'arrêt pédagogiques.", { hold: 8 })
    await sim.locator('[data-tt-play]').click()
    await t.wait(2.5)
    await sim.locator('[data-tt-play]').click()
    await t.cap("Lecture, pause, pas-à-pas, vitesses", "Le contrôleur de replay est indépendant de la fréquence d'images : la démonstration reste déterministe.", { hold: 9 })
    await sim.locator('[data-tt-exit]').click()
    await t.cap("Sortie du replay", "Le simulateur resynchronise le mode courant ; le replay n'a jamais modifié l'état réel.", { hold: 8 })
  },
})

chapter({
  id: '12-robot-cinematique',
  title: 'Chapitre 11 — Robots, cinématique et sécurité des mouvements',
  auth: { sim: { role: 'Engineer', subject: 'demo-ingenieur' } },
  run: async (t) => {
    await t.mode('sim')
    await t.gotoSim(`${SIM_URL}/?view=robot-catalog`)
    await t.sim.locator('[data-robot-id]').first().waitFor({ timeout: 30000 })
    await t.cap("Catalogue robot générique", "Compact, medium et heavy 6 axes : charge, portée, contrôleur, articulations et compatibilité d'outil.", { hold: 10 })
    const sim = t.sim
    await sim.locator('[data-robot-id="compact-6axis"]').click()
    await t.mark('#sim-frame', sim.locator('[data-selected-robot="compact-6axis"]'), 'Compact 6 axes — 3 kg / 0,7 m')
    await t.cap("Changement de profil", "Le même scénario s'adapte au robot choisi : cinématique, atteignabilité et collisions recalculées.", { hold: 9, voice: "Chaque profil de robot apporte sa cinématique, ses limites d'articulation et ses données de sécurité. Le changement de profil reconstruit le runtime sans réécrire la scène." })
    await t.clearMarks()
    await sim.locator('[data-robot-id="heavy-6axis"]').click()
    await t.cap("Compatibilité outil", "Le préhenseur est compatible avec les profils medium et heavy, mais pas avec le compact : la charge maximale est appliquée.", { hold: 9 })
    await t.gotoSim(`${SIM_URL}/`)
    await t.sim.locator('.dashboard').waitFor({ timeout: 90000 })
    await sim.locator('.step-panel input[type="checkbox"]').nth(1).check()
    await sim.locator('[data-dock="bottom"] .dock-rail').click().catch(() => {})
    await t.wait(1)
    await t.cap("Panneaux d'ingénierie (mode expert)", "Sécurité des mouvements, repères et cinématique, signaux E/S et labo de pannes instructeur.", { hold: 9 })
    const bottomPanels = sim.locator('[data-dock="bottom"] details.dock-panel')
    await bottomPanels.nth(1).locator('summary').first().click()
    await t.wait(1)
    await t.mark('#sim-frame', sim.locator('aside[aria-label="Motion safety diagnostics"]'), "Enveloppe d'atteinte, contrôles, alarmes")
    await t.cap("Sécurité des mouvements", "Chaque trajectoire est vérifiée : enveloppe, obstacles et palettes ; les alarmes simulées sont explicites.", { hold: 9 })
    await t.clearMarks()
    await bottomPanels.nth(2).locator('summary').first().click()
    await t.wait(1)
    await t.mark('#sim-frame', sim.locator('aside[aria-label="Kinematics developer overlay"]'), 'Repères, poses outil et articulations')
    await t.cap("Repères et cinématique directe", "FK/IK déterministes en unités SI, repères cellule/outil et suivi de cible en temps réel.", { hold: 9 })
    await t.clearMarks()
  },
})

chapter({
  id: '13-editeur',
  title: 'Chapitre 12 — Éditeur de cellule et fichiers de cellule',
  auth: { sim: { role: 'Engineer', subject: 'demo-ingenieur' } },
  run: async (t) => {
    await t.mode('sim')
    await t.gotoSim(`${SIM_URL}/?view=cell-editor`)
    await t.sim.locator('[data-canvas]').waitFor({ timeout: 30000 })
    await t.cap("Éditeur de cellule en plan 2D", "Placement sur grille, aimantation, détection de chevauchement, annuler/rétablir et validation.", { hold: 10 })
    const sim = t.sim
    await sim.locator('[data-sample-select]').selectOption('heavy-6axis')
    await sim.locator('[data-action="load-sample"]').click()
    await t.wait(1)
    await sim.locator('[data-action="validate"]').click()
    await t.sim.locator('[data-validation-ok]').waitFor({ timeout: 15000 })
    await t.cap("Cellule échantillon chargée et valide", "Quatre équipements : robot, CNC, convoyeur et poste palette — validation sans erreur.", { hold: 9 })
    await sim.locator('[data-placement="cnc-1"]').click()
    await t.mark('#sim-frame', sim.locator('[aria-label="Selected equipment properties"]'), 'Propriétés : position, rotation, suppression')
    await sim.locator('[data-field="x"]').fill('0.4')
    await sim.locator('[data-field="x"]').press('Enter')
    await t.wait(0.8)
    await t.cap("Édition des propriétés", "La CNC se déplace ; la validation recalcule les collisions et les zones.", { hold: 8 })
    await t.clearMarks()
    await sim.locator('[data-action="undo"]').click()
    await t.wait(0.6)
    await sim.locator('[data-action="redo"]').click()
    await t.cap("Historique annuler/rétablir", "Chaque modification est réversible ; la scène d'exécution n'est jamais altérée par l'édition.", { hold: 8 })
    const dl = t.page.waitForEvent('download', { timeout: 15000 }).catch(() => null)
    await sim.locator('[data-action="export"]').click()
    const file = await dl
    if (file) await file.saveAs(path.join(DOWNLOADS, 'tour-cell.cell.json')).catch(() => {})
    await t.cap("Fichiers de cellule versionnés 1.0", "Export déterministe, import avec migration des anciens formats, et modèles persistés via l'orchestrateur.", { hold: 10 })
    await t.gotoSim(`${SIM_URL}/`)
    await t.sim.locator('.dashboard').waitFor({ timeout: 90000 })
    await sim.locator('[data-mode="editing"]').click()
    await t.wait(1)
    await t.cap("Mode édition depuis l'exécution", "La scène d'exécution est démontée avant toute édition : impossible de modifier une cellule en marche.", { hold: 9 })
    const catalogKinds = await sim.locator('[data-catalog-group] button[data-kind]').count().catch(() => 0)
    await t.key(`Catalogue : ${catalogKinds} équipements insérables`)
    await t.wait(4)
    await t.key('')
    const saveDl = t.page.waitForEvent('response', { timeout: 15000 }).catch(() => null)
    await sim.locator('[data-action="save"]').click()
    await t.sim.locator('[data-save-message]').filter({ hasText: /Saved|Enregistr/ }).waitFor({ timeout: 20000 }).catch(() => {})
    await saveDl
    await t.cap("Enregistrement serveur (rôle Engineer)", "Le gabarit de cellule est persisté par l'orchestrateur — l'API vérifie le rôle côté serveur.", { hold: 9 })
  },
})

chapter({
  id: '14-autorite',
  title: "Chapitre 13 — Autorité de contrôle et contrôleurs externes",
  auth: { hmi: { role: 'Engineer', subject: 'demo-ingenieur' } },
  run: async (t) => {
    await t.mode('hmi-server')
    await t.cap("Un seul propriétaire par périmètre", "Modes : local-simulation, external-controller, observed-twin, replay — avec passation explicite et auditée.", { hold: 10 })
    const hmi = t.hmi
    await hmi.getByTestId('authority-indicator').waitFor({ timeout: 60000 })
    await t.mark('#hmi-frame', hmi.getByTestId('authority-indicator'), 'Indicateur d’autorité (scope cell-1)')
    await hmi.getByTestId('authority-acquire').click()
    await hmi.locator('[data-testid=authority-feedback][data-feedback=success]').waitFor({ timeout: 20000 })
    const eng = { token: tok('Engineer', 'demo-ingenieur') }
    await t.api(
      `POST /api/control-authority/cell-1/acquire -> ${JSON.stringify(await apiJson('/control-authority/cell-1', eng)).slice(0, 320)}\n\n` +
      `Audit : ${JSON.stringify(await apiJson('/control-authority/cell-1/audit?limit=5', eng)).slice(0, 500)}`)
    await t.cap("Prise d'autorité par l'opérateur", "Le propriétaire, l'état et le mode sont visibles partout ; la prise est journalisée.", { hold: 10 })
    await t.clearMarks()
    await hmi.getByTestId('authority-release').click()
    await hmi.locator('[data-testid=authority-feedback][data-feedback=success]').waitFor({ timeout: 20000 })
    await t.cap("Restitution explicite", "Pas de retour silencieux : la release rend le périmètre à la simulation locale.", { hold: 9 })
    const opc = await apiJson('/connectors/opcua', eng)
    const mqtt = await apiJson('/connectors/mqtt', eng)
    const modbus = await apiJson('/connectors/modbus', eng)
    await t.api(
      `OPC UA  : state=${opc.state}, allowWrites(documenté)=false\n` +
      `MQTT    : state=${mqtt.state}, allowWrites(documenté)=false\n` +
      `Modbus  : state=${modbus.state}, allowWrites(documenté)=false\n\n` +
      `Scopes d'autorité : /api/control-authority/{scope}\n` +
      `Showcases : CODESYS/SoftPLC (Modbus) et Siemens/PLCSIM (OPC UA) — documentation + fixtures automatisées.`)
    await t.cap("Connecteurs industriels désactivés par défaut", "Écritures fail-closed : enabled + AllowWrites + allow-list exacte + signal inscriptible. Aucun faux « live ».", { hold: 11, voice: "Les connecteurs OPC UA, MQTT et Modbus existent réellement, mais ils sont désactivés par défaut et toute écriture est refusée sans configuration explicite. Les showcases CODESYS et Siemens sont documentés et couverts par des fixtures automatisées, pas par du matériel réel dans cette démonstration." })
  },
})

chapter({
  id: '15-historien',
  title: 'Chapitre 14 — Historien, télémétrie et observabilité',
  auth: { admin: { role: 'Administrator', subject: 'admin-tour' } },
  run: async (t) => {
    await t.mode('server')
    await t.cap("Historien borné et volontairement désactivé", "Échantillonnage, rétention et requêtes existent — mais restent hors ligne par défaut.", { hold: 10 })
    const status = await apiJson('/historian/status', { token: tok('Administrator', 'admin-tour') })
    await t.api(`GET /api/historian/status -> ${JSON.stringify(status).slice(0, 500)}`)
    const post = await apiRequest('POST', '/historian/telemetry', {
      token: tok('Administrator', 'admin-tour'),
      body: { samples: [{ equipmentId: 'robot-1', signalId: 'joint-1', numericValue: 0.5 }] },
    })
    await t.api(
      `POST /api/historian/telemetry -> HTTP ${post.status}\n${JSON.stringify(post.body).slice(0, 420)}`)
    await t.cap("Réponse honnête quand c'est désactivé", "Le serveur répond explicitement que rien n'a été stocké : aucune donnée n'est inventée.", { hold: 10 })
    const metrics = await apiJson('/diagnostics/metrics?format=json', { token: tok('Administrator', 'admin-tour') })
    await t.api(
      `Métriques (extrait, ${Array.isArray(metrics) ? metrics.length : '?'} séries) :\n` +
      `${JSON.stringify(Array.isArray(metrics) ? metrics.slice(0, 5) : metrics, null, 1).slice(0, 800)}\n\n` +
      `GET /api/health/ready -> ${JSON.stringify(await apiJson('/health/ready')).slice(0, 200)}`)
    await t.cap("Exploitation : santé, métriques, version", "Readiness/liveness, compteurs par instrument, et endpoints de diagnostic protégés par rôle.", { hold: 10 })
  },
})

chapter({
  id: '16-instructeur',
  title: "Chapitre 15 — Instructeur : classes, sessions et revue d'évaluation",
  auth: { hmi: { role: 'Instructor', subject: 'demo-instructeur' }, admin: { role: 'Administrator', subject: 'admin-tour' } },
  prepare: async () => {
    const ins = await devToken('Instructor', 'demo-instructeur')
    const classes = await apiJson('/organizations/classes', { token: ins.token })
    let klass = Array.isArray(classes) ? classes.find((c) => c.name === 'Cohorte Démo') : null
    if (!klass) {
      const created = await apiRequest('POST', '/organizations/classes', {
        token: ins.token,
        body: { name: 'Cohorte Démo', description: 'Classe de démonstration', learnerSubjects: ['demo-apprenant'], instructorSubjects: ['demo-instructeur'] },
      })
      klass = created.body
    }
    const resources = await apiJson(`/organizations/resources?classId=${klass.id}`, { token: ins.token })
    if (!Array.isArray(resources) || resources.length === 0) {
      await apiRequest('POST', '/organizations/resources', {
        token: ins.token,
        body: { kind: 'Scenario', resourceId: 'pallet-processing', classId: klass.id },
      })
    }
    log(`instructor seed: class=${klass.id}`)
  },
  run: async (t) => {
    await t.mode('hmi')
    await t.gotoHmi(`${HMI_URL}/instructor`)
    await t.cap("Tableau instructeur", "Réservé au rôle Instructor : classes, indicateurs agrégés, sessions et revue détaillée.", { hold: 9 })
    const hmi = t.hmi
    await hmi.getByTestId('instructor-dashboard').waitFor({ timeout: 60000 })
    const sessions = hmi.locator('[data-testid^="session-row-"]')
    await sessions.first().waitFor({ timeout: 40000 })
    await t.mark('#hmi-frame', hmi.getByTestId('sessions-table'), "Sessions persistées de l'organisation")
    await t.cap("Sessions persistées", "Les sessions synchronisées par les apprenants apparaissent ici, avec leur évaluation serveur.", { hold: 10 })
    await t.clearMarks()
    await sessions.first().click()
    await t.wait(2)
    await t.mark('#hmi-frame', hmi.getByTestId('comparison-table'), 'Attendu vs observé')
    await t.cap("Revue de session", "Chronologie, comparaison attendu/observé, critères et points gagnés — avec les preuves.", { hold: 10 })
    await t.clearMarks()
    await t.mark('#hmi-frame', hmi.getByTestId('score-summary'), 'Score serveur et barème versionné')
    await t.cap("Évaluation reproductible", "Version du barème et version logicielle enregistrées : mêmes preuves, même résultat.", { hold: 9 })
    await t.clearMarks()
    const restartReason = hmi.getByTestId('restart-reason')
    if (await restartReason.count()) {
      await restartReason.fill('Deuxième tentative après revue')
      await hmi.getByTestId('restart-open').click()
      await t.wait(1)
      await hmi.locator('.hmi-confirm button.btn-hmi').click().catch(() => {})
      await hmi.locator('[data-testid=restart-feedback]').waitFor({ timeout: 20000 }).catch(() => {})
      await t.cap("Relance auditée", "Redémarrer une session est une action auditée ; le score calculé d'origine est conservé.", { hold: 9 })
    }
    await t.mark('#hmi-frame', hmi.getByTestId('metrics-cards'), 'Indicateurs agrégés (sessions, complétion, fautes, indices…)')
    await t.cap("Indicateurs de la cohorte", "Taux de complétion, diagnostic, fautes, aides, récupérations et violations — bornés et documentés.", { hold: 10 })
    await t.clearMarks()
    await hmi.getByTestId('class-select').waitFor({ timeout: 30000 })
    await t.mark('#hmi-frame', hmi.getByTestId('class-select'), 'Classe « Cohorte Démo » (créée via l’API)')
    await hmi.getByTestId('class-select').selectOption({ label: 'Cohorte Démo' }).catch(async () => {
      const options = await hmi.getByTestId('class-select').locator('option').allTextContents()
      const match = options.find((o) => o.includes('Cohorte'))
      if (match) await hmi.getByTestId('class-select').selectOption({ label: match })
    })
    await t.wait(2)
    await t.cap("Classe et effectif", "L'organisation et les classes sont vérifiées côté serveur : l'instructeur ne voit que son périmètre.", { hold: 9 })
    await t.clearMarks()
    await t.mark('#hmi-frame', hmi.getByTestId('assignment-kind'), 'Affectation de ressources à la classe')
    await t.cap("Affectations pédagogiques", "Scénario, gabarit de cellule ou fichier : la classe reçoit son matériel d'exercice.", { hold: 9 })
    await t.clearMarks()
  },
})

chapter({
  id: '17-alarmes',
  title: 'Chapitre 16 — Alarmes et messages opérateur',
  auth: { hmi: { role: 'Operator', subject: 'demo-operateur' } },
  run: async (t) => {
    await t.mode('hmi')
    await t.gotoHmi(`${HMI_URL}/alarms`)
    await t.cap("Gestion des alarmes", "Vue Active / Toutes, filtres par sévérité, détail avec cause, conséquence et conduite à tenir.", { hold: 9 })
    const hmi = t.hmi
    const firstRow = hmi.locator('table tbody tr').first()
    await firstRow.waitFor({ timeout: 30000 })
    await t.mark('#hmi-frame', hmi.locator('table'), 'Alarmes de démonstration pré-chargées')
    await t.cap("Données de démonstration", "L'API n'expose pas de création d'alarme : ces alarmes ont été pré-chargées en base pour illustrer l'interface.", { hold: 10, voice: "Transparence : dans cette version, l'API ne permet pas de créer des alarmes. Ces alarmes de démonstration ont été pré-chargées dans la base pour illustrer le parcours d'acquittement." })
    await t.clearMarks()
    await firstRow.click()
    await t.wait(1)
    await t.mark('#hmi-frame', hmi.locator('aside').first(), 'Détail et cycle de vie')
    await t.cap("Cycle de vie complet", "Active, acquittée, retour à la normale, mise en attente ou clôturée — transitions contrôlées serveur.", { hold: 9 })
    await t.clearMarks()
    const ack = hmi.getByRole('button', { name: 'Acknowledge' })
    if (await ack.count()) {
      await ack.first().click()
      await t.wait(1.5)
      await t.cap("Acquittement opérateur", "L'acquittement est audité avec l'identité authentifiée ; l'état de l'alarme est propagé aux clients.", { hold: 9 })
    }
    await t.gotoHmi(`${HMI_URL}/messages`)
    await t.cap("Messages opérateur", "Consignes et notifications diffusées à l'opérateur — lecture seule dans cette version.", { hold: 9 })
  },
})

chapter({
  id: '18-outro',
  title: 'Chapitre 17 — Réglages, administration et clôture',
  auth: { hmi: { role: 'Administrator', subject: 'admin-tour' }, admin: { role: 'Administrator', subject: 'admin-tour' } },
  run: async (t) => {
    await t.mode('hmi')
    await t.gotoHmi(`${HMI_URL}/settings`)
    await t.cap("Réglages : langue, backend, version", "Le HMI est multilingue ; l'URL du backend et la version déployée sont affichées pour le support.", { hold: 9 })
    const hmi = t.hmi
    const langSelect = hmi.locator('select.form-select').first()
    await langSelect.selectOption('fr').catch(() => {})
    await t.wait(1)
    await t.cap("Interface localisée", "L'anglais, le français et l'allemand sont livrés ; le changement se fait à chaud.", { hold: 8 })
    await langSelect.selectOption('en').catch(() => {})
    await t.mark('#hmi-frame', hmi.getByTestId('about-installation'), 'Version, profil, environnement, runtime, build')
    await t.cap("Traçabilité de version", "Le même binaire expose sa version à l'API, au HMI, au simulateur et aux diagnostics.", { hold: 9 })
    await t.clearMarks()
    const bundle = await apiJson('/support/bundle', { token: tokenCache.get('Administrator:admin-tour')?.token })
    const bundleKeys = bundle && typeof bundle === 'object' ? Object.keys(bundle).slice(0, 10).join(', ') : '?'
    await t.api(
      `GET /api/support/bundle (Administrator) -> HTTP 200\n` +
      `Sections (extrait) : ${bundleKeys}\n` +
      `Secrets expurgés ; bundle destiné au support.\n\n` +
      `Profils : Development / Production / OnPrem / Demo\n` +
      `Documentation : docs/guides, docs/architecture, docs/operations`)
    await t.cap("Administration et support", "Bundle de support expurgé, profils de déploiement, sauvegarde/restauration et vérification de configuration.", { hold: 10 })
    await t.mode('board')
    await t.board(`
      <h2>Fabrik3D 1.0 — ce que vous venez de voir</h2>
      <div class="row">
        <div class="box"><h3>Opérateur</h3><p>Missions, supervision temps réel, commandes confirmées, alarmes, messages, réglages.</p></div>
        <div class="box"><h3>Apprenant &amp; Instructeur</h3><p>Scénarios guidés, mode pas-à-pas, rapport, évaluation serveur, classes et revue.</p></div>
        <div class="box"><h3>Ingénieur</h3><p>Signaux, mapping, pannes simulées, time travel, cinématique, sécurité, édition de cellule.</p></div>
        <div class="box"><h3>Administrateur</h3><p>Rôles et autorité, connecteurs fail-closed, historien, observabilité, support.</p></div>
      </div>
      <p style="margin-top:16px;color:#9fd6e8">Tout est simulé — formation, démonstration et mise en service virtuelle. Voir docs/guides et docs/operations/LIMITATIONS.md pour le périmètre exact.</p>`)
    await t.cap("Merci !", "Cette visite sert de démonstration et de guide : chaque chapitre correspond à une surface réelle de l'écosystème.", { hold: 10, voice: "Merci d'avoir suivi cette visite guidée. Chaque chapitre correspond à une fonctionnalité réelle de l'écosystème Fabrik3D. Tout est simulé et destiné à la formation, à la démonstration et à la mise en service virtuelle. Consultez la documentation pour aller plus loin." })
  },
})

// ── Runner ──────────────────────────────────────────────────────────

async function runChapter(browser, index, def) {
  const selected = ONLY.length === 0 || ONLY.includes(def.id.split('-')[0]) || ONLY.includes(def.id)
  if (!selected) return
  log(`=== chapter ${def.id} — ${def.title}`)
  if (def.prepare) await def.prepare()
  const hmiTok = def.auth?.hmi ? await devToken(def.auth.hmi.role, def.auth.hmi.subject) : null
  const simTok = def.auth?.sim ? await devToken(def.auth.sim.role, def.auth.sim.subject) : null
  if (def.auth?.admin) await devToken(def.auth.admin.role, def.auth.admin.subject)

  const context = await browser.newContext({
    viewport: VIEWPORT,
    ignoreHTTPSErrors: true,
    acceptDownloads: true,
    ...(RECORD ? { recordVideo: { dir: SEG, size: VIEWPORT } } : {}),
  })
  await context.addInitScript(({ hmi, sim, urls }) => {
    try {
      const seed = (t) => {
        if (!t) return
        sessionStorage.setItem('fabrik3d.auth.token', t.token)
        sessionStorage.setItem('fabrik3d.auth.identity', JSON.stringify(t.identity))
      }
      if (location.origin === urls.hmi) seed(hmi)
      if (location.origin === urls.sim) {
        seed(sim)
        localStorage.setItem('fabrik3d:locale', 'fr')
      }
    } catch { /* ignore */ }
  }, { hmi: hmiTok, sim: simTok, urls: { hmi: HMI_URL, sim: SIM_URL } })

  const page = await context.newPage()
  page.on('pageerror', (err) => log(`[pageerror:${def.id}] ${String(err).slice(0, 200)}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') log(`[console:${def.id}] ${msg.text().slice(0, 180)}`)
  })

  const started = Date.now()
  const captions = []
  const hmiSrc = def.auth?.hmi || def.id.startsWith('03') ? HMI_URL : 'about:blank'
  const simSrc = def.simSrc ?? (def.auth?.sim ? SIM_URL : 'about:blank')
  await page.setContent(wrapperHtml({ hmiSrc, simSrc }), { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)

  const frames = await page.evaluate(() => ({
    hmi: document.getElementById('hmi-frame')?.getBoundingClientRect().toJSON(),
  })).catch(() => null)
  void frames

  const hmi = page.frameLocator('#hmi-frame')
  const sim = page.frameLocator('#sim-frame')

  const wait = (seconds) => page.waitForTimeout(FAST ? Math.min(seconds * 1000, 1500) : seconds * 1000)

  const cap = async (title, sub = '', opts = {}) => {
    const text = opts.voice ?? `${title}. ${sub}`.replace(/\s+/g, ' ').trim()
    captions.push({ t: Date.now() - started, title, sub, voice: text })
    log(`cap ${def.id}: ${title}`)
    await page.evaluate(([t, s]) => window.__demo.cap(t, s), [title, sub]).catch(() => {})
    await page.evaluate((t) => window.__demo.key(t), opts.key ?? '').catch(() => {})
    if (opts.hold) await wait(opts.hold)
  }
  const key = async (text) => page.evaluate((t) => window.__demo.key(t), text)
  const mode = async (m) => page.evaluate((x) => window.__demo.mode(x), m)
  const title = async (card) => {
    captions.push({ t: Date.now() - started, title: card.title, sub: card.sub, voice: card.voice ?? `${card.title}. ${card.sub}` })
    await page.evaluate((c) => window.__demo.title(c), card)
    await page.evaluate(() => window.__demo.mode('title'))
    await wait(card.hold ?? 10)
  }
  const board = async (html) => page.evaluate((h) => window.__demo.board(h), html)
  const api = async (text) => page.evaluate((t) => window.__demo.api(t), text)
  const srv = async (text) => page.evaluate((t) => window.__demo.srv(t), text)
  const clearMarks = async () => page.evaluate(() => window.__demo.marks([]))
  const mark = async (frameId, locator, label = '') => {
    try {
      await locator.first().scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {})
      const box = await locator.first().boundingBox()
      if (!box) return
      const offset = await page.evaluate((id) => {
        const el = document.getElementById(id)
        const r = el.getBoundingClientRect()
        return { x: r.left, y: r.top }
      }, frameId)
      await page.evaluate(({ m }) => window.__demo.marks([m]), { m: { x: offset.x + box.x, y: offset.y + box.y, w: box.width, h: box.height, label } })
    } catch { /* ignore */ }
  }
  const pointerTo = async (frameId, locator) => {
    try {
      const box = await locator.first().boundingBox()
      if (!box) return
      const offset = await page.evaluate((id) => {
        const el = document.getElementById(id)
        const r = el.getBoundingClientRect()
        return { x: r.left, y: r.top }
      }, frameId)
      await page.evaluate(({ p }) => window.__demo.pointer(p), { p: { x: offset.x + box.x + box.width / 2, y: offset.y + box.y + box.height / 2 } })
      await page.waitForTimeout(500)
    } catch { /* ignore */ }
  }
  const gotoFrame = async (frame, url) => {
    const target = page.frames().find((f) => f.url().startsWith(frame === 'hmi' ? HMI_URL : SIM_URL))
    if (!target) throw new Error(`frame ${frame} introuvable`)
    await target.goto(url, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
  }
  const login = async (role, subject) => {
    await hmi.getByTestId('hmi-login').waitFor({ timeout: 60000 })
    await hmi.locator('#hmi-login-subject').fill(subject)
    await hmi.locator('#hmi-login-role').selectOption(role)
    await hmi.getByTestId('hmi-login-submit').click()
    await hmi.getByTestId('hmi-connection-badge').waitFor({ timeout: 30000 }).catch(() => {})
    await hmi.locator('[data-testid=hmi-user]').waitFor({ timeout: 30000 }).catch(() => {})
    await wait(2)
  }
  const logout = async () => {
    await hmi.getByTestId('hmi-logout').click()
    await hmi.getByTestId('hmi-login').waitFor({ timeout: 30000 })
    await wait(1)
  }

  await page.evaluate((tag) => window.__demo.tag(tag), `Chapitre ${index}/${chapters.length}`)

  // Live server console tail while the chapter records.
  const logTimer = RECORD
    ? setInterval(() => {
        page.evaluate((t) => window.__demo.srv(t), serverLogTail()).catch(() => {})
      }, 1500)
    : null

  try {
    await def.run({
      page, context, hmi, sim, cap, key, mode, title, board, api, srv,
      clearMarks, mark, pointerTo, wait, login, logout,
      gotoSim: (url) => gotoFrame('sim', url),
      gotoHmi: (url) => gotoFrame('hmi', url),
    })
    log(`chapter ${def.id} complete`)
  } catch (err) {
    log(`chapter ${def.id} FAILED: ${String(err).slice(0, 400)}`)
    await page.screenshot({ path: path.join(ART, `failure-${def.id}.png`) }).catch(() => {})
    process.exitCode = 1
  } finally {
    if (logTimer) clearInterval(logTimer)
    const video = page.video()
    await context.close()
    const videoPath = video ? await video.path().catch(() => null) : null
    const record = {
      id: def.id,
      title: def.title,
      index,
      durationMs: Date.now() - started,
      video: videoPath,
      captions,
    }
    fs.writeFileSync(path.join(SEG, `${def.id}.json`), JSON.stringify(record, null, 1))
    log(`chapter ${def.id} video: ${videoPath ?? '(dry-run)'} — ${captions.length} captions`)
  }
}

async function main() {
  fs.mkdirSync(SEG, { recursive: true })
  fs.mkdirSync(DOWNLOADS, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  try {
    for (let i = 0; i < chapters.length; i += 1) {
      await runChapter(browser, i + 1, chapters[i])
    }
  } finally {
    await browser.close()
  }
  log('tour recording done')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
