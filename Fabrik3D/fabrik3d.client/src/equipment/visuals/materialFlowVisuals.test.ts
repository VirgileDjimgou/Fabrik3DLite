import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  GENERIC_EQUIPMENT_CLASS,
  KNOWN_EQUIPMENT_CLASSES,
  createMaterialFlowVisual,
  dimensionsFor,
  registerMaterialFlowProceduralAssets,
  resolveEquipmentAssetId,
} from './materialFlowVisuals'
import { EquipmentAssetRegistry } from '../assets/registry'
import { measureSceneResources } from '../assets/sceneMetrics'

describe('S58 procedural scenario visuals', () => {
  it('builds a deterministic mesh for every known equipment class', () => {
    expect(KNOWN_EQUIPMENT_CLASSES.length).toBeGreaterThan(20)
    for (const definitionId of KNOWN_EQUIPMENT_CLASSES) {
      const root = createMaterialFlowVisual(definitionId)
      expect(root.userData.known, definitionId).toBe(true)
      expect(root.userData.definitionId).toBe(definitionId)
      const first = measureSceneResources(root)
      const second = measureSceneResources(createMaterialFlowVisual(definitionId))
      expect(second, definitionId).toEqual(first)
      expect(first.meshes, definitionId).toBeGreaterThan(0)
      expect(first.triangles, definitionId).toBeGreaterThan(0)
      root.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          expect(Number.isFinite(child.geometry.getAttribute('position')?.count ?? Number.NaN)).toBe(true)
        }
      })
    }
  })

  it('seats visuals on the floor using declared dimensions', () => {
    const root = createMaterialFlowVisual('plc-cabinet')
    expect(dimensionsFor('plc-cabinet')).toEqual({ x: 1, y: 2, z: 0.5 })
    const box = new THREE.Box3().setFromObject(root)
    expect(box.min.y).toBeGreaterThanOrEqual(-0.001)
    expect(box.max.y).toBeCloseTo(2, 5)
  })

  it('falls back to a generic block with a diagnostic for an unknown class', () => {
    const root = createMaterialFlowVisual('not-a-real-class')
    expect(root.userData.known).toBe(false)
    expect(String(root.userData.diagnostic)).toContain('not-a-real-class')
    expect(measureSceneResources(root).meshes).toBeGreaterThan(0)
  })

  it('maps classes to shared procedural assets and registers them idempotently', () => {
    const registry = new EquipmentAssetRegistry()
    registerMaterialFlowProceduralAssets(registry)
    registerMaterialFlowProceduralAssets(registry)
    expect(registry.has(resolveEquipmentAssetId('straight-conveyor'))).toBe(true)
    expect(registry.has(resolveEquipmentAssetId('fanuc-like-6axis'))).toBe(true)
    expect(registry.get(resolveEquipmentAssetId('euro-pallet')).source).toBe('procedural')
    expect(resolveEquipmentAssetId('not-a-real-class')).toBe(`${resolveEquipmentAssetId(GENERIC_EQUIPMENT_CLASS)}`)
  })
})
