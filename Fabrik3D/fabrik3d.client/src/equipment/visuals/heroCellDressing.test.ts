import { describe, expect, it } from 'vitest'
import { measureSceneResources } from '../assets/sceneMetrics'
import { buildHeroCellDressingFallback, disposeHeroCellDressing } from './heroCellDressing'

function semanticIds(root: import('three').Object3D): string[] {
  const ids: string[] = []
  root.traverse((child) => {
    if (typeof child.userData?.semanticId === 'string') ids.push(child.userData.semanticId)
  })
  return ids
}

describe('buildHeroCellDressingFallback', () => {
  it('exposes the documented dressing semantic nodes', () => {
    const group = buildHeroCellDressingFallback()
    const ids = semanticIds(group)
    expect(ids).toEqual(expect.arrayContaining([
      'motor:chip-conveyor',
      'fixture:buffer:1',
      'fixture:buffer:2',
      'signal:worklight:1',
      'signal:worklight:2',
      'anchor:buffer.access',
    ]))
    disposeHeroCellDressing(group)
  })

  it('stays inside the documented dressing geometry budget', () => {
    const group = buildHeroCellDressingFallback()
    const metrics = measureSceneResources(group)
    console.info(`[hero-dressing-budget] meshes=${metrics.meshes} triangles=${metrics.triangles} drawCalls=${metrics.drawCalls} textures=${metrics.textures}`)
    expect(metrics.triangles).toBeLessThanOrEqual(12_000)
    expect(metrics.drawCalls).toBeLessThanOrEqual(120)
    // S72: shared procedural surfaces are attached where the vocabulary declares them.
    expect(metrics.textures).toBeLessThanOrEqual(14)
    disposeHeroCellDressing(group)
  })

  it('rebuilds deterministically and disposes every instance resource', () => {
    const snapshots: string[] = []
    for (let index = 0; index < 25; index += 1) {
      const group = buildHeroCellDressingFallback()
      snapshots.push(JSON.stringify(measureSceneResources(group)))
      disposeHeroCellDressing(group)
    }
    expect(new Set(snapshots).size).toBe(1)
  })
})
