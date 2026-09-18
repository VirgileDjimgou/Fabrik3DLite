import type { EquipmentAssetManifest } from './types'
import { validateEquipmentAssetManifest } from './types'

export interface ProceduralEquipmentVisual {
  source: 'procedural'
  id: string
  description: string
}

export interface GlbEquipmentVisual {
  source: 'glb'
  id: string
  manifest: EquipmentAssetManifest
  /** Resolved public URL of the package GLB; manifest paths remain relative. */
  url?: string
  /** Existing visual selected when the GLB cannot be loaded. */
  fallbackAssetId: string
  description: string
}

export type RegisteredEquipmentVisual = ProceduralEquipmentVisual | GlbEquipmentVisual

/**
 * Catalog of render-only assets. Runtime adapters, simulation state and
 * telemetry deliberately do not appear in this type.
 */
export class EquipmentAssetRegistry {
  private readonly assets = new Map<string, RegisteredEquipmentVisual>()

  register(asset: RegisteredEquipmentVisual): void {
    if (!asset.id.trim()) throw new Error('Equipment visual asset id is required.')
    if (!asset.description.trim()) throw new Error(`Equipment visual asset '${asset.id}' requires a description.`)
    if (this.assets.has(asset.id)) throw new Error(`Equipment visual asset '${asset.id}' is already registered.`)
    if (asset.source === 'glb') {
      validateEquipmentAssetManifest(asset.manifest)
      if (asset.manifest.id !== asset.id) {
        throw new Error(`GLB asset '${asset.id}' must match manifest id '${asset.manifest.id}'.`)
      }
      if (asset.fallbackAssetId === asset.id) {
        throw new Error(`GLB asset '${asset.id}' cannot fall back to itself.`)
      }
      if (!this.assets.has(asset.fallbackAssetId)) {
        throw new Error(`GLB asset '${asset.id}' requires registered fallback '${asset.fallbackAssetId}'.`)
      }
    }
    this.assets.set(asset.id, asset)
  }

  get(id: string): RegisteredEquipmentVisual {
    const asset = this.assets.get(id)
    if (!asset) throw new Error(`Equipment visual asset '${id}' is not registered.`)
    return asset
  }

  has(id: string): boolean { return this.assets.has(id) }
  list(): RegisteredEquipmentVisual[] { return [...this.assets.values()] }
}
