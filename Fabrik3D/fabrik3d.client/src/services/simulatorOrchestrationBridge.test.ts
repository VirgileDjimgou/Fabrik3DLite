import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type {
  DispatchResultDto,
  ExecutionDispatchRequestedEvent,
  JobDto,
  MachineStateDto,
  SimulationSessionDto,
  TaskDto,
} from '@fabrik3d/contracts'
import type { PalletData } from '../simulation/PalletModels'
import type { PalletMachiningWorkflow } from '../simulation/PalletMachiningWorkflow'
import { SimulatorOrchestrationBridge } from './simulatorOrchestrationBridge'
import * as api from './orchestratorApi'
import * as hub from './orchestratorSignalR'

vi.mock('./orchestratorApi', () => ({
  SIMULATOR_ID: 'test-simulator',
  newCorrelationId: vi.fn(() => 'corr-test'),
  getJobs: vi.fn(),
  createJob: vi.fn(),
  startJob: vi.fn(),
  pauseJob: vi.fn(),
  resumeJob: vi.fn(),
  stopJob: vi.fn(),
  claimJob: vi.fn(),
  dispatchJob: vi.fn(),
  acknowledgeDispatch: vi.fn(),
  getJobDispatch: vi.fn(),
  getSessionById: vi.fn(),
  getJobTasks: vi.fn(),
  updateSimulationSessionState: vi.fn(),
  heartbeatSimulationSession: vi.fn(),
  updateCurrentMachineState: vi.fn(),
  updateTaskStatus: vi.fn(),
  getControlAuthority: vi.fn(),
  publishRobotPositions: vi.fn(),
}))

vi.mock('./orchestratorSignalR', () => ({
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  registerSimulator: vi.fn().mockResolvedValue(undefined),
  isConnected: vi.fn(() => true),
}))

const mockApi = vi.mocked(api)

function jobDto(overrides: Partial<JobDto> = {}): JobDto {
  return {
    id: 'job-1',
    name: 'Demo job',
    description: '',
    status: 'Created',
    machineMode: 'Automatic',
    createdAtUtc: '2026-01-01T00:00:00Z',
    updatedAtUtc: '2026-01-01T00:00:00Z',
    startedAtUtc: null,
    completedAtUtc: null,
    pausedAtUtc: null,
    stoppedAtUtc: null,
    currentTaskIndex: 0,
    progressPercent: 0,
    simulationSessionId: null,
    metadata: {},
    version: 0,
    targetCellId: null,
    assignedSimulatorId: null,
    dispatchState: 'None',
    dispatchCorrelationId: null,
    dispatchedAtUtc: null,
    dispatchAcknowledgedAtUtc: null,
    dispatchTimeoutAtUtc: null,
    dispatchFailureReason: null,
    priority: 0,
    scenarioId: null,
    cellTemplateId: null,
    palletId: null,
    palletRows: 0,
    palletColumns: 0,
    taskCount: 0,
    completedTaskCount: 0,
    schemaVersion: 1,
    failedAtUtc: null,
    cancelledAtUtc: null,
    ...overrides,
  }
}

function sessionDto(overrides: Partial<SimulationSessionDto> = {}): SimulationSessionDto {
  return {
    id: 'session-1',
    jobId: 'job-1',
    status: 'Running',
    startedAtUtc: '2026-01-01T00:00:00Z',
    endedAtUtc: null,
    isPaused: false,
    currentPhase: 'IDLE',
    currentPalletId: null,
    currentTaskId: null,
    currentPartId: null,
    machinedCount: 0,
    remainingCount: 0,
    totalCount: 0,
    lastHeartbeatUtc: '2026-01-01T00:00:00Z',
    simulatorId: 'test-simulator',
    correlationId: 'corr-test',
    version: 0,
    scenarioId: null,
    scenarioActivityId: null,
    scenarioProgress: 0,
    targetCellId: null,
    ...overrides,
  }
}

