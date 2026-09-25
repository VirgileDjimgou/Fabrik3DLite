import { HubConnectionBuilder, HubConnection, LogLevel } from '@microsoft/signalr'
import { getAccessToken, isTokenExpired, notifyUnauthorized } from '@/auth/authStore'
import type {
  AlarmAcknowledgedEvent,
  AlarmRaisedEvent,
  ControlAuthorityChangedEvent,
  JobStateChangedEvent,
  MachineStateChangedEvent,
  OperatorMessageEvent,
  SimulationStateChangedEvent,
  TaskStateChangedEvent,
} from '@fabrik3d/contracts'

export type {
  AlarmAcknowledgedEvent,
  AlarmRaisedEvent,
  ControlAuthorityChangedEvent,
  JobStateChangedEvent,
  MachineStateChangedEvent,
  OperatorMessageEvent,
  SimulationStateChangedEvent,
  TaskStateChangedEvent,
} from '@fabrik3d/contracts'

// ── Connection state ──

export type ConnectionState = 'connected' | 'reconnecting' | 'disconnected'

// ── Callback map ──

export type HubCallbacks = {
  onJobStateChanged?: (e: JobStateChangedEvent) => void
  onSimulationStateChanged?: (e: SimulationStateChangedEvent) => void
  onTaskStateChanged?: (e: TaskStateChangedEvent) => void
  onAlarmRaised?: (e: AlarmRaisedEvent) => void
  onAlarmAcknowledged?: (e: AlarmAcknowledgedEvent) => void
  onOperatorMessage?: (e: OperatorMessageEvent) => void
  onMachineStateChanged?: (e: MachineStateChangedEvent) => void
  onControlAuthorityChanged?: (e: ControlAuthorityChangedEvent) => void
  onConnectionStateChanged?: (s: ConnectionState) => void
}

// ── Internal state ──

let connection: HubConnection | null = null
let nextId = 0
const listeners = new Map<number, Partial<HubCallbacks>>()

function dispatch(key: string, arg: unknown): void {
  for (const l of listeners.values()) {
    const fn = (l as Record<string, ((a: unknown) => void) | undefined>)[key]
    fn?.(arg)
  }
}

function resolveHubUrl(): string {
  const base = import.meta.env.VITE_ORCHESTRATOR_URL as string | undefined
  return base ? `${base.replace(/\/+$/, '')}/hubs/orchestration` : '/hubs/orchestration'
}

// ── Public API ──

export async function connect(): Promise<void> {
  if (connection) return
  const url = resolveHubUrl()
  connection = new HubConnectionBuilder()
    .withUrl(url, {
      // SignalR passes the JWT as the `access_token` query parameter during negotiation; the
      // server reads it only for the /hubs path. Tokens are never logged or placed in REST URLs.
      accessTokenFactory: () => getAccessToken() ?? '',
    }).withAutomaticReconnect()
    .configureLogging(LogLevel.Information).build()

  connection.on('JobStateChanged', (e) => dispatch('onJobStateChanged', e))
  connection.on('SimulationStateChanged', (e) => dispatch('onSimulationStateChanged', e))
  connection.on('TaskStateChanged', (e) => dispatch('onTaskStateChanged', e))
  connection.on('AlarmRaised', (e) => dispatch('onAlarmRaised', e))
  connection.on('AlarmAcknowledged', (e) => dispatch('onAlarmAcknowledged', e))
  connection.on('OperatorMessage', (e) => dispatch('onOperatorMessage', e))
  connection.on('MachineStateChanged', (e) => dispatch('onMachineStateChanged', e))
  connection.on('ControlAuthorityChanged', (e) => dispatch('onControlAuthorityChanged', e))

  connection.onreconnecting(() => dispatch('onConnectionStateChanged', 'reconnecting'))
  connection.onreconnected(() => dispatch('onConnectionStateChanged', 'connected'))
  connection.onclose(() => {
    dispatch('onConnectionStateChanged', 'disconnected')
    // A closed hub with an expired token is an explicit re-auth signal, never silent anonymity.
    const bearer = getAccessToken()
    if (!bearer || isTokenExpired(bearer)) notifyUnauthorized()
  })

  try {
    await connection.start()
    console.log('[HMI Hub] Connected')
    dispatch('onConnectionStateChanged', 'connected')
  } catch (err) {
    console.warn('[HMI Hub] Offline', err)
    connection = null
    dispatch('onConnectionStateChanged', 'disconnected')
  }
}

/** Subscribe to hub events. Returns an unsubscribe function. */
export function subscribe(cbs: Partial<HubCallbacks>): () => void {
  const id = nextId++
  listeners.set(id, cbs)
  return () => { listeners.delete(id) }
}

/** @deprecated Use subscribe() for multi-listener support. */
export function on(cbs: Partial<HubCallbacks>): void {
  if (!listeners.has(-1)) listeners.set(-1, {})
  Object.assign(listeners.get(-1)!, cbs)
}

export async function disconnect(): Promise<void> { if (connection) { await connection.stop(); connection = null } }
export function isConnected(): boolean { return connection?.state === 'Connected' }

export function getConnectionState(): ConnectionState {
  if (!connection) return 'disconnected'
  if (connection.state === 'Connected') return 'connected'
  if (connection.state === 'Reconnecting') return 'reconnecting'
  return 'disconnected'
}
