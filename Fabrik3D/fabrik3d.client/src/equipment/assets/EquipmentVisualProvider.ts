import * as THREE from 'three'
import { EquipmentAssetRegistry } from './registry'
import { ThreeGlbAssetLoader, type LoadedEquipmentVisual } from './ThreeGlbAssetLoader'

export interface EquipmentVisualLoadResult extends LoadedEquipmentVisual {
  source: 'glb' | 'procedural-fallback'
  diagnostic?: string
}

/**
 * The only bridge from an asset selection to a renderable object. Callers
 * retain ownership of their runtime adapter and provide their own procedural
 * fallback, which prevents a bad visual package from stopping simulation.
 */
export class EquipmentVisualProvider {
  constructor(
    private readonly registry: EquipmentAssetRegistry,
    private readonly glbLoader: ThreeGlbAssetLoader,
  ) {}

  async load(assetId: string, proceduralFallback: () => THREE.Object3D): Promise<EquipmentVisualLoadResult> {
    try {
      const asset = this.registry.get(assetId)
      if (asset.source === 'procedural') {
        return proceduralVisual(proceduralFallback())
      }
      const loaded = await this.glbLoader.load(asset.manifest, asset.url)
      return { ...loaded, source: 'glb' }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ...proceduralVisual(proceduralFallback()), diagnostic: message }
    }
  }
}

function proceduralVisual(root: THREE.Object3D): EquipmentVisualLoadResult {
  return { root, source: 'procedural-fallback', dispose: () => root.removeFromParent() }
}
