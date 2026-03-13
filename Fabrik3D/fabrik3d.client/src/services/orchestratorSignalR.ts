/**
 * Lightweight SignalR wrapper for the Fabrik3D orchestration hub.
 *
 * Connects to /hubs/orchestration and exposes typed event subscriptions.
 */

import { HubConnectionBuilder, HubConnection, LogLevel } from '@microsoft/signalr'

// ── Event payloads (match Fabrik3D.Contracts.Events) ───────────────

export interface JobStateChangedEvent {
  jobId: string
  oldStatus: string
  newStatus: string
  timestampUtc: string
}

export interface SimulationStateChangedEvent {
  sessionId: string
  jobId: string
  status: string
  currentPhase: string
  machinedCount: number
  remainingCount: number
  totalCount: number
  timestampUtc: string
}

export interface AlarmRaisedEvent {
  alarmId: string
  code: string
  title: string
  message: string
  severity: string
  source: string
  timestampUtc: string
}

export interface AlarmAcknowledgedEvent {
  alarmId: string
  acknowledgedBy: string
  timestampUtc: string
}

export interface OperatorMessageEvent {
  messageId: string
  title: string
  message: string
  type: string
  source: string
  timestampUtc: string
}

export interface MachineStateChangedEvent {
  machineStateId: string
  machineMode: string
  simulationStatus: string
  robotState: string
  cncState: string
  currentPhase: string
  isRunning: boolean
  isPaused: boolean
  timestampUtc: string
}

// ── Callback registry ──────────────────────────────────────────────

export type OrchestrationCallbacks = {
  onJobStateChanged?: (evt: JobStateChangedEvent) => void
  onSimulationStateChanged?: (evt: SimulationStateChangedEvent) => void
  onAlarmRaised?: (evt: AlarmRaisedEvent) => void
  onAlarmAcknowledged?: (evt: AlarmAcknowledgedEvent) => void
  onOperatorMessage?: (evt: OperatorMessageEvent) => void
  onMachineStateChanged?: (evt: MachineStateChangedEvent) => void
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
    callbacks.onJobStateChanged?.(evt)
  })
  connection.on('SimulationStateChanged', (evt: SimulationStateChangedEvent) => {
    callbacks.onSimulationStateChanged?.(evt)
  })
  connection.on('AlarmRaised', (evt: AlarmRaisedEvent) => {
    callbacks.onAlarmRaised?.(evt)
  })
  connection.on('AlarmAcknowledged', (evt: AlarmAcknowledgedEvent) => {
    callbacks.onAlarmAcknowledged?.(evt)
  })
  connection.on('OperatorMessage', (evt: OperatorMessageEvent) => {
    callbacks.onOperatorMessage?.(evt)
  })
  connection.on('MachineStateChanged', (evt: MachineStateChangedEvent) => {
    callbacks.onMachineStateChanged?.(evt)
  })

  try {
    await connection.start()
    console.log('[SignalR] Connected to orchestration hub')
  } catch (err) {
    console.warn(`[SignalR] Failed to connect to ${url} — running offline`, err)
    connection = null
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
