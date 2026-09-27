/**
 * S49 SignalR load measurement harness.
 *
 * Connects N concurrent SignalR clients to a running Fabrik3D orchestrator, then generates job
 * state transitions (each broadcasts a JobStateChanged event) and reports connection time and
 * delivered message throughput. It is an evidence-generating script, not a test assertion: run it
 * against a disposable Testing-mode server (see docs/operations/PERFORMANCE.md).
 *
 * Usage (from Fabrik3D/fabrik3d.client):
 *   node scripts/signalr-load.mjs
 * Environment:
 *   FABRIK3D_BASE_URL (default http://127.0.0.1:7249)
 *   LOAD_CLIENTS      (default 25)
 *   LOAD_JOBS         (default 50)
 */
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr'

const base = process.env.FABRIK3D_BASE_URL ?? 'http://127.0.0.1:7249'
const clientCount = Number(process.env.LOAD_CLIENTS ?? '25')
const jobCount = Number(process.env.LOAD_JOBS ?? '50')

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
  const clients = []
  let received = 0

  const connectStart = performance.now()
  for (let index = 0; index < clientCount; index++) {
    const token = await issueToken('Learner', `load-client-${index}`)
    const connection = new HubConnectionBuilder()
      .withUrl(`${base}/hubs/orchestration`, { accessTokenFactory: () => token })
      .configureLogging(LogLevel.None)
      .build()
    connection.on('JobStateChanged', () => { received += 1 })
    await connection.start()
    clients.push(connection)
  }
  const connectMs = performance.now() - connectStart

  const operatorToken = await issueToken('Operator', 'load-operator')
  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${operatorToken}`,
  }

  received = 0
  const messageStart = performance.now()
  for (let index = 0; index < jobCount; index++) {
    const created = await fetch(`${base}/api/jobs`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name: `load-${index}` }),
    })
    const job = await created.json()
    for (const action of ['start', 'pause', 'resume', 'stop']) {
      await fetch(`${base}/api/jobs/${job.id}/${action}`, { method: 'POST', headers: authHeaders })
    }
  }

  // Allow in-flight deliveries to arrive before measuring.
  await new Promise((resolve) => setTimeout(resolve, 1000))
  const messageMs = performance.now() - messageStart

  for (const connection of clients) {
    await connection.stop()
  }

  const broadcasts = jobCount * 4
  const result = {
    baseUrl: base,
    clients: clients.length,
    connectMs: Number(connectMs.toFixed(1)),
    meanConnectMs: Number((connectMs / Math.max(1, clients.length)).toFixed(2)),
    broadcasts,
    messagesReceived: received,
    messageWindowMs: Number(messageMs.toFixed(1)),
    messagesPerSecond: Number((received / (messageMs / 1000)).toFixed(0)),
  }
  console.log(`[signalr-load] ${JSON.stringify(result)}`)
}

main().catch((error) => {
  console.error(`[signalr-load] ${error.stack ?? error.message}`)
  process.exit(1)
})