function taskDto(overrides: Partial<TaskDto> = {}): TaskDto {
  return {
    id: 'task-1',
    jobId: 'job-1',
    name: 'Slot R0 C0',
    description: '',
    status: 'Pending',
    sequenceOrder: 0,
    partType: 'hex-billet',
    palletId: 'pallet-1',
    slotRow: 0,
    slotColumn: 0,
    createdAtUtc: '2026-01-01T00:00:00Z',
    updatedAtUtc: '2026-01-01T00:00:00Z',
    startedAtUtc: null,
    completedAtUtc: null,
    errorMessage: null,
    version: 0,
    slotKey: null,
    isRequired: true,
    ...overrides,
  }
}

function machineStateDto(): MachineStateDto {
  return {
    id: 'machine-1',
    simulationSessionId: 'session-7',
    machineMode: 'Automatic',
    simulationStatus: 'Running',
    robotState: 'MOVING',
    cncState: 'IDLE',
    currentPhase: 'MOVE_ABOVE_PALLET_SLOT',
    currentPalletId: 'pallet-1',
    currentTaskId: null,
    currentPartId: null,
    currentSlotRow: 0,
    currentSlotColumn: 0,
    isRunning: true,
    isPaused: false,
    lastUpdatedAtUtc: '2026-01-01T00:00:00Z',
  }
}

function pallet(id = 'pallet-1'): PalletData {
  return {
    id,
    rows: 2,
    cols: 2,
    cavityShape: 'hex',
    materialType: 'hex-billet',
    occupied: [[true, true], [true, true]],
    slotStatus: [['raw', 'raw'], ['raw', 'raw']],
    worldX: 0,
    state: 'stopped',
  }
}

function fakeWorkflow(): PalletMachiningWorkflow {
  const wf = {
    phase: 'IDLE',
    runState: 'idle',
    slotsCompleted: 0,
    remainingSlots: 4,
    totalSlots: 4,
    progressPercent: 0,
    currentRow: 0,
    currentCol: 0,
    pallet: null,
    onPhaseChanged: null,
    onSlotComplete: null,
    onRunStateChanged: null,
    onPalletComplete: null,
  } as unknown as PalletMachiningWorkflow
  return wf
}

async function connectBridge(bridge: SimulatorOrchestrationBridge): Promise<void> {
  mockApi.updateSimulationSessionState.mockResolvedValue(sessionDto())
  mockApi.updateCurrentMachineState.mockResolvedValue(machineStateDto())
  mockApi.heartbeatSimulationSession.mockResolvedValue(sessionDto())
  mockApi.updateTaskStatus.mockResolvedValue(taskDto())
  mockApi.getSessionById.mockResolvedValue(sessionDto({ id: 'session-7', jobId: 'job-42' }))
  mockApi.getJobTasks.mockResolvedValue([])
  mockApi.acknowledgeDispatch.mockResolvedValue(dispatchResult())
  await bridge.init()
  bridge.connectionState = 'connected'
}

function dispatchResult(overrides: Partial<DispatchResultDto> = {}): DispatchResultDto {
  return {
    job: jobDto({ id: 'job-42', status: 'Running', simulationSessionId: 'session-7' }),
    session: sessionDto({ id: 'session-7', jobId: 'job-42' }),
    tasks: [],
    dispatchState: 'Pending',
    targetCellId: 'reference-cell',
    assignedSimulatorId: 'test-simulator',
    dispatchCorrelationId: 'corr-dispatch',
    dispatchTimeoutAtUtc: '2026-01-01T00:00:20Z',
    failureReason: null,
    ...overrides,
  }
}

function dispatchEvent(overrides: Partial<ExecutionDispatchRequestedEvent> = {}): ExecutionDispatchRequestedEvent {
  return {
    jobId: 'job-42',
    sessionId: 'session-7',
    targetCellId: 'reference-cell',
    assignedSimulatorId: 'test-simulator',
    correlationId: 'corr-dispatch',
    dispatchedAtUtc: '2026-01-01T00:00:00Z',
    timeoutAtUtc: '2026-01-01T00:00:20Z',
    taskIds: ['task-a'],
    ...overrides,
  }
}

