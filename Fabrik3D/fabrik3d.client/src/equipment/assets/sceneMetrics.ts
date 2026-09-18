import * as THREE from 'three'

export interface SceneRenderMetrics {
  meshes: number
  triangles: number
  drawCalls: number
  textures: number
}

/** Renderer-independent metric snapshot used to enforce scene asset budgets. */
export function measureSceneResources(root: THREE.Object3D): SceneRenderMetrics {
  const textures = new Set<THREE.Texture>()
  let meshes = 0
  let triangles = 0
  let drawCalls = 0
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    meshes += 1
    const position = child.geometry.getAttribute('position')
    const count = child.geometry.index?.count ?? position?.count ?? 0
    triangles += Math.floor(count / 3)
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    drawCalls += materials.length
    for (const material of materials) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value)
    }
  })
  return { meshes, triangles, drawCalls, textures: textures.size }
}
