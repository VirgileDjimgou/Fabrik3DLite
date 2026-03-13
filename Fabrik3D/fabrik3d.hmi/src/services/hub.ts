import { HubConnectionBuilder, HubConnection, LogLevel } from '@microsoft/signalr'

// ── Event DTOs (matching Fabrik3D.Contracts.Events) ──

export interface JobStateChangedEvent {
  jobId: string; oldStatus: string; newStatus: string; timestampUtc: string
}
export interface SimulationStateChangedEvent {
  sessionId: string; jobId: string; status: string; currentPhase: string
  machinedCount: number; remainingCount: number; totalCount: number; timestampUtc: string
}
export interface AlarmRaisedEvent {
  alarmId: string; code: string; title: string; message: string
  severity: string; source: string; timestampUtc: string
}
export interface AlarmAcknowledgedEvent {
  alarmId: string; acknowledgedBy: string; timestampUtc: string
}
export interface OperatorMessageEvent {
  messageId: string; title: string; message: string
  type: string; source: string; timestampUtc: string
}
export interface MachineStateChangedEvent {
  machineStateId: string; machineMode: string; simulationStatus: string
  robotState: string; cncState: string; currentPhase: string
  isRunning: boolean; isPaused: boolean; timestampUtc: string
}

// ── Connection state ──

export type ConnectionState = 'connected' | 'reconnecting' | 'disconnected'

// ── Callback map ──

export type HubCallbacks = {
  onJobStateChanged?: (e: JobStateChangedEvent) => void
  onSimulationStateChanged?: (e: SimulationStateChangedEvent) => void
  onAlarmRaised?: (e: AlarmRaisedEvent) => void
  onAlarmAcknowledged?: (e: AlarmAcknowledgedEvent) => void
  onOperatorMessage?: (e: OperatorMessageEvent) => void
  onMachineStateChanged?: (e: MachineStateChangedEvent) => void
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
    .withUrl(url).withAutomaticReconnect()
    .configureLogging(LogLevel.Information).build()

  connection.on('JobStateChanged', (e) => dispatch('onJobStateChanged', e))
  connection.on('SimulationStateChanged', (e) => dispatch('onSimulationStateChanged', e))
  connection.on('AlarmRaised', (e) => dispatch('onAlarmRaised', e))
  connection.on('AlarmAcknowledged', (e) => dispatch('onAlarmAcknowledged', e))
  connection.on('OperatorMessage', (e) => dispatch('onOperatorMessage', e))
  connection.on('MachineStateChanged', (e) => dispatch('onMachineStateChanged', e))

  connection.onreconnecting(() => dispatch('onConnectionStateChanged', 'reconnecting'))
  connection.onreconnected(() => dispatch('onConnectionStateChanged', 'connected'))
  connection.onclose(() => dispatch('onConnectionStateChanged', 'disconnected'))

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
