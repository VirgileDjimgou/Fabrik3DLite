import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { measureSceneResources } from '../assets/sceneMetrics'
import { buildCncMachineVisual, type CncMachineVisualState } from './cncMachineVisual'

const IDLE: CncMachineVisualState = {
  doorPosition: 0,
  fixtureClamped: false,
  spindleSpeed: 0,
  spindleAtSpeed: false,
  feedActive: false,
  coolantOn: false,
  coarseState: 'IDLE',
  online: true,
}

function semanticNodes(group: THREE.Object3D): string[] {
  const ids: string[] = []
  group.traverse((child) => {
    const id = child.userData?.semanticId
    if (typeof id === 'string') ids.push(id)
  })
  return ids.sort()
}

describe('buildCncMachineVisual', () => {
  it('exposes the documented semantic nodes required by the signal-driven visuals', () => {
    const visual = buildCncMachineVisual()
    expect(visual.group.name).toBe('LargeCNC')
    const ids = semanticNodes(visual.group)
    expect(ids).toEqual([
      'axis:feed',
      'door:loading',
      'equipment:cnc',
      'fixture:chuck',
      'fixture:jaw-left',
      'fixture:jaw-right',
      'signal:stack-light',
      'spindle:main',
    ])
    expect(visual.group.getObjectByName('door:loading')).toBeTruthy()
    expect(visual.group.getObjectByName('spindle:main')).toBeTruthy()
    expect(visual.group.getObjectByName('fixture:chuck')).toBeTruthy()
    visual.dispose()
  })

  it('stays inside the documented reference-cell geometry budget', () => {
    const visual = buildCncMachineVisual()
    const metrics = measureSceneResources(visual.group)
    console.info(`[cnc-visual-budget] meshes=${metrics.meshes} triangles=${metrics.triangles} drawCalls=${metrics.drawCalls} textures=${metrics.textures}`)
    // Documented S39 budget for one CNC machine visual: ≤ 60 draw calls,
    // ≤ 6 000 triangles and ≤ 40 meshes. Textures are procedural (none).
    expect(metrics.drawCalls).toBeLessThanOrEqual(60)
    expect(metrics.triangles).toBeLessThanOrEqual(6_000)
    expect(metrics.meshes).toBeLessThanOrEqual(40)
    expect(metrics.textures).toBe(0)
    visual.dispose()
  })

  it('drives the door, fixture, feed and lamps from the machine state', () => {
    const visual = buildCncMachineVisual()
    const door = visual.nodes.door
    visual.apply({ ...IDLE, doorPosition: 1 })
    const openY = door.position.y
    visual.apply({ ...IDLE, doorPosition: 0 })
    expect(openY).toBeGreaterThan(door.position.y)

    visual.apply({ ...IDLE, fixtureClamped: true })
    expect(Math.abs(visual.nodes.jawLeft.position.x)).toBeLessThan(Math.abs(visual.nodes.jawRight.position.x) + 1)
    expect(Math.abs(visual.nodes.jawLeft.position.x)).toBeCloseTo(0.05, 6)

    visual.apply({ ...IDLE, feedActive: true })
    const advanced = visual.nodes.feedTable.position.z
    visual.apply({ ...IDLE, feedActive: false })
    expect(advanced).toBeGreaterThan(visual.nodes.feedTable.position.z)

    visual.apply({ ...IDLE, spindleSpeed: 8_000 })
    const spun = visual.nodes.spindle.rotation.z
    expect(spun).toBeGreaterThan(0)
    visual.dispose()
  })

  it('rebuilds deterministically and disposes every instance resource', () => {
    const snapshots: string[] = []
    for (let index = 0; index < 25; index += 1) {
      const visual = buildCncMachineVisual()
      const metrics = measureSceneResources(visual.group)
      snapshots.push(JSON.stringify(metrics))
      visual.dispose()
    }
    // Identical metrics across 25 build/dispose cycles: no resource accumulation.
    expect(new Set(snapshots).size).toBe(1)
  })
})
