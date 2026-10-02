import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RobotPositionsView from './RobotPositionsView.vue'
import { i18n } from '@/i18n'
import * as api from '@/services/api'
import type { ControlAuthorityDto, RobotPositionsDto } from '@/services/api'
import { useControlAuthority } from '@/composables/useControlAuthority'
import { useOperatingMode } from '@/composables/useOperatingMode'

vi.mock('@/services/api', () => ({
  getRobotPositions: vi.fn(),
  issueJog: vi.fn(),
  getControlAuthority: vi.fn(),
}))

vi.mock('@/services/hub', () => ({
  subscribe: vi.fn(() => () => {}),
  connect: vi.fn().mockResolvedValue(undefined),
  getConnectionState: vi.fn(() => 'disconnected'),
}))

const mockApi = vi.mocked(api)

function positions(overrides: Partial<RobotPositionsDto> = {}): RobotPositionsDto {
  return {
    cellId: 'reference-cell',
    robotId: 'robot-1',
    robotModel: 'medium-6axis',
    joints: [0, 1, 2, 3, 4, 5].map((i) => ({ index: i, name: `J${i + 1}`, angleRadians: i / 10, minRadians: -Math.PI, maxRadians: Math.PI })),
    tcp: { x: 0.4, y: 0.1, z: 0.5, rx: 0.01, ry: 0.02, rz: 0.03 },
    frames: { baseFrame: 'world', toolFrame: 'flange', workObjectFrame: 'workobject-1', currentToolId: 'tool-1' },
    motionStatus: 'IDLE',
    operatingMode: 'manual-training',
    controlAuthorityMode: 'external-controller',
    controlAuthorityState: 'held',
    controlAuthorityOwnerId: 'operator-1',
    isStale: false,
    publishedAtUtc: '2026-10-01T08:00:00Z',
    units: 'radians, meters',
    schemaVersion: 1,
    ...overrides,
  }
}

function heldAuthority(): ControlAuthorityDto {
  return {
    scope: 'reference-cell', mode: 'external-controller', state: 'held', ownerId: 'operator-1', ownerKind: 'simulator',
    acquiredAtUtc: '2026-10-01T08:00:00Z', leaseExpiresAtUtc: null, lastHeartbeatUtc: null, version: 1,
    degradedReason: null, correlationId: null, isPersisted: true, diagnostic: null,
  }
}

function mountView() {
  return mount(RobotPositionsView, { global: { plugins: [i18n] } })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.getControlAuthority.mockResolvedValue(heldAuthority())
  mockApi.issueJog.mockResolvedValue({
    cellId: 'reference-cell', robotId: 'robot-1', action: 'press', joint: 'J1', direction: 1,
    state: 'accepted', reason: null, correlationId: 'c1', issuedAtUtc: '2026-10-01T08:00:00Z',
  })
  useControlAuthority().authority.value = heldAuthority()
})

describe('RobotPositionsView', () => {
  it('renders authoritative joints, TCP, frames, status and units', async () => {
    mockApi.getRobotPositions.mockResolvedValue(positions())
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get('[data-testid="robot-target"]').text()).toContain('reference-cell')
    expect(wrapper.get('[data-testid="robot-units"]').text()).toBe('radians, meters')
    expect(wrapper.get('[data-testid="robot-state"]').text()).toBe('IDLE')
    expect(wrapper.get('[data-testid="robot-joint-J1"]').text()).toContain('0.000')
    expect(wrapper.get('[data-testid="robot-tcp"]').text()).toContain('X 0.400')
    expect(wrapper.get('[data-testid="robot-orientation"]').text()).toContain('Rz 0.030')
    expect(wrapper.text()).toContain('tool-1')
    expect(wrapper.get('[data-testid="robot-authority"]').text().length).toBeGreaterThan(0)
    wrapper.unmount()
  })

  it('presents the compact teach-pendant hierarchy with state, authority, frames and jog', async () => {
    mockApi.getRobotPositions.mockResolvedValue(positions())
    const wrapper = mountView()
    await flushPromises()

    // Primary strip ranks state, authority, mode, model and units.
    const strip = wrapper.get('[data-testid="robot-status-strip"]')
    expect(strip.find('[data-testid="robot-state"]').exists()).toBe(true)
    expect(strip.find('[data-testid="robot-authority"]').exists()).toBe(true)
    expect(strip.find('[data-testid="robot-mode"]').exists()).toBe(true)
    expect(strip.find('[data-testid="robot-model"]').exists()).toBe(true)
    expect(strip.find('[data-testid="robot-units"]').exists()).toBe(true)
    // J1-J6, TCP, frames/tool and manual jog remain present.
    for (const joint of ['J1', 'J2', 'J3', 'J4', 'J5', 'J6']) {
      expect(wrapper.find(`[data-testid="robot-joint-${joint}"]`).exists()).toBe(true)
    }
    expect(wrapper.find('[data-testid="robot-tcp"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="robot-jog"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="robot-jog-J1-plus"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('shows a bounded unavailable state when no simulator ever published', async () => {
    mockApi.getRobotPositions.mockRejectedValue({ status: 404 })
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-testid="robot-positions"]').text().length).toBeGreaterThan(0)
    expect(wrapper.find('[data-testid="robot-jog"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('unavailable')
    wrapper.unmount()
  })

  it('shows an offline state and disables jog when the orchestrator is unreachable', async () => {
    mockApi.getRobotPositions.mockRejectedValue(new Error('network'))
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-testid="robot-jog"]').exists()).toBe(false)
    expect(wrapper.find('.hmi-error').exists()).toBe(true)
    expect(wrapper.text()).toContain('Orchestrator unreachable')
    wrapper.unmount()
  })

  it('marks stale telemetry and disables the jog controls', async () => {
    mockApi.getRobotPositions.mockResolvedValue(positions({ isStale: true }))
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-testid="robot-stale"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="robot-jog-J1-plus"]').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('blocks jog until manual-training mode is enabled through the confirmation dialog', async () => {
    useOperatingMode().transition('automatic')
    mockApi.getRobotPositions.mockResolvedValue(positions())
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get('[data-testid="robot-jog-J1-plus"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="robot-jog-blocked"]').exists()).toBe(true)

    await wrapper.get('[data-testid="robot-enable-jog"]').trigger('click')
    const dialog = wrapper.find('[role="dialog"]')
    expect(dialog.exists()).toBe(true)
    expect(dialog.get('[data-testid="confirm-target"]').text()).toContain('reference-cell')

    await wrapper.get('[role="dialog"] .btn-hmi').trigger('click')
    await flushPromises()
    expect(useOperatingMode().mode.value).toBe('manual-training')
    expect(wrapper.get('[data-testid="robot-jog-J1-plus"]').attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  it('issues a dead-man jog press and reports success feedback', async () => {
    useOperatingMode().transition('manual-training')
    mockApi.getRobotPositions.mockResolvedValue(positions())
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[data-testid="robot-jog-J1-plus"]').trigger('pointerdown')
    await flushPromises()

    expect(mockApi.issueJog).toHaveBeenCalledWith('reference-cell', 'robot-1', expect.objectContaining({
      action: 'press', joint: 'J1', direction: 1, mode: 'manual-training',
    }))
    const deadManValue = mockApi.issueJog.mock.calls[0]![2].deadManToken
    expect(typeof deadManValue).toBe('string')
    expect((deadManValue ?? '').length).toBeGreaterThan(0)
    expect(wrapper.get('[data-testid="robot-jog-feedback"]').text()).toContain('accepted')
    wrapper.unmount()
  })
})
