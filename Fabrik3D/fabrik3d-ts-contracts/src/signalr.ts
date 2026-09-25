/** SignalR payloads mirrored from Fabrik3D.Contracts.Events. */
export interface JobStateChangedEvent {
  jobId: string
  oldStatus: string
  newStatus: string
  timestampUtc: string
  correlationId?: string | null
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
  correlationId?: string | null
  scenarioId?: string | null
  scenarioActivityId?: string | null
  scenarioProgress?: number
}

export interface TaskStateChangedEvent {
  taskId: string
  jobId: string
  oldStatus: string
  newStatus: string
  timestampUtc: string
  correlationId?: string | null
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

export interface ControlAuthorityChangedEvent {
  scope: string
  mode: string
  state: string
  ownerId?: string | null
  ownerKind?: string | null
  previousMode?: string | null
  previousOwnerId?: string | null
  degradedReason?: string | null
  leaseExpiresAtUtc?: string | null
  eventType: string
  timestampUtc: string
  correlationId?: string | null
}

export const orchestrationHubEvents = [
  'JobStateChanged',
  'SimulationStateChanged',
  'TaskStateChanged',
  'AlarmRaised',
  'AlarmAcknowledged',
  'OperatorMessage',
  'MachineStateChanged',
  'ControlAuthorityChanged',
] as const

export type OrchestrationHubEventName = (typeof orchestrationHubEvents)[number]