/** Captures the SignalR callbacks registered by the bridge so tests can drive events. */
function captureHubCallbacks(): hub.OrchestrationCallbacks {
  const onMock = vi.mocked(hub.on)
  const lastCall = onMock.mock.calls[onMock.mock.calls.length - 1]
  return (lastCall?.[0] ?? {}) as hub.OrchestrationCallbacks
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('SimulatorOrchestrationBridge', () => {
  it('registers its cell capability with the server on connect', async () => {
    const bridge = new SimulatorOrchestrationBridge()
    await connectBridge(bridge)

    expect(hub.registerSimulator).toHaveBeenCalledWith('test-simulator', 'reference-cell')
    bridge.dispose()
  })

  it('refuses a local production start while orchestrated', async () => {
    const bridge = new SimulatorOrchestrationBridge()
    await connectBridge(bridge)

    const localStart = vi.fn()
    await bridge.start(pallet('pallet-1'), localStart)

    // No implicit job creation or claim; the server dispatch owns the start.
    expect(mockApi.createJob).not.toHaveBeenCalled()
    expect(mockApi.claimJob).not.toHaveBeenCalled()
    expect(localStart).not.toHaveBeenCalled()
    expect(bridge.mode).toBe('online')

    bridge.dispose()
  })

  it('runs the local demo without touching the server when disconnected', async () => {
    const bridge = new SimulatorOrchestrationBridge()
    bridge.connectionState = 'disconnected'

    const localStart = vi.fn()
    await bridge.start(pallet(), localStart)

    expect(mockApi.createJob).not.toHaveBeenCalled()
    expect(mockApi.getJobs).not.toHaveBeenCalled()
    expect(bridge.mode).toBe('offline')
    expect(localStart).toHaveBeenCalledTimes(1)
  })

  it('adopts a targeted dispatch, starts automatically and acknowledges with the same correlation id', async () => {
    const bridge = new SimulatorOrchestrationBridge()
    await connectBridge(bridge)

    mockApi.getJobTasks.mockResolvedValue([
      taskDto({ id: 'task-a', palletId: 'pallet-1', slotRow: 0, slotColumn: 1 }),
    ])
    const externalStart = vi.fn()
    bridge.onExternalStart = externalStart
    bridge.palletResolver = () => pallet('pallet-1')

    const callbacks = captureHubCallbacks()
    await callbacks.onExecutionDispatchRequested?.(dispatchEvent())

    expect(bridge.mode).toBe('online')
    expect(bridge.ctx.jobId).toBe('job-42')
    expect(bridge.ctx.sessionId).toBe('session-7')
    expect(bridge.ctx.targetCellId).toBe('reference-cell')
    expect(externalStart).toHaveBeenCalledTimes(1)
    expect(externalStart).toHaveBeenCalledWith(expect.objectContaining({ id: 'pallet-1' }), 'job-42', 'session-7')

    // Acknowledged then Running, both with the dispatch correlation id.
    expect(mockApi.acknowledgeDispatch).toHaveBeenCalledWith('job-42', expect.objectContaining({
      simulatorId: 'test-simulator',
      correlationId: 'corr-dispatch',
      targetCellId: 'reference-cell',
      simulationSessionId: 'session-7',
      state: 'Acknowledged',
    }))
    expect(mockApi.acknowledgeDispatch).toHaveBeenCalledWith('job-42', expect.objectContaining({
      state: 'Running',
    }))
    expect(bridge.dispatchPhase).toBe('running')

    bridge.dispose()
  })

  it('ignores a dispatch targeted at another simulator or cell', async () => {
    const bridge = new SimulatorOrchestrationBridge()
    await connectBridge(bridge)

    const externalStart = vi.fn()
    bridge.onExternalStart = externalStart
    const callbacks = captureHubCallbacks()

    await callbacks.onExecutionDispatchRequested?.(dispatchEvent({ assignedSimulatorId: 'other-sim' }))
    await callbacks.onExecutionDispatchRequested?.(dispatchEvent({ targetCellId: 'other-cell' }))

    expect(externalStart).not.toHaveBeenCalled()
    expect(mockApi.acknowledgeDispatch).not.toHaveBeenCalled()

    bridge.dispose()
  })

  it('is idempotent for a duplicate dispatch of the same session', async () => {
    const bridge = new SimulatorOrchestrationBridge()
    await connectBridge(bridge)

    const externalStart = vi.fn()
    bridge.onExternalStart = externalStart
    bridge.palletResolver = () => pallet('pallet-1')
    const callbacks = captureHubCallbacks()

    await callbacks.onExecutionDispatchRequested?.(dispatchEvent())
    await callbacks.onExecutionDispatchRequested?.(dispatchEvent())

    // The workflow starts once; the duplicate only re-acknowledges.
    expect(externalStart).toHaveBeenCalledTimes(1)

    bridge.dispose()
  })

  it('reports task status transitions for mapped pallet slots after a dispatch', async () => {
    const bridge = new SimulatorOrchestrationBridge()
    await connectBridge(bridge)

    mockApi.getJobTasks.mockResolvedValue([
      taskDto({ id: 'task-a', palletId: 'pallet-1', slotRow: 0, slotColumn: 1 }),
      taskDto({ id: 'task-b', palletId: 'pallet-2', slotRow: 0, slotColumn: 0 }),
    ])

    const wf = fakeWorkflow()
    bridge.bindWorkflow(wf)
    bridge.onExternalStart = () => {}
    bridge.palletResolver = () => pallet('pallet-1')

    const callbacks = captureHubCallbacks()
    await callbacks.onExecutionDispatchRequested?.(dispatchEvent())

    ;(wf as { currentRow: number; currentCol: number }).currentRow = 0
    ;(wf as { currentRow: number; currentCol: number }).currentCol = 1
    wf.onPhaseChanged?.('MOVE_ABOVE_PALLET_SLOT')
    await vi.waitFor(() => {
      expect(mockApi.updateTaskStatus).toHaveBeenCalledWith('task-a', expect.objectContaining({
        status: 'Running',
        simulationSessionId: 'session-7',
        simulatorId: 'test-simulator',
      }))
    })
    expect(bridge.ctx.taskId).toBe('task-a')

    wf.onSlotComplete?.(0, 1)
    await vi.waitFor(() => {
      expect(mockApi.updateTaskStatus).toHaveBeenCalledWith('task-a', expect.objectContaining({
        status: 'Completed',
      }))
    })

    bridge.dispose()
  })

  it('pushes machine state only with an owned session and simulator id', async () => {
    const bridge = new SimulatorOrchestrationBridge()
    await connectBridge(bridge)

    const wf = fakeWorkflow()
    bridge.bindWorkflow(wf)
    bridge.onExternalStart = () => {}
    bridge.palletResolver = () => pallet('pallet-1')

    const callbacks = captureHubCallbacks()
    await callbacks.onExecutionDispatchRequested?.(dispatchEvent())

    wf.onRunStateChanged?.('running')
    await vi.waitFor(() => {
      expect(mockApi.updateCurrentMachineState).toHaveBeenCalledWith(expect.objectContaining({
        simulationSessionId: 'session-7',
        simulatorId: 'test-simulator',
      }))
    })

    bridge.dispose()
  })

  it('sends heartbeats for the adopted session while online', async () => {
    vi.useFakeTimers()
    const bridge = new SimulatorOrchestrationBridge()
    await connectBridge(bridge)

    bridge.onExternalStart = () => {}
    bridge.palletResolver = () => pallet('pallet-1')
    const callbacks = captureHubCallbacks()
    await callbacks.onExecutionDispatchRequested?.(dispatchEvent())
    expect(bridge.mode).toBe('online')

    await vi.advanceTimersByTimeAsync(5_000)
    expect(mockApi.heartbeatSimulationSession).toHaveBeenCalledWith('session-7', 'test-simulator')

    bridge.dispose()
  })

  it('never reports state in offline mode', async () => {
    const bridge = new SimulatorOrchestrationBridge()
    bridge.connectionState = 'disconnected'

    const wf = fakeWorkflow()
    bridge.bindWorkflow(wf)

    await bridge.start(pallet(), () => {})

    wf.onRunStateChanged?.('running')
    wf.onPhaseChanged?.('MACHINING')
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(mockApi.updateCurrentMachineState).not.toHaveBeenCalled()
    expect(mockApi.updateSimulationSessionState).not.toHaveBeenCalled()
    expect(mockApi.heartbeatSimulationSession).not.toHaveBeenCalled()
  })

  // ── Authoritative robot state and jog (S53) ────────────────────────

  it('publishes the provided robot report on its own 2 Hz timer', async () => {
    vi.useFakeTimers()
    const bridge = new SimulatorOrchestrationBridge()
    await connectBridge(bridge)
    mockApi.publishRobotPositions.mockResolvedValue({} as never)
    bridge.robotPositionsProvider = () => ({
      robotId: 'robot-1',
      robotModel: 'medium-6axis',
      joints: [],
      tcp: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
      frames: { baseFrame: 'world', toolFrame: 'flange', workObjectFrame: 'wo', currentToolId: 'tool-1' },
      motionStatus: 'IDLE',
      operatingMode: 'manual-training',
    })

    await vi.advanceTimersByTimeAsync(500)

    expect(mockApi.publishRobotPositions).toHaveBeenCalledWith('reference-cell', 'robot-1', expect.objectContaining({
      simulatorId: 'test-simulator',
      operatingMode: 'manual-training',
    }))
    bridge.dispose()
  })

  it('routes a jog command for its own cell and simulator to the gateway', async () => {
    const bridge = new SimulatorOrchestrationBridge()
    await connectBridge(bridge)

    const onJogCommand = vi.fn()
    bridge.onJogCommand = onJogCommand
    const callbacks = captureHubCallbacks()

    callbacks.onJogCommandIssued?.({
      cellId: 'reference-cell', robotId: 'robot-1', simulatorId: 'test-simulator',
      action: 'press', joint: 'J1', direction: 1, deadManToken: 'dm', correlationId: 'c1', issuedAtUtc: '2026-01-01T00:00:00Z',
    })
    callbacks.onJogCommandIssued?.({
      cellId: 'reference-cell', robotId: 'robot-1', simulatorId: 'other-sim',
      action: 'press', joint: 'J1', direction: 1, deadManToken: 'dm', correlationId: 'c2', issuedAtUtc: '2026-01-01T00:00:00Z',
    })

    expect(onJogCommand).toHaveBeenCalledTimes(1)
    bridge.dispose()
  })

  it('stops jog when the authority is lost or degraded', async () => {
    const bridge = new SimulatorOrchestrationBridge()
    await connectBridge(bridge)

    const onJogStop = vi.fn()
    bridge.onJogStop = onJogStop
    const callbacks = captureHubCallbacks()

    callbacks.onControlAuthorityChanged?.({
      scope: 'reference-cell', mode: 'external-controller', state: 'held', ownerId: 'op',
      eventType: 'authority_acquired', timestampUtc: '2026-01-01T00:00:00Z',
    })
    expect(bridge.authorityAllowsCommanding()).toBe(true)
    expect(onJogStop).not.toHaveBeenCalled()

    callbacks.onControlAuthorityChanged?.({
      scope: 'reference-cell', mode: 'external-controller', state: 'degraded', ownerId: 'op',
      degradedReason: 'controller-heartbeat-lost', eventType: 'authority_degraded', timestampUtc: '2026-01-01T00:00:01Z',
    })
    expect(bridge.authorityAllowsCommanding()).toBe(false)
    expect(onJogStop).toHaveBeenCalledWith('authority-loss')

    bridge.dispose()
  })

  it('stops jog when the connection drops', async () => {
    const bridge = new SimulatorOrchestrationBridge()
    await connectBridge(bridge)

    const onJogStop = vi.fn()
    bridge.onJogStop = onJogStop
    const callbacks = captureHubCallbacks()

    callbacks.onConnectionStateChanged?.('disconnected')

    expect(onJogStop).toHaveBeenCalledWith('disconnect')
    bridge.dispose()
  })
})
