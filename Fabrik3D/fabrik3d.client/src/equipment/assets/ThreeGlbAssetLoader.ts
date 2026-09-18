import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { EquipmentAssetManifest } from './types'

export interface GlbLoaderLike {
  loadAsync(url: string): Promise<GLTF>
}

export interface LoadedEquipmentVisual {
  root: THREE.Object3D
  /** Removes only this instance. Shared cached GPU resources remain valid. */
  dispose(): void
}

interface CachedTemplate {
  promise: Promise<THREE.Object3D>
  template?: THREE.Object3D
  activeInstances: number
}

/**
 * Centralized GLB loader. The template is cached per id/version/path while
 * each caller receives an independent scene graph suitable for transforms or
 * animation. Draco/Meshopt decoding is intentionally not enabled until a
 * shipped package needs it; this keeps the baseline bundle deterministic.
 */
export class ThreeGlbAssetLoader {
  private readonly cached = new Map<string, CachedTemplate>()

  constructor(private readonly loader: GlbLoaderLike = new GLTFLoader()) {}

  async load(manifest: EquipmentAssetManifest, url = manifest.visual.glb.path): Promise<LoadedEquipmentVisual> {
    const key = `${manifest.id}@${manifest.version}:${url}`
    let entry = this.cached.get(key)
    if (!entry) {
      const created: CachedTemplate = {
        activeInstances: 0,
        promise: this.loader.loadAsync(url)
          .then((gltf) => {
            created.template = gltf.scene
            return gltf.scene
          })
          .catch((error: unknown) => {
            this.cached.delete(key)
            throw new Error(`Unable to load GLB asset '${manifest.id}' (${url}): ${error instanceof Error ? error.message : String(error)}`)
          }),
      }
      entry = created
      this.cached.set(key, entry)
    }
    const template = await entry.promise
    const root = clone(template)
    entry.activeInstances += 1
    let disposed = false
    return {
      root,
      dispose: () => {
        if (disposed) return
        disposed = true
        root.removeFromParent()
        entry!.activeInstances = Math.max(0, entry!.activeInstances - 1)
      },
    }
  }

  cacheSize(): number { return this.cached.size }

  /** Releases cached GPU resources not used by a live visual instance. */
  async disposeUnused(): Promise<void> {
    for (const [key, entry] of this.cached) {
      if (entry.activeInstances !== 0) continue
      const template = await entry.promise
      disposeObject3DResources(template)
      this.cached.delete(key)
    }
  }
}

function disposeMaterial(material: THREE.Material, disposedMaterials: Set<THREE.Material>, disposedTextures: Set<THREE.Texture>): void {
  if (disposedMaterials.has(material)) return
  disposedMaterials.add(material)
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture && !disposedTextures.has(value)) {
      disposedTextures.add(value)
      value.dispose()
    }
  }
  material.dispose()
}

/** Disposes a cached template once no cloned instance references it. */
export function disposeObject3DResources(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    if (!geometries.has(child.geometry)) {
      geometries.add(child.geometry)
      child.geometry.dispose()
    }
    const childMaterials = Array.isArray(child.material) ? child.material : [child.material]
    for (const material of childMaterials) disposeMaterial(material, materials, textures)
  })
}

/** Parses a GLB buffer without a WebGL renderer; used by package smoke tests. */
export function parseGlbArrayBuffer(data: ArrayBuffer): Promise<GLTF> {
  const loader = new GLTFLoader()
  return new Promise((resolve, reject) => loader.parse(data, '', resolve, reject))
}
