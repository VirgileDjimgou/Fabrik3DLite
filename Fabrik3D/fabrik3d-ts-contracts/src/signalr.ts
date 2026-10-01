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

/** Targeted execution request delivered only to the assigned simulator's group (S51). */
export interface ExecutionDispatchRequestedEvent {
  jobId: string
  sessionId: string
  targetCellId: string
  assignedSimulatorId: string
  correlationId: string
  dispatchedAtUtc: string
  timeoutAtUtc: string
  taskIds: string[]
}

/** Dispatch lifecycle change observed by the HMI (S51). */
export interface DispatchStateChangedEvent {
  jobId: string
  sessionId: string
  dispatchState: string
  targetCellId?: string | null
  assignedSimulatorId?: string | null
  correlationId?: string | null
  failureReason?: string | null
  timestampUtc: string
}

/** Targeted jog command delivered only to the assigned simulator's group (S53). */
export interface JogCommandIssuedEvent {
  cellId: string
  robotId: string
  simulatorId: string
  action: string
  joint: string
  direction: number
  deadManToken?: string | null
  reason?: string | null
  correlationId: string
  issuedAtUtc: string
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
  'ExecutionDispatchRequested',
  'DispatchStateChanged',
  'JogCommandIssued',
] as const

export type OrchestrationHubEventName = (typeof orchestrationHubEvents)[number]
