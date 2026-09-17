/**
 * License-safe procedural asset registry for the robot catalog.
 *
 * Visual and collision representations are generated procedurally at
 * runtime — no OEM mesh assets are shipped. Each robot definition
 * references one visual asset and one collision model by key; the
 * catalog validates that these keys resolve to a known asset.
 */

export interface CatalogAsset {
  id: string
  kind: 'visual' | 'collision'
  description: string
}

export const PROCEDURAL_VISUAL_ASSET_ID = 'procedural-6axis' as const
export const CAPSULE_COLLISION_MODEL_ID = 'capsule-6axis' as const

export const CATALOG_ASSETS: readonly CatalogAsset[] = [
  { id: PROCEDURAL_VISUAL_ASSET_ID, kind: 'visual', description: 'Procedurally built generic six-axis arm.' },
  { id: CAPSULE_COLLISION_MODEL_ID, kind: 'collision', description: 'Capsule-segment collision model for a generic six-axis arm.' },
]

export function isKnownAsset(assetId: string): boolean {
  return CATALOG_ASSETS.some((asset) => asset.id === assetId)
}
