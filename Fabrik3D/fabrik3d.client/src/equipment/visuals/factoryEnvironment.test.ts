import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { measureSceneResources } from '../assets/sceneMetrics'
import { collectMaterialIds, isMaterialId } from './materialLibrary'
import {
  DEFAULT_FACTORY_ENVIRONMENT_SIZE,
  FACTORY_ENVIRONMENT_TEXTURES,
  buildFactoryEnvironment,
  disposeFactoryEnvironment,
  factoryEnvironmentDefinition,
  factoryEnvironmentMaterialIds,
} from './factoryEnvironment'

describe('S68 coherent factory environment', () => {
  it('declares the coherent industrial-hall features and is texture-free', () => {
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
    expect(definition!.textures).toEqual([...FACTORY_ENVIRONMENT_TEXTURES])
    expect(definition!.textures).toEqual([])
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
    const first = measureSceneResources(buildFactoryEnvironment({ cellId: 'robot-palletizing' }))
    const second = measureSceneResources(buildFactoryEnvironment({ cellId: 'robot-palletizing' }))
    console.info(`[factory-environment-budget] meshes=${first.meshes} triangles=${first.triangles} drawCalls=${first.drawCalls} textures=${first.textures}`)
    expect(second).toEqual(first)
    expect(first.meshes).toBeGreaterThan(20)
    expect(first.meshes).toBeLessThan(200)
    expect(first.triangles).toBeLessThan(4_000)
    expect(first.drawCalls).toBeLessThan(200)
    expect(first.textures).toBe(0)
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
})
