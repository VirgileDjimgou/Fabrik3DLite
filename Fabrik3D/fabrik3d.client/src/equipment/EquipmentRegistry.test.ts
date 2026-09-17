import { describe, expect, it } from 'vitest'
import { EquipmentRegistry, validateEquipmentDefinition } from './EquipmentRegistry'
import { createTransform } from './transforms'
import { EQUIPMENT_SDK_VERSION, type EquipmentDefinition } from './types'

const robotDefinition: EquipmentDefinition = {
  sdkVersion: EQUIPMENT_SDK_VERSION,
  id: 'test-robot',
  category: 'robot',
  capabilities: [{ id: 'pick-place', description: 'Moves parts.' }],
  ports: [{ id: 'flange', kind: 'material', direction: 'bidirectional' }],
}

describe('EquipmentRegistry', () => {
  it('registers equipment and queries capabilities without scene knowledge', () => {
    const registry = new EquipmentRegistry()
    registry.registerDefinition(robotDefinition)
    registry.registerInstance({ id: 'robot-1', definitionId: robotDefinition.id, transform: createTransform({ x: 0, y: 0, z: 0 }) })

    expect(registry.findInstancesByCapability('pick-place').map((entry) => entry.id)).toEqual(['robot-1'])
  })

  it('rejects invalid definitions and unknown instance definitions', () => {
    expect(() => validateEquipmentDefinition({ ...robotDefinition, ports: [{ ...robotDefinition.ports[0]!, id: '' }] })).toThrow('without id')
    expect(() => new EquipmentRegistry().registerInstance({ id: 'orphan', definitionId: 'missing', transform: createTransform({ x: 0, y: 0, z: 0 }) })).toThrow('unknown definition')
  })
})
