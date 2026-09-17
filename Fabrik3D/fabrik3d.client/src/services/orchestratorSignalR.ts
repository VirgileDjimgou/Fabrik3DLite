/**
 * Lightweight SignalR wrapper for the Fabrik3D orchestration hub.
 *
 * Connects to /hubs/orchestration and exposes typed event subscriptions.
 */

import { HubConnectionBuilder, HubConnection, LogLevel } from '@microsoft/signalr'
import type {
  AlarmAcknowledgedEvent,
  AlarmRaisedEvent,
  JobStateChangedEvent,
  MachineStateChangedEvent,
  OperatorMessageEvent,
  SimulationStateChangedEvent,
  TaskStateChangedEvent,
} from '@fabrik3d/contracts'
import { logSignalR } from './devLogger'

export type {
  AlarmAcknowledgedEvent,
  AlarmRaisedEvent,
  JobStateChangedEvent,
  MachineStateChangedEvent,
  OperatorMessageEvent,
  SimulationStateChangedEvent,
  TaskStateChangedEvent,
} from '@fabrik3d/contracts'

// ── Callback registry ──────────────────────────────────────────────

export type ConnectionState = 'connected' | 'reconnecting' | 'disconnected'

export type OrchestrationCallbacks = {
  onJobStateChanged?: (evt: JobStateChangedEvent) => void
  onSimulationStateChanged?: (evt: SimulationStateChangedEvent) => void
  onTaskStateChanged?: (evt: TaskStateChangedEvent) => void
  onAlarmRaised?: (evt: AlarmRaisedEvent) => void
  onAlarmAcknowledged?: (evt: AlarmAcknowledgedEvent) => void
  onOperatorMessage?: (evt: OperatorMessageEvent) => void
  onMachineStateChanged?: (evt: MachineStateChangedEvent) => void
  onConnectionStateChanged?: (state: ConnectionState) => void
}

// ── Connection class ───────────────────────────────────────────────

let connection: HubConnection | null = null
const callbacks: OrchestrationCallbacks = {}

/** Build the hub URL from the same base the REST client uses. */
function resolveHubUrl(): string {
  const base = import.meta.env.VITE_ORCHESTRATOR_URL as string | undefined
  if (base) {
    // Explicit backend — use absolute URL so SignalR skips the Vite proxy
    return `${base.replace(/\/+$/, '')}/hubs/orchestration`
  }
  // Relative URL — goes through the Vite proxy in development
  return '/hubs/orchestration'
}

/**
 * Connect to the orchestration hub.
 * Safe to call multiple times — only creates one connection.
 */
export async function connect(hubUrl?: string): Promise<void> {
  if (connection) return

  const url = hubUrl ?? resolveHubUrl()

  if (import.meta.env.DEV) {
    console.log(`[SignalR] hub URL → ${url}`)
  }

  connection = new HubConnectionBuilder()
    .withUrl(url)
    .withAutomaticReconnect()
    .configureLogging(LogLevel.Information)
    .build()

  connection.on('JobStateChanged', (evt: JobStateChangedEvent) => {
    logSignalR('JobStateChanged', evt)
    callbacks.onJobStateChanged?.(evt)
  })
  connection.on('SimulationStateChanged', (evt: SimulationStateChangedEvent) => {
    logSignalR('SimulationStateChanged', evt)
    callbacks.onSimulationStateChanged?.(evt)
  })
  connection.on('TaskStateChanged', (evt: TaskStateChangedEvent) => {
    logSignalR('TaskStateChanged', evt)
    callbacks.onTaskStateChanged?.(evt)
  })
  connection.on('AlarmRaised', (evt: AlarmRaisedEvent) => {
    logSignalR('AlarmRaised', evt)
    callbacks.onAlarmRaised?.(evt)
  })
  connection.on('AlarmAcknowledged', (evt: AlarmAcknowledgedEvent) => {
    logSignalR('AlarmAcknowledged', evt)
    callbacks.onAlarmAcknowledged?.(evt)
  })
  connection.on('OperatorMessage', (evt: OperatorMessageEvent) => {
    logSignalR('OperatorMessage', evt)
    callbacks.onOperatorMessage?.(evt)
  })
  connection.on('MachineStateChanged', (evt: MachineStateChangedEvent) => {
    logSignalR('MachineStateChanged', evt)
    callbacks.onMachineStateChanged?.(evt)
  })

  connection.onreconnecting(() => {
    console.warn('[SignalR] Reconnecting to orchestration hub')
    callbacks.onConnectionStateChanged?.('reconnecting')
  })
  connection.onreconnected(() => {
    console.log('[SignalR] Reconnected to orchestration hub')
    callbacks.onConnectionStateChanged?.('connected')
  })
  connection.onclose(() => {
    console.warn('[SignalR] Orchestration hub closed')
    callbacks.onConnectionStateChanged?.('disconnected')
  })

  try {
    await connection.start()
    console.log('[SignalR] Connected to orchestration hub')
    callbacks.onConnectionStateChanged?.('connected')
  } catch (err) {
    console.warn(`[SignalR] Failed to connect to ${url} — running offline`, err)
    connection = null
    callbacks.onConnectionStateChanged?.('disconnected')
  }
}

/** Register event callbacks (can be called before connect). */
export function on(cbs: Partial<OrchestrationCallbacks>): void {
  Object.assign(callbacks, cbs)
}

/** Disconnect from the hub. */
export async function disconnect(): Promise<void> {
  if (!connection) return
  await connection.stop()
  connection = null
}

/** True if currently connected. */
export function isConnected(): boolean {
  return connection?.state === 'Connected'
}

/** Current connection state for the operator dashboard. */
export function getConnectionState(): ConnectionState {
  if (!connection) return 'disconnected'
  if (connection.state === 'Connected') return 'connected'
  if (connection.state === 'Reconnecting') return 'reconnecting'
  return 'disconnected'
}
