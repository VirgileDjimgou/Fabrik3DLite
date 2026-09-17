import { describe, expect, it } from 'vitest'
import { createSingleConveyorEquipmentRegistry, SINGLE_CONVEYOR_CELL } from './singleConveyorCell'

describe('single conveyor cell compatibility fixture', () => {
  it('loads the existing robot, CNC, conveyor and pallet station through the SDK', () => {
    const registry = createSingleConveyorEquipmentRegistry()

    expect(registry.getInstances()).toHaveLength(SINGLE_CONVEYOR_CELL.equipment.length)
    expect(registry.findInstancesByCapability('pick-place')[0]?.id).toBe('robot-1')
    expect(registry.findInstancesByCapability('machining')[0]?.id).toBe('cnc-1')
    expect(registry.findInstancesByCapability('pallet-feed')[0]?.id).toBe('conveyor-1')
  })
})
