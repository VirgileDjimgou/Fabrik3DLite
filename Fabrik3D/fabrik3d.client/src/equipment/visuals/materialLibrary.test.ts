import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  MATERIAL_DEFINITIONS,
  MATERIAL_IDS,
  MATERIAL_SURFACE_BINDINGS,
  MATERIAL_TEXTURES,
  REQUIRED_MATERIAL_VOCABULARY,
  collectMaterialIds,
  createMaterial,
  createMaterialPack,
  isMaterialId,
  materialDefinition,
  validateMaterialLibrary,
} from './materialLibrary'
import {
  SURFACE_TEXTURE_BUDGET,
  clearSurfaceTextureCache,
  isSurfaceId,
} from './proceduralSurfaces'
import { measureSceneResources } from '../assets/sceneMetrics'

describe('S68 shared PBR material library', () => {
  it('is structurally consistent', () => {
    expect(validateMaterialLibrary()).toEqual([])
    expect(MATERIAL_IDS.length).toBeGreaterThanOrEqual(20)
    expect(new Set(MATERIAL_IDS).size).toBe(MATERIAL_IDS.length)
  })

  it('declares the S68 brief vocabulary', () => {
    for (const id of REQUIRED_MATERIAL_VOCABULARY) {
      expect(isMaterialId(id), id).toBe(true)
      expect(MATERIAL_DEFINITIONS[id]).toBeDefined()
    }
  })

  it('records provenance and a license for every material', () => {
    for (const id of MATERIAL_IDS) {
      const definition = materialDefinition(id)
      expect(definition.provenance.source.length, id).toBeGreaterThan(0)
      expect(definition.provenance.license.length, id).toBeGreaterThan(0)
      expect(definition.usage.length, id).toBeGreaterThan(0)
    }
  })

  it('declares a bounded, well-provenanced procedural texture registry (S72)', () => {
    expect(MATERIAL_TEXTURES.length).toBeGreaterThan(0)
    expect(MATERIAL_TEXTURES.length).toBeLessThanOrEqual(SURFACE_TEXTURE_BUDGET.maxTextureCount)
    let estimatedBytes = 0
    for (const texture of MATERIAL_TEXTURES) {
      expect(isSurfaceId(texture.id), texture.id).toBe(true)
      expect(texture.resolution, texture.id).toMatch(/^\d+x\d+$/)
      expect(texture.estimatedBytes, texture.id).toBeGreaterThan(0)
      expect(texture.source.length, texture.id).toBeGreaterThan(0)
      expect(texture.license.length, texture.id).toBeGreaterThan(0)
      estimatedBytes += texture.estimatedBytes
    }
    expect(estimatedBytes).toBeLessThanOrEqual(SURFACE_TEXTURE_BUDGET.maxEstimatedBytes)
    for (const id of MATERIAL_IDS) {
      const binding = MATERIAL_SURFACE_BINDINGS[id]
      if (!binding) continue
      for (const surfaceId of [binding.map, binding.roughnessMap, binding.normalMap]) {
        if (surfaceId) expect(isSurfaceId(surfaceId), `${id}: ${surfaceId}`).toBe(true)
      }
    }
  })

  it('attaches only the declared procedural surfaces and keeps other materials flat', () => {
    clearSurfaceTextureCache()
    for (const id of MATERIAL_IDS) {
      const binding = MATERIAL_SURFACE_BINDINGS[id]
      const material = createMaterial(id)
      if (binding?.map) expect(material.map, `${id}.map`).not.toBeNull()
      else expect(material.map, `${id}.map`).toBeNull()
      if (binding?.roughnessMap) expect(material.roughnessMap, `${id}.roughnessMap`).not.toBeNull()
      else expect(material.roughnessMap, `${id}.roughnessMap`).toBeNull()
      if (binding?.normalMap) expect(material.normalMap, `${id}.normalMap`).not.toBeNull()
      else expect(material.normalMap, `${id}.normalMap`).toBeNull()
      expect(material.name).toBe(id)
      expect(material.userData.materialId).toBe(id)
      expect(material.userData.visualOnly).toBe(true)
      material.dispose()
    }
    clearSurfaceTextureCache()
  })

  it('shares one cached texture instance across materials that declare the same surface', () => {
    clearSurfaceTextureCache()
    const first = createMaterial('painted-steel')
    const second = createMaterial('machine-body')
    expect(first.map).toBe(second.map)
    first.dispose()
    second.dispose()
    clearSurfaceTextureCache()
  })

  it('supports an explicitly untextured material variant', () => {
    const material = createMaterial('painted-floor', { textures: false })
    expect(material.map).toBeNull()
    expect(material.roughnessMap).toBeNull()
    material.dispose()
  })

  it('treats authored colors as sRGB through three.js color management', () => {
    expect(THREE.ColorManagement.enabled).toBe(true)
    const material = createMaterial('painted-steel')
    // The authored hex is preserved as an sRGB value; three converts it to the
    // renderer working space internally without changing the source of truth.
    expect(material.color.getHex(THREE.SRGBColorSpace)).toBe(MATERIAL_DEFINITIONS['painted-steel'].color)
    material.dispose()
  })

  it('creates independent materials and accepts explicit overrides', () => {
    const first = createMaterial('safety-yellow')
    const second = createMaterial('safety-yellow')
    expect(first).not.toBe(second)
    const overridden = createMaterial('glass', { opacity: 0.7, transparent: true })
    expect(overridden.opacity).toBe(0.7)
    expect(overridden.transparent).toBe(true)
    first.dispose()
    second.dispose()
    overridden.dispose()
  })

  it('reuses one material instance per id inside a pack', () => {
    const pack = createMaterialPack()
    const a = pack.get('painted-steel')
    const b = pack.get('painted-steel')
    const c = pack.get('bare-steel')
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(pack.has('painted-steel')).toBe(true)
    expect(pack.size).toBe(2)
    expect([...pack.ids].sort()).toEqual(['bare-steel', 'painted-steel'])
    pack.dispose()
    expect(() => pack.get('painted-steel')).toThrow()
  })

  it('rejects unknown ids instead of silently rendering a default', () => {
    expect(isMaterialId('not-a-material')).toBe(false)
    expect(() => materialDefinition('not-a-material' as never)).toThrow()
  })

  it('identifies only shared-vocabulary materials on a scene tree', () => {
    const group = new THREE.Group()
    group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), createMaterial('painted-steel')))
    group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), createMaterial('rubber')))
    group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()))
    expect(collectMaterialIds(group)).toEqual(['painted-steel', 'rubber'])
    expect(measureSceneResources(group).meshes).toBe(3)
    clearSurfaceTextureCache()
  })
})
