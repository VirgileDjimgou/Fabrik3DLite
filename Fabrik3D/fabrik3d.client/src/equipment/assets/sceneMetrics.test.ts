import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { estimateSceneTextureMemory, measureSceneResources } from './sceneMetrics'

describe('scene metrics', () => {
  it('counts unique textures once and estimates RGBA8 base-level bytes', () => {
    const root = new THREE.Group()
    const texture = new THREE.Texture({ width: 64, height: 32 } as unknown as TexImageSource)
    const material = new THREE.MeshBasicMaterial({ map: texture, color: new THREE.Color(0xffffff) })
    const geometry = new THREE.BoxGeometry()
    root.add(new THREE.Mesh(geometry, material))
    root.add(new THREE.Mesh(geometry, material))

    const memory = estimateSceneTextureMemory(root)

    expect(memory.textureCount).toBe(1)
    expect(memory.estimatedBytes).toBe(64 * 32 * 4)
  })

  it('reports zero texture memory for an empty scene without fabricating values', () => {
    const memory = estimateSceneTextureMemory(new THREE.Group())
    expect(memory.textureCount).toBe(0)
    expect(memory.estimatedBytes).toBe(0)
    expect(measureSceneResources(new THREE.Group())).toEqual({ meshes: 0, triangles: 0, drawCalls: 0, textures: 0 })
  })
})
