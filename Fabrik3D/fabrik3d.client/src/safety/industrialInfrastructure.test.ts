import { describe, expect, it } from 'vitest'
import { INDUSTRIAL_INFRASTRUCTURE_DEFINITIONS, infrastructureState, nearestInfrastructureAnchor } from './industrialInfrastructure'

describe('industrial infrastructure catalog', () => {
  it('declares collision proxies, placement anchors, and typed safety ports independently of visuals', () => {
    const gate = INDUSTRIAL_INFRASTRUCTURE_DEFINITIONS.find(definition => definition.id === 'interlocked-gate')!
    const cabinet = INDUSTRIAL_INFRASTRUCTURE_DEFINITIONS.find(definition => definition.id === 'plc-cabinet')!
    expect(gate.runtimeCapability).toBe('simulation-ready')
    expect(gate.ports).toContainEqual({ id: 'interlock', kind: 'safety', direction: 'output' })
    expect(gate.collisionProxy?.dimensionsMeters).toEqual(gate.dimensionsMeters)
    expect(gate.anchors?.[0]?.id).toBe('anchor:placement')
    expect(cabinet.runtimeCapability).toBe('static')
    expect(cabinet.ports).toEqual([])
  })

  it('snaps deterministically to the nearest declared industrial anchor', () => {
    expect(nearestInfrastructureAnchor({ x: .04, y: 0, z: 4.68 })?.id).toBe('anchor:fence.gate')
    expect(nearestInfrastructureAnchor({ x: 2, y: 0, z: 2 })).toBeNull()
  })

  it.each([
    ['IDLE', true, false, false, 'safe'],
    ['MACHINING', true, false, false, 'running'],
    ['IDLE', true, false, true, 'warning'],
    ['IDLE', true, true, false, 'fault'],
    ['IDLE', false, false, false, 'offline'],
  ] as const)('maps %s device state to visual %s', (cnc, online, estop, gate, expected) => {
    expect(infrastructureState(cnc, online, estop, gate)).toBe(expected)
  })
})
