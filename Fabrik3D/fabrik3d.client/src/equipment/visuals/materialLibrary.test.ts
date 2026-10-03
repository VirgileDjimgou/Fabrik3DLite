import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  MATERIAL_DEFINITIONS,
  MATERIAL_IDS,
  MATERIAL_TEXTURES,
  REQUIRED_MATERIAL_VOCABULARY,
  collectMaterialIds,
  createMaterial,
  createMaterialPack,
  isMaterialId,
  materialDefinition,
  validateMaterialLibrary,
} from './materialLibrary'
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

  it('is texture-free by design (no unmeasured atlas)', () => {
    // The sprint deliberately added no external texture; the registry is empty and
    // every material must therefore expose no texture map.
    expect(MATERIAL_TEXTURES).toEqual([])
    for (const id of MATERIAL_IDS) {
      const material = createMaterial(id)
      for (const key of ['map', 'roughnessMap', 'metalnessMap', 'normalMap', 'aoMap', 'emissiveMap', 'alphaMap'] as const) {
        expect(material[key], `${id}.${key}`).toBeNull()
      }
      expect(material.color.getHex(), id).toBe(MATERIAL_DEFINITIONS[id].color)
      expect(material.name).toBe(id)
      expect(material.userData.materialId).toBe(id)
      expect(material.userData.visualOnly).toBe(true)
      material.dispose()
    }
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
  })
})
