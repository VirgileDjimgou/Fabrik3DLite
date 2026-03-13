import { HubConnectionBuilder, HubConnection, LogLevel } from '@microsoft/signalr'

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

export type HubCallbacks = {
  onJobStateChanged?: (e: JobStateChangedEvent) => void
  onSimulationStateChanged?: (e: SimulationStateChangedEvent) => void
  onAlarmRaised?: (e: AlarmRaisedEvent) => void
  onAlarmAcknowledged?: (e: AlarmAcknowledgedEvent) => void
  onOperatorMessage?: (e: OperatorMessageEvent) => void
  onMachineStateChanged?: (e: MachineStateChangedEvent) => void
}

let connection: HubConnection | null = null
const callbacks: HubCallbacks = {}

function resolveHubUrl(): string {
  const base = import.meta.env.VITE_ORCHESTRATOR_URL as string | undefined
  return base ? `${base.replace(/\/+$/, '')}/hubs/orchestration` : '/hubs/orchestration'
}

export async function connect(): Promise<void> {
  if (connection) return
  const url = resolveHubUrl()
  connection = new HubConnectionBuilder()
    .withUrl(url).withAutomaticReconnect()
    .configureLogging(LogLevel.Information).build()

  connection.on('JobStateChanged', (e: JobStateChangedEvent) => callbacks.onJobStateChanged?.(e))
  connection.on('SimulationStateChanged', (e: SimulationStateChangedEvent) => callbacks.onSimulationStateChanged?.(e))
  connection.on('AlarmRaised', (e: AlarmRaisedEvent) => callbacks.onAlarmRaised?.(e))
  connection.on('AlarmAcknowledged', (e: AlarmAcknowledgedEvent) => callbacks.onAlarmAcknowledged?.(e))
  connection.on('OperatorMessage', (e: OperatorMessageEvent) => callbacks.onOperatorMessage?.(e))
  connection.on('MachineStateChanged', (e: MachineStateChangedEvent) => callbacks.onMachineStateChanged?.(e))

  try { await connection.start(); console.log('[HMI Hub] Connected') }
  catch (err) { console.warn('[HMI Hub] Offline', err); connection = null }
}

export function on(cbs: Partial<HubCallbacks>): void { Object.assign(callbacks, cbs) }
export async function disconnect(): Promise<void> { if (connection) { await connection.stop(); connection = null } }
export function isConnected(): boolean { return connection?.state === 'Connected' }
