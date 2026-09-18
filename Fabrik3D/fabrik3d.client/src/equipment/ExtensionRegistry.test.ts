import { describe, expect, it } from 'vitest'
import { EquipmentExtensionRegistry } from './ExtensionRegistry'
import { EQUIPMENT_SDK_VERSION, type EquipmentDefinition } from './types'

const definition: EquipmentDefinition = { sdkVersion: EQUIPMENT_SDK_VERSION, id: 'visual-only-demo', category: 'infrastructure', capabilities: [], ports: [], runtimeCapability: 'static' }
describe('EquipmentExtensionRegistry', () => {
  it('allows a visual-only extension and rejects simulation without trusted code', () => {
    const registry = new EquipmentExtensionRegistry()
    registry.register({ definition, visual: { id: 'demo-visual', source: 'procedural', description: 'Demo visual.' } })
    expect(registry.get('visual-only-demo').visual.id).toBe('demo-visual')
    expect(() => registry.register({ definition: { ...definition, id: 'smart-demo', runtimeCapability: 'simulation-ready' }, visual: { id: 'smart-visual', source: 'procedural', description: 'Smart visual.' } })).toThrow('trusted runtime adapter')
  })
})
