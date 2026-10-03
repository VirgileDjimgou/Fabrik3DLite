import * as THREE from 'three'
import { createMaterialPack } from './materialLibrary'

/**
 * Procedural fallback for the S55 hero-cell dressing. It mirrors the generated
 * `hero-cell-dressing-v1` GLB closely enough to keep the scene coherent when the
 * asset is missing or corrupt. It is render-only and never a collision
 * authority. Materials come from the shared S68 vocabulary.
 */
export function buildHeroCellDressingFallback(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'HeroCellDressingFallback'
  group.userData.semanticId = 'equipment:cell-dressing'

  const pack = createMaterialPack()
  const trim = pack.get('machine-trim')
  const steel = pack.get('structural-steel')
  const hazard = pack.get('hazard-amber')
  const rackBlue = pack.get('pallet-blue')
  const workLight = pack.get('work-light')
  const rubber = pack.get('rubber')
  const coolant = pack.get('coolant')

  const add = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number]) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = name
    mesh.userData.semanticId = name
    mesh.position.set(...position)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
    return mesh
  }

  const chip = new THREE.Group()
  chip.name = 'motor:chip-conveyor'
  chip.userData.semanticId = 'motor:chip-conveyor'
  chip.position.set(1.42, 0, 3.4)
  group.add(chip)
  const chipBody = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.34, 2.2), trim)
  chipBody.position.set(0, 0.5, 0)
  chip.add(chipBody)
  const auger = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.0, 12), steel)
  auger.rotation.x = Math.PI / 2
  auger.position.set(0, 0.5, 0)
  chip.add(auger)
  add('chip:coolant-tank', new THREE.BoxGeometry(0.72, 0.5, 0.9), coolant, [1.42, 0.28, 2.2])
  add('chip:bin', new THREE.BoxGeometry(0.6, 0.62, 0.5), rubber, [-1.65, 0.31, 3.4])

  for (const [index, z] of [[1, -0.45], [2, 0.75]] as const) {
    const rack = new THREE.Group()
    rack.name = `fixture:buffer:${index}`
    rack.userData.semanticId = `fixture:buffer:${index}`
    rack.position.set(3.55, 0, z)
    group.add(rack)
    for (const [dx, dz] of [[-0.45, -0.3], [0.45, -0.3], [-0.45, 0.3], [0.45, 0.3]] as const) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.7, 0.06), rackBlue)
      post.position.set(dx, 0.85, dz)
      rack.add(post)
    }
    for (const y of [0.4, 0.8, 1.2, 1.6]) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.04, 0.66), steel)
      shelf.position.set(0, y, 0)
      rack.add(shelf)
    }
  }
  const anchor = new THREE.Group()
  anchor.name = 'anchor:buffer.access'
  anchor.userData.semanticId = 'anchor:buffer.access'
  anchor.position.set(3.0, 0.9, 0.15)
  group.add(anchor)

  for (const [index, z] of [[1, 1.6], [2, -1.6]] as const) {
    const light = new THREE.Group()
    light.name = `signal:worklight:${index}`
    light.userData.semanticId = `signal:worklight:${index}`
    light.position.set(0, 3.2, z)
    group.add(light)
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, 0.34), trim)
    light.add(frame)
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.02, 0.26), workLight)
    panel.position.set(0, -0.04, 0)
    light.add(panel)
  }

  for (const [index, x] of [[1, -3.5], [2, 3.5]] as const) {
    add(`cable:drop:${index}`, new THREE.CylinderGeometry(0.03, 0.03, 2.35, 8), trim, [x, 1.18, -3.25])
  }

  for (const [index, [x, z]] of ([[-2.0, 1.4], [2.0, 1.4], [-3.3, -1.5], [3.3, -1.5]] as const).entries()) {
    add(`bollard:${index}`, new THREE.CylinderGeometry(0.07, 0.08, 0.62, 12), hazard, [x, 0.31, z])
  }

  return group
}

/** Disposes every geometry/material owned by a dressing group. */
export function disposeHeroCellDressing(group: THREE.Object3D): void {
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.geometry.dispose()
    const material = child.material
    if (Array.isArray(material)) material.forEach((item) => item.dispose())
    else material.dispose()
  })
}
