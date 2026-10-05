import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { measureSceneResources } from '../assets/sceneMetrics'
import {
  applyEquipmentShadowFlags,
  applyEquipmentSurfaceTextures,
  attachContactShadow,
  createContactShadow,
  disposeContactShadow,
  surfaceForSemanticNode,
} from './equipmentGrounding'
import { clearSurfaceTextureCache } from './proceduralSurfaces'

function mesh(name: string, material = new THREE.MeshStandardMaterial()): THREE.Mesh {
  const object = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), material)
  object.name = name
  return object
}

describe('S72 equipment grounding', () => {
  it('applies shadow flags recursively to every mesh, including GLB-like nested groups', () => {
    const root = new THREE.Group()
    const nested = new THREE.Group()
    const first = mesh('body')
    const second = mesh('nested-part')
    nested.add(second)
    root.add(first, nested)
    expect(first.castShadow).toBe(false)
    applyEquipmentShadowFlags(root)
    expect(first.castShadow).toBe(true)
    expect(first.receiveShadow).toBe(true)
    expect(second.castShadow).toBe(true)
    expect(second.receiveShadow).toBe(true)
    applyEquipmentShadowFlags(root, { cast: false, receive: false })
    expect(first.castShadow).toBe(false)
    expect(second.receiveShadow).toBe(false)
  })

  it('builds a transparent radial contact-shadow decal sharing the cached texture', () => {
    clearSurfaceTextureCache()
    const first = createContactShadow()
    const second = createContactShadow()
    expect(first.material).toBeInstanceOf(THREE.MeshBasicMaterial)
    const material = first.material as THREE.MeshBasicMaterial
    expect(material.transparent).toBe(true)
    expect(material.map).toBeTruthy()
    expect((second.material as THREE.MeshBasicMaterial).map).toBe(material.map)
    expect(first.rotation.x).toBeCloseTo(-Math.PI / 2, 6)
    disposeContactShadow(first)
    disposeContactShadow(second)
    clearSurfaceTextureCache()
  })

  it('anchors the decal to the equipment transform', () => {
    clearSurfaceTextureCache()
    const equipment = new THREE.Group()
    equipment.name = 'equipment:cnc'
    const decal = attachContactShadow(equipment, { radius: 0.5 })
    expect(equipment.getObjectByName(decal.name)).toBe(decal)
    equipment.position.set(3, 0, -2)
    equipment.updateWorldMatrix(true, true)
    const world = new THREE.Vector3()
    decal.getWorldPosition(world)
    expect(world.x).toBeCloseTo(3, 6)
    expect(world.z).toBeCloseTo(-2, 6)
    disposeContactShadow(equipment)
    clearSurfaceTextureCache()
  })

  it('maps semantic node names to surfaces deterministically', () => {
    expect(surfaceForSemanticNode('label:base')).toBe('equipment-signage')
    expect(surfaceForSemanticNode('label:warning')).toBe('warning-label')
    expect(surfaceForSemanticNode('signal:panel-screen')).toBe('hmi-screen')
    expect(surfaceForSemanticNode('link:upper-arm')).toBeNull()
  })

  it('attaches procedural surfaces to generated label/screen nodes only', () => {
    clearSurfaceTextureCache()
    const root = new THREE.Group()
    root.add(mesh('label:warning'))
    root.add(mesh('label:axis-1'))
    root.add(mesh('signal:panel-screen'))
    root.add(mesh('link:upper-arm'))
    const textured = applyEquipmentSurfaceTextures(root)
    expect(textured).toBeGreaterThanOrEqual(3)
    const metrics = measureSceneResources(root)
    expect(metrics.textures).toBeGreaterThanOrEqual(3)
    const warning = root.getObjectByName('label:warning') as THREE.Mesh
    expect((warning.material as THREE.MeshStandardMaterial).map).toBeTruthy()
    const plain = root.getObjectByName('link:upper-arm') as THREE.Mesh
    expect((plain.material as THREE.MeshStandardMaterial).map).toBeNull()
    root.traverse((child) => {
      if (child instanceof THREE.Mesh) child.geometry.dispose()
    })
    clearSurfaceTextureCache()
  })
})
