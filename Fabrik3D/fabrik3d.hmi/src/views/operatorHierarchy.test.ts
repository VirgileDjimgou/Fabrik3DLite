import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import HomeView from './HomeView.vue'
import CurrentJobView from './CurrentJobView.vue'
import AlarmsView from './AlarmsView.vue'
import { i18n } from '@/i18n'
import * as api from '@/services/api'
import type { AlarmDto, JobDto, MachineStateDto, SimulationSessionDto, TaskDto } from '@/services/api'
import { useMachineState } from '@/composables/useMachineState'
import { useControlAuthority } from '@/composables/useControlAuthority'

vi.mock('@/services/api', () => ({
  getJobs: vi.fn(),
  getJobById: vi.fn(),
  getJobTasks: vi.fn(),
  getCurrentMachineState: vi.fn(),
  getSessionById: vi.fn(),
  getActiveAlarms: vi.fn(),
  getAlarms: vi.fn(),
  acknowledgeAlarm: vi.fn(),
  transitionAlarm: vi.fn(),
  getControlAuthority: vi.fn(),
}))

vi.mock('@/services/hub', () => ({
  subscribe: vi.fn(() => () => {}),
  connect: vi.fn().mockResolvedValue(undefined),
  getConnectionState: vi.fn(() => 'disconnected'),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))

const mockApi = vi.mocked(api)

function job(overrides: Partial<JobDto> = {}): JobDto {
  return {
    id: 'job-abcdef123456', name: 'Pallet run', description: 'Reference cell pallet',
    status: 'Running', machineMode: 'Automatic', progressPercent: 42,
    simulationSessionId: 'session-abcdef', dispatchState: 'Running',
    targetCellId: 'reference-cell', assignedSimulatorId: 'sim-abcdef',
    dispatchFailureReason: null,
    ...overrides,
  } as unknown as JobDto
}

function session(overrides: Partial<SimulationSessionDto> = {}): SimulationSessionDto {
  return {
    id: 'session-abcdef', jobId: 'job-abcdef123456', status: 'Running',
    startedAtUtc: '2026-10-01T08:00:00Z', endedAtUtc: null, isPaused: false,
    currentPhase: 'Machining', currentPalletId: 'pallet-1', currentTaskId: 'task-abcdef',
    currentPartId: null, machinedCount: 3, remainingCount: 5, totalCount: 8,
    lastHeartbeatUtc: '2026-10-01T08:05:00Z', simulatorId: 'sim-abcdef',
    correlationId: null, version: 1, scenarioId: 'pallet-processing',
    scenarioActivityId: null, scenarioProgress: 0, targetCellId: 'reference-cell',
    ...overrides,
  } as unknown as SimulationSessionDto
}

function machine(overrides: Partial<MachineStateDto> = {}): MachineStateDto {
  return {
    id: 'machine-1', simulationSessionId: 'session-abcdef', machineMode: 'Automatic',
    simulationStatus: 'Running', robotState: 'MOVING', cncState: 'MACHINING',
    currentPhase: 'Machining', currentPalletId: 'pallet-1', currentTaskId: 'task-abcdef',
    currentPartId: null, currentSlotRow: 0, currentSlotColumn: 1, isRunning: true,
    isPaused: false, lastUpdatedAtUtc: '2026-10-01T08:05:00Z',
    ...overrides,
  } as unknown as MachineStateDto
}

function alarm(overrides: Partial<AlarmDto> = {}): AlarmDto {
  return {
    id: 'alarm-1', code: 'ALM-001', title: 'Door open', message: 'Safety door is open',
    severity: 'Critical', source: 'safety', jobId: null, simulationSessionId: null,
    createdAtUtc: '2026-10-01T08:00:00Z', acknowledged: false, acknowledgedAtUtc: null,
    acknowledgedBy: null, lifecycleState: 'Active', firstOccurredAtUtc: '2026-10-01T08:00:00Z',
    lastOccurredAtUtc: '2026-10-01T08:01:00Z', occurrenceCount: 1,
    cause: 'Door', consequence: 'Stop', operatorGuidance: 'Close door', auditTrail: [],
    ...overrides,
  } as unknown as AlarmDto
}

const mountView = (component: unknown) => mount(component as never, {
  global: {
    plugins: [i18n],
    stubs: { RouterLink: { template: '<a data-testid="router-link"><slot /></a>' } },
  },
})

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.getControlAuthority.mockResolvedValue(undefined as never)
  useControlAuthority().authority.value = null
  useMachineState().machine.value = null
  useMachineState().currentJob.value = null
  useMachineState().session.value = null
})

