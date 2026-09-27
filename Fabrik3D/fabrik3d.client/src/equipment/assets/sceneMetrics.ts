import * as THREE from 'three'

export interface SceneRenderMetrics {
  meshes: number
  triangles: number
  drawCalls: number
  textures: number
}

export interface SceneTextureMemory {
  textureCount: number
  /**
   * Estimated GPU texture bytes as `width * height * 4` per unique texture (RGBA8, base mip level
   * only). This is a documented estimate because WebGL does not expose real texture memory; it is
   * never presented as an exact driver allocation.
   */
  estimatedBytes: number
}

/** Estimates texture memory for the scene; renderer-independent and deterministic. */
export function estimateSceneTextureMemory(root: THREE.Object3D): SceneTextureMemory {
  const textures = new Set<THREE.Texture>()
  let estimatedBytes = 0
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (!(value instanceof THREE.Texture) || textures.has(value)) continue
        textures.add(value)
        const image = value.image as { width?: number; height?: number } | undefined
        if (image && typeof image.width === 'number' && typeof image.height === 'number') {
          estimatedBytes += image.width * image.height * 4
        }
      }
    }
  })
  return { textureCount: textures.size, estimatedBytes }
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
