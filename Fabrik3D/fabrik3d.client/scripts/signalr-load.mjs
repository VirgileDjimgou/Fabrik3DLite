/**
 * S49 (extended S56) SignalR load measurement harness.
 *
 * Connects N concurrent SignalR clients to a running Fabrik3D orchestrator, generates job state
 * transitions (each broadcasts a JobStateChanged event) and reports connection latency, broadcast
 * delivery latency percentiles, message loss, a bounded reconnect storm and process resource use.
 * It is an evidence-generating script, not a test assertion: run it against a disposable Testing-mode
 * server (see docs/operations/PERFORMANCE.md and docs/operations/RECOVERY_MATRIX.md).
 *
 * Usage (from Fabrik3D/fabrik3d.client):
 *   node scripts/signalr-load.mjs
 * Environment:
 *   FABRIK3D_BASE_URL      (default http://127.0.0.1:7249)
 *   LOAD_CLIENTS           (default 50)
 *   LOAD_JOBS              (default 25)
 *   LOAD_SEED              (default 1337)
 *   LOAD_RECONNECT         (default true)  run a bounded reconnect storm after the broadcast window
 *   LOAD_RECONNECT_CLIENTS (default min(clients, 50))
 *   LOAD_SETTLE_MS         (default 1000)
 *   LOAD_RESULT_FILE       (default load-results/signalr-load-<timestamp>.json)
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import os from 'node:os'
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr'

const base = process.env.FABRIK3D_BASE_URL ?? 'http://127.0.0.1:7249'
const clientCount = Number(process.env.LOAD_CLIENTS ?? '50')
const jobCount = Number(process.env.LOAD_JOBS ?? '25')
const seed = Number(process.env.LOAD_SEED ?? '1337')
const runReconnect = (process.env.LOAD_RECONNECT ?? 'true') !== 'false'
const reconnectClients = Number(process.env.LOAD_RECONNECT_CLIENTS ?? String(Math.min(clientCount, 50)))
const settleMs = Number(process.env.LOAD_SETTLE_MS ?? '1000')
const resultFile = process.env.LOAD_RESULT_FILE ?? `load-results/signalr-load-${new Date().toISOString().replace(/[:.]/g, '-')}.json`

/** Deterministic PRNG (mulberry32) so a seeded run is reproducible. */
function seededRandom(seedValue) {
  let state = seedValue >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function percentile(sortedAscending, fraction) {
  if (sortedAscending.length === 0) return 0
  const position = Math.min(1, Math.max(0, fraction)) * (sortedAscending.length - 1)
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sortedAscending[lower]
  return sortedAscending[lower] + (sortedAscending[upper] - sortedAscending[lower]) * (position - lower)
}

function round(value, digits = 2) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function latencySummary(values) {
  const sorted = [...values].sort((a, b) => a - b)
  if (sorted.length === 0) return { count: 0, mean: 0, p50: 0, p95: 0, p99: 0, max: 0 }
  const sum = sorted.reduce((total, value) => total + value, 0)
  return {
    count: sorted.length,
    mean: round(sum / sorted.length),
    p50: round(percentile(sorted, 0.5)),
    p95: round(percentile(sorted, 0.95)),
    p99: round(percentile(sorted, 0.99)),
    max: round(sorted[sorted.length - 1]),
  }
}

async function issueToken(role, subject) {
  const response = await fetch(`${base}/api/auth/dev-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, subject }),
  })
  if (!response.ok) throw new Error(`dev-token failed: HTTP ${response.status}`)
  return (await response.json()).accessToken
}

async function main() {
  const random = seededRandom(seed)
  const clients = []
  const connectLatencies = []
  const deliveryLatencies = []
  const receivedPerClient = []
  let received = 0
  let totalRegistered = 0

  const cpuStart = process.cpuUsage()
  const wallStart = performance.now()

  for (let index = 0; index < clientCount; index++) {
    const token = await issueToken('Learner', `load-client-${index}`)
    const connection = new HubConnectionBuilder()
      .withUrl(`${base}/hubs/orchestration`, { accessTokenFactory: () => token })
      .configureLogging(LogLevel.None)
      .build()

    const state = { received: 0, pending: [] }
    receivedPerClient.push(state)
    connection.on('JobStateChanged', () => {
      received += 1
      state.received += 1
      const sentAt = state.pending.shift()
      if (typeof sentAt === 'number') deliveryLatencies.push(performance.now() - sentAt)
    })

    const start = performance.now()
    await connection.start()
    connectLatencies.push(performance.now() - start)
    clients.push({ connection, state })
    totalRegistered += 1
  }
  const connectMs = performance.now() - wallStart

  const operatorToken = await issueToken('Operator', 'load-operator')
  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${operatorToken}`,
  }

  received = 0
  for (const entry of clients) entry.state.received = 0
  const messageStart = performance.now()
  for (let index = 0; index < jobCount; index++) {
    const created = await fetch(`${base}/api/jobs`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name: `load-${seed}-${index}` }),
    })
    const job = await created.json()
    for (const action of ['start', 'pause', 'resume', 'stop']) {
      const sentAt = performance.now()
      for (const entry of clients) entry.state.pending.push(sentAt)
      await fetch(`${base}/api/jobs/${job.id}/${action}`, { method: 'POST', headers: authHeaders })
      // Deterministic jitter between commands keeps command issue order reproducible.
      if (random() < 0.25) await new Promise((resolveDelay) => setTimeout(resolveDelay, 1))
    }
  }

  // Allow in-flight deliveries to arrive before measuring.
  await new Promise((resolve) => setTimeout(resolve, settleMs))
  const messageMs = performance.now() - messageStart

  const broadcasts = jobCount * 4
  const expectedMessages = broadcasts * clients.length
  const loss = expectedMessages - received
  const perClientMin = receivedPerClient.length > 0 ? Math.min(...receivedPerClient.map((state) => state.received)) : 0

  let reconnect = null
  if (runReconnect) {
    const target = Math.min(reconnectClients, clients.length)
    const reconnectLatencies = []
    let failures = 0
    const reconnectStart = performance.now()
    for (let index = 0; index < target; index++) {
      const { connection } = clients[index]
      try {
        await connection.stop()
        const start = performance.now()
        await connection.start()
        reconnectLatencies.push(performance.now() - start)
      } catch (error) {
        failures += 1
        console.error(`[signalr-load] reconnect ${index} failed: ${error instanceof Error ? error.message : error}`)
      }
    }
    reconnect = {
      attempted: target,
      failures,
      totalMs: round(performance.now() - reconnectStart),
      latencyMs: latencySummary(reconnectLatencies),
    }
  }

  for (const { connection } of clients) {
    try {
      await connection.stop()
    } catch {
      // best-effort shutdown
    }
  }

  const wallMs = performance.now() - wallStart
  const cpu = process.cpuUsage(cpuStart)
  const memory = process.memoryUsage()
  const cpuPercent = round(((cpu.user + cpu.system) / 1000 / wallMs) * 100, 2)

  const result = {
    schemaVersion: '1.0',
    recordedAt: new Date().toISOString(),
    harness: 'signalr-load',
    seed,
    baseUrl: base,
    environment: {
      node: process.version,
      platform: `${os.platform()} ${os.release()}`,
      cpu: os.cpus()[0]?.model ?? 'unknown',
      logicalCores: os.cpus().length,
    },
    clients: clients.length,
    jobs: jobCount,
    broadcasts,
    expectedMessages,
    messagesReceived: received,
    loss,
    perClientMinReceived: perClientMin,
    meanConnectMs: round(connectMs / Math.max(1, clients.length)),
    connections: {
      requested: clientCount,
      registered: totalRegistered,
      totalMs: round(connectMs),
      latencyMs: latencySummary(connectLatencies),
    },
    delivery: {
      windowMs: round(messageMs),
      messagesPerSecond: round(received / (messageMs / 1000), 0),
      latencyMs: latencySummary(deliveryLatencies),
    },
    reconnect,
    resources: {
      wallMs: round(wallMs),
      cpuPercent,
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      externalBytes: memory.external,
    },
  }

  try {
    const absolute = resolve(resultFile)
    mkdirSync(dirname(absolute), { recursive: true })
    writeFileSync(absolute, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    console.log(`[signalr-load] result written to ${absolute}`)
  } catch (error) {
    console.error(`[signalr-load] could not write result file: ${error instanceof Error ? error.message : error}`)
  }

  console.log(`[signalr-load] ${JSON.stringify(result)}`)
}

main().catch((error) => {
  console.error(`[signalr-load] ${error.stack ?? error.message}`)
  process.exit(1)
})
