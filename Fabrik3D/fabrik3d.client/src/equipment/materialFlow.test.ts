import { describe, expect, it } from 'vitest'
import { BinaryActuatorRuntime, BinarySensorRuntime, ConveyorRuntime, MATERIAL_FLOW_EQUIPMENT_DEFINITIONS, anchorWorldPosition, compatiblePorts, isToolPayloadCompatible, nearestCompatibleAnchor, validateConnections } from './materialFlow'
import { createTransform } from './transforms'

describe('material flow library', () => {
  it('declares compatible material ports and rejects reversed connections', () => {
    const conveyor = MATERIAL_FLOW_EQUIPMENT_DEFINITIONS.find(item => item.id === 'straight-conveyor')!
    expect(compatiblePorts(conveyor.ports[1]!, conveyor.ports[0]!)).toBe(true)
    expect(compatiblePorts(conveyor.ports[0]!, conveyor.ports[1]!)).toBe(false)
  })
  it('transfers deterministically and exposes sensor and actuator transitions', () => {
    const conveyor = new ConveyorRuntime('line', 2, .5)
    expect(conveyor.tick(1)).toBe(.5); expect(conveyor.tick(10)).toBe(2)
    const sensor = new BinarySensorRuntime('photoeye'); expect(sensor.setDetected(true)).toBe(true); expect(sensor.setDetected(true)).toBe(false)
    const actuator = new BinaryActuatorRuntime('stop'); actuator.command(true); expect(actuator.getRuntimeState().values?.extended).toBe(true)
  })
  it('checks tool payload and malformed connections', () => {
    expect(isToolPayloadCompatible(8, 12)).toBe(true); expect(isToolPayloadCompatible(13, 12)).toBe(false)
    const errors = validateConnections([{ id: 'bad', fromEquipmentId: 'a', fromPortId: 'missing', toEquipmentId: 'b', toPortId: 'material-in', kind: 'material' }], MATERIAL_FLOW_EQUIPMENT_DEFINITIONS, new Map([['a', 'straight-conveyor'], ['b', 'straight-conveyor']]))
    expect(errors).toContain("Connection 'bad' references an unknown port.")
  })
  it('transforms and snaps semantic anchors without a visual mesh', () => {
    const anchors = MATERIAL_FLOW_EQUIPMENT_DEFINITIONS.find(item => item.id === 'straight-conveyor')!.anchors!
    const transform = createTransform({ x: 1, y: 0, z: 2 }, { x: 0, y: Math.PI / 2, z: 0 })
    const world = anchorWorldPosition(anchors.find(anchor => anchor.id === 'anchor:out')!, transform)
    expect(world.x).toBeCloseTo(1); expect(world.z).toBeCloseTo(3)
    expect(nearestCompatibleAnchor(world, anchors, transform)?.id).toBe('anchor:out')
  })
})
