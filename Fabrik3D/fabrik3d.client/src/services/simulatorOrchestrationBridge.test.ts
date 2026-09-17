import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { ClaimResultDto, JobDto, MachineStateDto, SimulationSessionDto, TaskDto } from '@fabrik3d/contracts'
import type { PalletData } from '../simulation/PalletModels'
import type { PalletMachiningWorkflow } from '../simulation/PalletMachiningWorkflow'
import { SimulatorOrchestrationBridge } from './simulatorOrchestrationBridge'
import * as api from './orchestratorApi'

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
  updateSimulationSessionState: vi.fn(),
  heartbeatSimulationSession: vi.fn(),
  updateCurrentMachineState: vi.fn(),
  updateTaskStatus: vi.fn(),
}))

vi.mock('./orchestratorSignalR', () => ({
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
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
  await bridge.init()
  bridge.connectionState = 'connected'
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('SimulatorOrchestrationBridge', () => {
  it('claims an existing runnable job instead of creating an implicit job', async () => {
    const bridge = new SimulatorOrchestrationBridge()
    await connectBridge(bridge)

    mockApi.getJobs.mockResolvedValue([jobDto({ id: 'job-42', status: 'Created' })])
    mockApi.claimJob.mockResolvedValue({
      job: jobDto({ id: 'job-42', status: 'Running', simulationSessionId: 'session-7' }),
      session: sessionDto({ id: 'session-7', jobId: 'job-42' }),
      tasks: [],
    } satisfies ClaimResultDto)

    const localStart = vi.fn()
    await bridge.start(pallet('pallet-1'), localStart)

    expect(mockApi.createJob).not.toHaveBeenCalled()
    expect(mockApi.claimJob).toHaveBeenCalledWith('job-42', {
      simulatorId: 'test-simulator',
      correlationId: 'corr-test',
    })
    expect(bridge.mode).toBe('online')
    expect(bridge.ctx.jobId).toBe('job-42')
    expect(bridge.ctx.sessionId).toBe('session-7')
    expect(bridge.ctx.palletId).toBe('pallet-1')
    expect(localStart).toHaveBeenCalledTimes(1)

    bridge.dispose()
  })

  it('falls back to a local-only offline demo when no runnable job exists', async () => {
    const bridge = new SimulatorOrchestrationBridge()
    await connectBridge(bridge)

    mockApi.getJobs.mockResolvedValue([jobDto({ status: 'Completed' })])

    const localStart = vi.fn()
    await bridge.start(pallet(), localStart)

    expect(mockApi.createJob).not.toHaveBeenCalled()
    expect(mockApi.claimJob).not.toHaveBeenCalled()
    expect(bridge.mode).toBe('offline')
    expect(bridge.ctx.jobId).toBeNull()
    expect(bridge.ctx.sessionId).toBeNull()
    expect(localStart).toHaveBeenCalledTimes(1)

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

  it('reports task status transitions for mapped pallet slots', async () => {
    const bridge = new SimulatorOrchestrationBridge()
    await connectBridge(bridge)

    mockApi.getJobs.mockResolvedValue([jobDto({ id: 'job-42', status: 'Created' })])
    mockApi.claimJob.mockResolvedValue({
      job: jobDto({ id: 'job-42', status: 'Running', simulationSessionId: 'session-7' }),
      session: sessionDto({ id: 'session-7', jobId: 'job-42' }),
      tasks: [
        taskDto({ id: 'task-a', palletId: 'pallet-1', slotRow: 0, slotColumn: 1 }),
        taskDto({ id: 'task-b', palletId: 'pallet-2', slotRow: 0, slotColumn: 0 }),
      ],
    } satisfies ClaimResultDto)

    const wf = fakeWorkflow()
    bridge.bindWorkflow(wf)

    await bridge.start(pallet('pallet-1'), () => {})

    // Slot selection starts the mapped task
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

    // Slot completion completes the mapped task
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

    mockApi.getJobs.mockResolvedValue([jobDto({ id: 'job-42', status: 'Created' })])
    mockApi.claimJob.mockResolvedValue({
      job: jobDto({ id: 'job-42', status: 'Running', simulationSessionId: 'session-7' }),
      session: sessionDto({ id: 'session-7', jobId: 'job-42' }),
      tasks: [],
    } satisfies ClaimResultDto)

    const wf = fakeWorkflow()
    bridge.bindWorkflow(wf)

    await bridge.start(pallet(), () => {})

    wf.onRunStateChanged?.('running')
    await vi.waitFor(() => {
      expect(mockApi.updateCurrentMachineState).toHaveBeenCalledWith(expect.objectContaining({
        simulationSessionId: 'session-7',
        simulatorId: 'test-simulator',
      }))
    })

    bridge.dispose()
  })

  it('sends heartbeats for the claimed session while online', async () => {
    vi.useFakeTimers()
    const bridge = new SimulatorOrchestrationBridge()
    await connectBridge(bridge)

    mockApi.getJobs.mockResolvedValue([jobDto({ id: 'job-42', status: 'Created' })])
    mockApi.claimJob.mockResolvedValue({
      job: jobDto({ id: 'job-42', status: 'Running', simulationSessionId: 'session-7' }),
      session: sessionDto({ id: 'session-7', jobId: 'job-42' }),
      tasks: [],
    } satisfies ClaimResultDto)

    await bridge.start(pallet(), () => {})
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
})
