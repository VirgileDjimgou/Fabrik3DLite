import { describe, expect, it } from 'vitest'
import { EquipmentRegistry, validateEquipmentDefinition } from '../equipment/EquipmentRegistry'
import { createSingleConveyorEquipmentRegistry, SINGLE_CONVEYOR_EQUIPMENT_DEFINITIONS } from '../equipment/fixtures/singleConveyorCell'
import { EQUIPMENT_SDK_VERSION, type EquipmentDefinition, type EquipmentSignalDeclaration } from '../equipment/types'
import { registerEquipmentSignals, signalDefinitionsForEquipment } from './equipmentBinding'
import { SignalRegistry } from './SignalRegistry'

const servoOn: EquipmentSignalDeclaration = {
  name: 'ServoOn',
  displayName: 'Servo on',
  direction: 'output-from-controller',
  dataType: 'bool',
  writable: true,
  defaultValue: false,
  semanticCategory: 'command',
}

const atHome: EquipmentSignalDeclaration = {
  name: 'AtHome',
  displayName: 'At home',
  direction: 'input-to-controller',
  dataType: 'bool',
  defaultValue: false,
  semanticCategory: 'status',
}

const spindleSpeed: EquipmentSignalDeclaration = {
  name: 'SpindleSpeed',
  displayName: 'Spindle speed',
  direction: 'telemetry-only',
  dataType: 'float',
  min: 0,
  max: 24_000,
  engineeringUnit: 'rpm',
  defaultValue: 0,
}

function robotDefinition(): EquipmentDefinition {
  return {
    sdkVersion: EQUIPMENT_SDK_VERSION,
    id: 'robot-1',
    category: 'robot',
    capabilities: [],
    ports: [],
    runtimeCapability: 'simulation-ready',
    signals: [servoOn, atHome, spindleSpeed],
  }
}

describe('equipment signal binding', () => {
  it('derives stable ids and read-only defaults', () => {
    const definitions = signalDefinitionsForEquipment(robotDefinition())
    expect(definitions.map((item) => item.id)).toEqual(['robot-1.ServoOn', 'robot-1.AtHome', 'robot-1.SpindleSpeed'])
    expect(definitions[0]).toMatchObject({ equipmentId: 'robot-1', writable: true, dataType: 'bool', semanticCategory: 'command' })
    expect(definitions[1]).toMatchObject({ writable: false, engineeringUnit: undefined })
    expect(definitions[2]).toMatchObject({ engineeringUnit: 'rpm', min: 0, max: 24_000 })
  })

  it('registers declared signals into a signal registry', () => {
    const signals = new SignalRegistry()
    const registered = registerEquipmentSignals(signals, robotDefinition())
    expect(registered).toHaveLength(3)
    expect(signals.getDefinitionsByEquipment('robot-1').map((item) => item.id)).toEqual([
      'robot-1.AtHome',
      'robot-1.ServoOn',
      'robot-1.SpindleSpeed',
    ])
  })

  it('rejects duplicate or invalid declarations at equipment registration', () => {
    const registry = new EquipmentRegistry()
    const duplicate = robotDefinition()
    duplicate.signals = [{ ...servoOn }, { ...servoOn, displayName: 'Duplicate' }]
    expect(() => registry.registerDefinition(duplicate)).toThrow(/duplicate signal 'ServoOn'/)

    const invalid = robotDefinition()
    invalid.signals = [{ name: 'Bad', displayName: 'Bad', direction: 'input-to-controller', dataType: 'float', min: 10, max: 1, defaultValue: 5 }]
    expect(() => registry.registerDefinition(invalid)).toThrow(/invalid signal 'Bad'/)
  })

  it('keeps every existing reference-cell definition valid', () => {
    const registry = createSingleConveyorEquipmentRegistry()
    expect(registry.getInstances()).toHaveLength(5)
    for (const definition of SINGLE_CONVEYOR_EQUIPMENT_DEFINITIONS) {
      expect(() => validateEquipmentDefinition(definition)).not.toThrow()
    }
  })
})
