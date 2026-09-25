import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MappingStudio from './MappingStudio.vue'
import type { MappingApplyFeedback } from './MappingStudio.vue'
import { createSingleConveyorEquipmentRegistry } from '../equipment/fixtures/singleConveyorCell'
import {
  ReferenceCellSignalBinding,
  REFERENCE_CELL_EQUIPMENT_IDS,
  createReferenceCellSignalRegistry,
  type ReferenceCellViews,
} from '../signals'
import { createReferenceCellSampleMapping, type ConnectorHealth, type MappingFileV1 } from '../mapping'
import { setSimulatorLocale } from '../i18n/simulator'

const FIXED_NOW = Date.parse('2026-01-01T08:00:00.000Z')

const HEALTH: ConnectorHealth[] = [
  { protocol: 'opcua', state: 'Connected', healthy: true },
  { protocol: 'mqtt', state: 'Connected', healthy: true },
  { protocol: 'modbus', state: 'Degraded', healthy: false },
]

function createHarness() {
  const registry = createReferenceCellSignalRegistry(createSingleConveyorEquipmentRegistry(), { now: () => FIXED_NOW })
  const views: ReferenceCellViews = {
    robot: { isServoOn: () => true, getWorkflowRunState: () => 'running', getWorkflowPhase: () => 'MACHINING', start: () => true, stop: () => true, reset: () => true },
    cnc: { getState: () => 'MACHINING', getDoorState: () => 'closed', commandDoor: () => true, startCycle: () => true },
    conveyor: { isRunning: () => true, getSpeedReference: () => 0.35, getActualSpeed: () => 0.35, getPhotoeyeIn: () => false, getPhotoeyeStation: () => true, getEncoderPulses: () => 4_210, setRunCommand: () => true, setSpeedReference: () => true },
    safety: { isEmergencyStop: () => false, isGateClosed: () => true, isGateLocked: () => true, isLightCurtainClear: () => true, isScannerClear: () => true, isHealthy: () => true, reset: () => ({ accepted: true }) },
    faults: { isActiveFor: () => false },
  }
  const binding = new ReferenceCellSignalBinding({ registry, equipment: REFERENCE_CELL_EQUIPMENT_IDS, views, now: () => FIXED_NOW })
  binding.tick()
  return { registry }
}

function mountStudio(overrides: {
  file?: MappingFileV1
  applyHandler?: (file: MappingFileV1) => Promise<MappingApplyFeedback>
  health?: ConnectorHealth[]
} = {}) {
  const { registry } = createHarness()
  return mount(MappingStudio, {
    props: {
      registry,
      initialFile: overrides.file ?? createReferenceCellSampleMapping(),
      connectorHealth: overrides.health ?? HEALTH,
      applyHandler: overrides.applyHandler ?? (async () => ({ ok: true, message: 'ok' })),
      now: () => FIXED_NOW,
    },
  })
}

afterEach(() => setSimulatorLocale('en'))

