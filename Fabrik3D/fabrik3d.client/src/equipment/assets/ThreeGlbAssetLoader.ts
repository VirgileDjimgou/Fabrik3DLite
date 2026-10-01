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

export interface GlbLoadOptions {
  /**
   * Clones per-instance materials so runtime material mutations (for example a
   * status colour) cannot leak to other instances. Geometry and textures remain
   * shared immutable templates and are disposed only with the cached template.
   */
  isolateMaterials?: boolean
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

  private ensureEntry(manifest: EquipmentAssetManifest, url: string): { key: string, entry: CachedTemplate } {
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
    return { key, entry }
  }

  /**
   * Physically loads and caches a template once. Concurrent callers coalesce on
   * the same promise; the returned template is never handed out directly.
   */
  async preload(manifest: EquipmentAssetManifest, url = manifest.visual.glb.path): Promise<void> {
    const { entry } = this.ensureEntry(manifest, url)
    await entry.promise
  }

  async load(
    manifest: EquipmentAssetManifest,
    url = manifest.visual.glb.path,
    options: GlbLoadOptions = {},
  ): Promise<LoadedEquipmentVisual> {
    const { entry } = this.ensureEntry(manifest, url)
    const template = await entry.promise
    const root = clone(template)
    const clonedMaterials = options.isolateMaterials ? isolateInstanceMaterials(root) : []
    entry.activeInstances += 1
    let disposed = false
    return {
      root,
      dispose: () => {
        if (disposed) return
        disposed = true
        root.removeFromParent()
        for (const material of clonedMaterials) material.dispose()
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

/**
 * Gives one cloned instance its own Material objects (shared within the instance)
 * so runtime material edits stay local. Textures and geometry remain shared
 * immutable templates. Returns the cloned materials for instance-scoped disposal.
 */
export function isolateInstanceMaterials(root: THREE.Object3D): THREE.Material[] {
  const clones = new Map<THREE.Material, THREE.Material>()
  const cloneMaterial = (material: THREE.Material): THREE.Material => {
    let existing = clones.get(material)
    if (!existing) {
      existing = material.clone()
      clones.set(material, existing)
    }
    return existing
  }
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.material = Array.isArray(child.material)
      ? child.material.map(cloneMaterial)
      : cloneMaterial(child.material)
  })
  return [...clones.values()]
}

/** Parses a GLB buffer without a WebGL renderer; used by package smoke tests. */
export function parseGlbArrayBuffer(data: ArrayBuffer): Promise<GLTF> {
  const loader = new GLTFLoader()
  return new Promise((resolve, reject) => loader.parse(data, '', resolve, reject))
}
