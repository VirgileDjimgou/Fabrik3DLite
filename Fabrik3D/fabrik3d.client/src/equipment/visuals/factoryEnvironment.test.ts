import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { estimateSceneTextureMemory, measureSceneResources } from '../assets/sceneMetrics'
import { collectMaterialIds, isMaterialId } from './materialLibrary'
import { SURFACE_TEXTURE_BUDGET } from './proceduralSurfaces'
import {
  DEFAULT_FACTORY_ENVIRONMENT_SIZE,
  FACTORY_ENVIRONMENT_TEXTURES,
  buildFactoryEnvironment,
  disposeFactoryEnvironment,
  factoryEnvironmentDefinition,
  factoryEnvironmentMaterialIds,
} from './factoryEnvironment'

describe('S68/S72 coherent factory environment', () => {
  it('declares the coherent industrial-hall features and the procedural surfaces', () => {
    const group = buildFactoryEnvironment({ cellId: 'vision-sorting' })
    const definition = factoryEnvironmentDefinition(group)
    expect(definition).not.toBeNull()
    expect(definition!.kind).toBe('framework-factory-environment')
    expect(definition!.cellId).toBe('vision-sorting')
    expect(definition!.sizeMeters).toEqual(DEFAULT_FACTORY_ENVIRONMENT_SIZE)
    expect(definition!.features).toEqual(expect.arrayContaining([
      'industrial-floor',
      'expansion-joints',
      'safety-zone-perimeter',
      'operator-access-lane',
      'cable-tray',
      'cell-identifier',
    ]))
    // S72: the floor, markings and identifier plate carry generated surfaces.
    expect(definition!.textures.length).toBeGreaterThan(0)
    for (const surfaceId of definition!.textures) {
      expect(FACTORY_ENVIRONMENT_TEXTURES).toContain(surfaceId as never)
    }
    disposeFactoryEnvironment(group)
  })

  it('uses only the shared material vocabulary', () => {
    const group = buildFactoryEnvironment()
    const ids = collectMaterialIds(group)
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) expect(isMaterialId(id), id).toBe(true)
    const declared = factoryEnvironmentMaterialIds()
    for (const id of declared) expect(isMaterialId(id), id).toBe(true)
    for (const id of ids) expect(declared).toContain(id)
    disposeFactoryEnvironment(group)
  })

  it('marks a cell identifier plate with the bound cell id', () => {
    const group = buildFactoryEnvironment({ cellId: 'assembly-inspection' })
    const label = group.getObjectByName('env:cell-label')
    expect(label).toBeTruthy()
    expect(label!.userData.cellId).toBe('assembly-inspection')
    disposeFactoryEnvironment(group)
  })

  it('builds deterministically with bounded geometry', () => {
    const group = buildFactoryEnvironment({ cellId: 'robot-palletizing' })
    const first = measureSceneResources(group)
    const second = measureSceneResources(buildFactoryEnvironment({ cellId: 'robot-palletizing' }))
    const textureMemory = estimateSceneTextureMemory(group)
    console.info(`[factory-environment-budget] meshes=${first.meshes} triangles=${first.triangles} drawCalls=${first.drawCalls} textures=${first.textures} textureBytes=${textureMemory.estimatedBytes}`)
    expect(second).toEqual(first)
    expect(first.meshes).toBeGreaterThan(20)
    expect(first.meshes).toBeLessThan(200)
    expect(first.triangles).toBeLessThan(4_000)
    expect(first.drawCalls).toBeLessThan(200)
    // S72: the floor, markings and signage carry generated maps with non-zero
    // measured texture memory and stay inside the documented surface budget.
    expect(first.textures).toBeGreaterThan(0)
    expect(first.textures).toBeLessThanOrEqual(SURFACE_TEXTURE_BUDGET.maxTextureCount)
    expect(textureMemory.estimatedBytes).toBeGreaterThan(0)
    expect(textureMemory.estimatedBytes).toBeLessThanOrEqual(SURFACE_TEXTURE_BUDGET.maxEstimatedBytes)
    disposeFactoryEnvironment(group)
  })

  it('respects a requested floor size', () => {
    const group = buildFactoryEnvironment({ sizeMeters: { x: 20, z: 8 } })
    const definition = factoryEnvironmentDefinition(group)
    expect(definition!.sizeMeters).toEqual({ x: 20, z: 8 })
    const floor = group.getObjectByName('env:floor') as THREE.Mesh
    const bounds = new THREE.Box3().setFromObject(floor)
    expect(bounds.max.x - bounds.min.x).toBeCloseTo(20, 5)
    expect(bounds.max.z - bounds.min.z).toBeCloseTo(8, 5)
    disposeFactoryEnvironment(group)
  })

  it('trims markings for a training-lab variant but keeps a floor and perimeter', () => {
    const group = buildFactoryEnvironment({ variant: 'training-lab', cellId: 'training' })
    const definition = factoryEnvironmentDefinition(group)!
    expect(definition.features).toContain('industrial-floor')
    expect(definition.features).toContain('safety-zone-perimeter')
    expect(definition.features).not.toContain('operator-access-lane')
    expect(definition.features).not.toContain('cable-tray')
    expect(collectMaterialIds(group)).toContain('concrete-floor')
    disposeFactoryEnvironment(group)
  })

  it('disposes deterministically across repeated builds', () => {
    const snapshots: string[] = []
    for (let index = 0; index < 10; index += 1) {
      const group = buildFactoryEnvironment()
      snapshots.push(JSON.stringify(measureSceneResources(group)))
      disposeFactoryEnvironment(group)
    }
    expect(new Set(snapshots).size).toBe(1)
  })

  it('instances repeated static elements to keep draw calls bounded (S75)', () => {
    const group = buildFactoryEnvironment({ cellId: 'vision-sorting' })
    const instancedNames = ['env:joint-x', 'env:joint-z', 'env:access-lane-tick', 'env:cable-tray-rung']
    for (const name of instancedNames) {
      const object = group.getObjectByName(name)
      expect(object, name).toBeInstanceOf(THREE.InstancedMesh)
      expect((object as THREE.InstancedMesh).count).toBeGreaterThan(0)
    }
    // The repeated families are one draw call each, not one per element.
    const metrics = measureSceneResources(group)
    expect(metrics.drawCalls).toBeLessThan(120)
    disposeFactoryEnvironment(group)
  })

  it('adds human-scale dressing props with shared materials (S75)', () => {
    const group = buildFactoryEnvironment({ cellId: 'robot-palletizing' })
    const definition = factoryEnvironmentDefinition(group)!
    expect(definition.features).toContain('human-scale-dressing')
    for (const name of [
      'env:dressing:mannequin-a',
      'env:dressing:mannequin-b',
      'env:dressing:cabinet',
      'env:dressing:extinguisher',
      'env:dressing:signage-hazard',
      'env:dressing:signage-clear',
      'env:dressing:pipe',
    ]) {
      expect(group.getObjectByName(name), name).toBeTruthy()
    }
    // A mannequin is human-scale: roughly 1.75 m tall.
    const mannequin = group.getObjectByName('env:dressing:mannequin-a')!
    const bounds = new THREE.Box3().setFromObject(mannequin)
    expect(bounds.max.y - bounds.min.y).toBeGreaterThan(1.5)
    expect(bounds.max.y - bounds.min.y).toBeLessThan(2.0)
    disposeFactoryEnvironment(group)
  })

  it('can omit the dressing props without changing the core environment', () => {
    const group = buildFactoryEnvironment({ includeDressing: false })
    const definition = factoryEnvironmentDefinition(group)!
    expect(definition.features).not.toContain('human-scale-dressing')
    expect(group.getObjectByName('env:dressing:mannequin-a')).toBeFalsy()
    expect(definition.features).toContain('industrial-floor')
    disposeFactoryEnvironment(group)
  })
})