describe('MappingStudio', () => {
  it('lists every mapping with protocol, target, direction and scaling', async () => {
    const wrapper = mountStudio()
    await nextTick()
    expect(wrapper.findAll('[data-mapping-row]')).toHaveLength(6)
    const row = wrapper.find('[data-mapping-row="modbus-cnc-feed-rate"]')
    expect(row.text()).toContain('holding-register@10')
    expect(row.text()).toContain('float')
    expect(wrapper.find('[data-mapping-connector="modbus-cnc-feed-rate"]').text()).toBe('Degraded')
    wrapper.unmount()
  })

  it('shows validation diagnostics and jumps to the offending row', async () => {
    const file = createReferenceCellSampleMapping()
    file.entries.find((entry) => entry.id === 'opcua-cnc-spindle-speed')!.direction = 'write'
    const wrapper = mountStudio({ file })
    await nextTick()
    expect(wrapper.find('[data-validation-panel]').exists()).toBe(true)
    const diagnostic = wrapper.find('[data-diagnostic="unwritable-write-direction"]')
    expect(diagnostic.exists()).toBe(true)
    await diagnostic.trigger('click')
    expect(wrapper.find('[data-mapping-row="opcua-cnc-spindle-speed"]').classes()).toContain('selected')
    wrapper.unmount()
  })

  it('disables apply while the mapping has errors', async () => {
    const file = createReferenceCellSampleMapping()
    file.entries.find((entry) => entry.id === 'opcua-robot-start')!.internalSignalId = 'robot-1.Unknown'
    const wrapper = mountStudio({ file })
    await nextTick()
    expect(wrapper.find('[data-action="apply"]').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('reports pending then success on apply', async () => {
    let resolveApply: ((feedback: MappingApplyFeedback) => void) | undefined
    const applyHandler = vi.fn(() => new Promise<MappingApplyFeedback>((resolve) => { resolveApply = resolve }))
    const wrapper = mountStudio({ applyHandler })
    await nextTick()
    await wrapper.find('[data-action="apply"]').trigger('click')
    expect(wrapper.find('[data-mapping-status]').text()).toContain('Applying')
    expect(wrapper.find('[data-action="apply"]').attributes('disabled')).toBeDefined()
    resolveApply?.({ ok: true, message: 'Applied 6 mapping(s).' })
    await flushPromises()
    await nextTick()
    expect(applyHandler).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-mapping-status]').text()).toContain('Applied 6 mapping(s).')
    expect(wrapper.find('[data-mapping-status]').classes()).toContain('status-ok')
    wrapper.unmount()
  })

  it('reports failure without applying partially', async () => {
    const applyHandler = vi.fn(async () => ({ ok: false, message: 'Connector disabled.' }))
    const wrapper = mountStudio({ applyHandler })
    await nextTick()
    await wrapper.find('[data-action="apply"]').trigger('click')
    await flushPromises()
    await nextTick()
    expect(wrapper.find('[data-mapping-status]').text()).toContain('Connector disabled.')
    expect(wrapper.find('[data-mapping-status]').classes()).toContain('status-bad')
    wrapper.unmount()
  })

  it('confirms destructive removal against the target', async () => {
    const wrapper = mountStudio()
    await nextTick()
    await wrapper.find('[data-mapping-remove="mqtt-conveyor-run-command"]').trigger('click')
    expect(wrapper.find('[data-remove-confirm]').text()).toContain('conveyor-1.RunCommand')
    await wrapper.find('[data-action="confirm-remove"]').trigger('click')
    await nextTick()
    expect(wrapper.find('[data-mapping-row="mqtt-conveyor-run-command"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-mapping-row]')).toHaveLength(5)
    wrapper.unmount()
  })

  it('filters the live monitor by equipment and protocol', async () => {
    const wrapper = mountStudio()
    await nextTick()
    await wrapper.find('[data-monitor-protocol]').setValue('mqtt')
    expect(wrapper.findAll('[data-monitor-row]')).toHaveLength(2)
    await wrapper.find('[data-monitor-protocol]').setValue('all')
    await wrapper.find('[data-monitor-equipment]').setValue('cnc-1')
    const rows = wrapper.findAll('[data-monitor-row]').map((row) => row.attributes('data-monitor-row'))
    expect(rows).toEqual(['modbus-cnc-cycle-start', 'modbus-cnc-feed-rate', 'opcua-cnc-spindle-speed'])
    await wrapper.find('[data-monitor-search]').setValue('SpindleSpeed')
    expect(wrapper.find('[data-monitor-count]').text()).toBe('1 / 6')
    wrapper.unmount()
  })

  it('marks unhealthy connector values stale instead of fabricating them', async () => {
    const wrapper = mountStudio()
    await nextTick()
    const row = wrapper.find('[data-monitor-row="modbus-cnc-feed-rate"]')
    expect(row.find('[data-monitor-external="modbus-cnc-feed-rate"]').text()).toBe('—')
    expect(row.find('[data-monitor-quality="modbus-cnc-feed-rate"]').text()).toBe('stale')
    wrapper.unmount()
  })

  it('localizes chrome while keeping canonical identifiers untranslated', async () => {
    const wrapper = mountStudio()
    await nextTick()
    expect(wrapper.find('h4').text()).toBe('Signal mapping studio')
    setSimulatorLocale('fr')
    await nextTick()
    expect(wrapper.find('h4').text()).toBe('Studio de mappage des signaux')
    expect(wrapper.find('[data-mapping-row="opcua-cnc-spindle-speed"]').text()).toContain('cnc-1.SpindleSpeed')
    setSimulatorLocale('de')
    await nextTick()
    expect(wrapper.find('h4').text()).toBe('Signal-Mapping-Studio')
    expect(wrapper.find('[data-mapping-row="modbus-cnc-feed-rate"]').text()).toContain('holding-register@10')
    wrapper.unmount()
  })
})