describe('operator surface information hierarchy (S61)', () => {
  it('Overview ranks cell state, mode, authority, current job and progress above secondary detail', async () => {
    useMachineState().machine.value = machine()
    useMachineState().currentJob.value = job()
    useMachineState().session.value = session()

    const wrapper = mountView(HomeView)
    await flushPromises()

    const strip = wrapper.get('[data-testid="overview-status-strip"]')
    expect(strip.find('[data-testid="overview-cell-state"]').text()).toBe('Running')
    expect(strip.find('[data-testid="overview-mode"]').text()).toBe('Automatic')
    expect(strip.find('[data-testid="overview-authority"]').exists()).toBe(true)
    expect(strip.find('[data-testid="overview-current-job"]').text()).toBe('Pallet run')
    expect(strip.find('[data-testid="overview-progress"]').text()).toBe('42%')

    const secondary = wrapper.get('[data-testid="overview-secondary"]')
    expect(secondary.find('[data-testid="overview-robot-state"]').text()).toBe('MOVING')
    expect(secondary.find('[data-testid="overview-cnc-state"]').text()).toBe('MACHINING')
    expect(secondary.find('[data-testid="overview-parts"]').text()).toBe('3')
    expect(secondary.find('[data-testid="overview-cycle"]').exists()).toBe(true)

    // Primary actions are grouped and ranked above the secondary tiles.
    expect(wrapper.find('[data-testid="overview-primary-actions"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="overview-secondary-actions"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('Current Job ranks progress, task, pallet, scenario and elapsed in the primary strip', async () => {
    mockApi.getJobs.mockResolvedValue([job()])
    mockApi.getJobTasks.mockResolvedValue([{ id: 'task-abcdef', name: 'Slot R0 C1', sequenceOrder: 0, status: 'Running', partType: 'part', palletId: 'pallet-1', slotRow: 0, slotColumn: 1 } as unknown as TaskDto])
    mockApi.getCurrentMachineState.mockResolvedValue(machine())
    mockApi.getSessionById.mockResolvedValue(session())
    useMachineState().machine.value = machine()
    useMachineState().session.value = session()

    const wrapper = mountView(CurrentJobView)
    await flushPromises()

    const strip = wrapper.get('[data-testid="current-job-status-strip"]')
    expect(strip.find('[data-testid="current-job-progress"]').text()).toBe('42%')
    expect(strip.find('[data-testid="current-job-task"]').text()).toBe('Slot R0 C1')
    expect(strip.find('[data-testid="current-job-pallet"]').text()).toBe('pallet-1')
    expect(strip.find('[data-testid="current-job-scenario"]').text()).toBe('pallet-processing')
    expect(strip.find('[data-testid="current-job-elapsed"]').exists()).toBe(true)
    // Dispatch state and target cell remain visible in the identity card.
    expect(wrapper.find('[data-dispatch-state]').exists()).toBe(true)
    expect(wrapper.text()).toContain('reference-cell')
    wrapper.unmount()
  })

  it('Alarms ranks severity summary and exposes timestamp, severity, source, code, message, state and ACK', async () => {
    mockApi.getActiveAlarms.mockResolvedValue([
      alarm(),
      alarm({ id: 'alarm-2', code: 'ALM-002', title: 'Low air', severity: 'Warning', acknowledged: true, lifecycleState: 'ReturnedToNormal' }),
    ])

    const wrapper = mountView(AlarmsView)
    await flushPromises()

    const summary = wrapper.get('[data-testid="alarms-summary"]')
    expect(summary.find('[data-testid="alarms-critical-count"]').text()).toBe('1')
    expect(summary.find('[data-testid="alarms-warning-count"]').text()).toBe('1')
    expect(summary.find('[data-testid="alarms-unack-count"]').text()).toBe('1')

    const header = wrapper.get('thead').text()
    for (const label of ['Time', 'Severity', 'Source', 'Code', 'Message', 'State', 'Acknowledged']) {
      expect(header).toContain(label)
    }
    expect(wrapper.find('[data-testid="alarm-ack-alarm-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="alarm-ack-alarm-2"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
