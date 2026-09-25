import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import SignalInspectorPanel from './SignalInspectorPanel.vue'
import { createSingleConveyorEquipmentRegistry } from '../equipment/fixtures/singleConveyorCell'
import {
  ReferenceCellSignalBinding,
  REFERENCE_CELL_EQUIPMENT_IDS,
  createReferenceCellSignalRegistry,
  type ReferenceCellViews,
} from '../signals'
import type { SignalRegistry } from '../signals'
import { setSimulatorLocale } from '../i18n/simulator'

const FIXED_NOW = Date.parse('2026-01-01T08:00:00.000Z')

function createHarness(extraSignals = false): { registry: SignalRegistry; binding: ReferenceCellSignalBinding } {
  const clock = { ms: FIXED_NOW }
  const registry = createReferenceCellSignalRegistry(createSingleConveyorEquipmentRegistry(), { now: () => clock.ms })
  if (extraSignals) {
    registry.register({
      id: 'robot-1.Placeholder', equipmentId: 'robot-1', name: 'Placeholder', displayName: 'Placeholder',
      direction: 'internal', dataType: 'bool', writable: false, defaultValue: false,
    })
  }
  const views: ReferenceCellViews = {
    robot: {
      isServoOn: () => true,
      getWorkflowRunState: () => 'running',
      getWorkflowPhase: () => 'MACHINING',
      start: () => true,
      stop: () => true,
      reset: () => true,
    },
    cnc: {
      getState: () => 'MACHINING',
      getDoorState: () => 'closed',
      commandDoor: () => true,
      startCycle: () => true,
    },
    conveyor: {
      isRunning: () => true,
      getSpeedReference: () => 0.35,
      getActualSpeed: () => 0.35,
      getPhotoeyeIn: () => false,
      getPhotoeyeStation: () => true,
      getEncoderPulses: () => 4_210,
      setRunCommand: () => true,
      setSpeedReference: () => true,
    },
    safety: {
      isEmergencyStop: () => false,
      isGateClosed: () => true,
      isGateLocked: () => true,
      isLightCurtainClear: () => true,
      isScannerClear: () => true,
      isHealthy: () => true,
      reset: () => ({ accepted: true }),
    },
    faults: { isActiveFor: () => false },
  }
  const binding = new ReferenceCellSignalBinding({
    registry,
    equipment: REFERENCE_CELL_EQUIPMENT_IDS,
    views,
    now: () => clock.ms,
  })
  binding.tick()
  return { registry, binding }
}

function mountPanel(harness: { registry: SignalRegistry; binding: ReferenceCellSignalBinding }) {
  return mount(SignalInspectorPanel, {
    props: { registry: harness.registry, binding: harness.binding, refreshIntervalMs: 60_000 },
  })
}

afterEach(() => setSimulatorLocale('en'))

describe('SignalInspectorPanel', () => {
  it('renders every reference-cell signal with live values and quality', async () => {
    const harness = createHarness()
    const wrapper = mountPanel(harness)
    await nextTick()
    expect(wrapper.findAll('[data-signal-row]')).toHaveLength(54)
    expect(wrapper.find('[data-signal-value="robot-1.ProgramRunning"]').text()).toBe('true')
    expect(wrapper.find('[data-signal-value="cnc-1.SpindleSpeed"]').text()).toBe('8000')
    expect(wrapper.find('[data-signal-value="conveyor-1.EncoderPulse"]').text()).toBe('4210')
    expect(wrapper.find('[data-signal-quality="conveyor-1.ActualSpeed"]').text()).toBe('good')
    expect(wrapper.find('[data-signal-value="conveyor-1.ActualSpeed"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('filters by equipment and free-text search', async () => {
    const harness = createHarness()
    const wrapper = mountPanel(harness)
    await nextTick()

    await wrapper.find('[data-signal-equipment-filter]').setValue('cnc-1')
    expect(wrapper.findAll('[data-signal-row]')).toHaveLength(19)
    expect(wrapper.find('[data-signal-count]').text()).toBe('19 / 54')

    await wrapper.find('[data-signal-equipment-filter]').setValue('all')
    await wrapper.find('[data-signal-search]').setValue('Door')
    const ids = wrapper.findAll('[data-signal-row]').map((row) => row.attributes('data-signal-id'))
    expect(ids).toEqual(['cnc-1.DoorClosed', 'cnc-1.DoorCommand', 'cnc-1.DoorLocked', 'cnc-1.DoorOpen'])

    await wrapper.find('[data-signal-search]').setValue('no-such-signal')
    expect(wrapper.find('[data-signal-empty]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('surfaces binding diagnostics for unbound declared signals', async () => {
    const harness = createHarness(true)
    const wrapper = mountPanel(harness)
    await nextTick()
    expect(wrapper.find('[data-signal-diagnostics]').exists()).toBe(true)
    expect(wrapper.find('[data-signal-diagnostic="robot-1.Placeholder"]').text()).toContain('robot-1.Placeholder')
    wrapper.unmount()
  })

  it('localizes its own chrome without translating engineering signal ids', async () => {
    const harness = createHarness()
    const wrapper = mountPanel(harness)
    await nextTick()
    expect(wrapper.find('h4').text()).toBe('I/O signal monitor')

    setSimulatorLocale('fr')
    await nextTick()
    expect(wrapper.find('h4').text()).toBe('Moniteur de signaux E/S')
    expect(wrapper.find('[data-signal-id="cnc-1.DoorCommand"]').text()).toContain('cnc-1.DoorCommand')

    setSimulatorLocale('de')
    await nextTick()
    expect(wrapper.find('h4').text()).toBe('E/A-Signalmonitor')
    wrapper.unmount()
  })
})
