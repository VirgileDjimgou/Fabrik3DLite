/**
 * License-safe procedural asset registry for the robot catalog.
 *
 * Visual and collision representations are generated procedurally at
 * runtime by default — no OEM mesh assets are shipped. Catalog entries may
 * also point at a validated GLB manifest while retaining a procedural
 * fallback. Each robot definition references one visual asset and one
 * collision model by key; the catalog validates that these keys resolve.
 */

import { REFERENCE_6AXIS_GLB_ASSET_ID, REFERENCE_6AXIS_GLB_MANIFEST } from '../../equipment/assets/referenceAsset'
import { PROFESSIONAL_ROBOT_ASSET_IDS } from '../../equipment/assets/robotAssets'

export interface CatalogAsset {
  id: string
  kind: 'visual' | 'collision'
  description: string
  source: 'procedural' | 'glb'
}

export const PROCEDURAL_VISUAL_ASSET_ID = 'procedural-6axis' as const
export const CAPSULE_COLLISION_MODEL_ID = 'capsule-6axis' as const

export const CATALOG_ASSETS: readonly CatalogAsset[] = [
  { id: PROCEDURAL_VISUAL_ASSET_ID, kind: 'visual', source: 'procedural', description: 'Procedurally built generic six-axis arm.' },
  {
    id: REFERENCE_6AXIS_GLB_ASSET_ID,
    kind: 'visual',
    source: 'glb',
    description: `Manifest-backed reference GLB (${REFERENCE_6AXIS_GLB_MANIFEST.version}); procedural fallback required.`,
  },
  ...Object.values(PROFESSIONAL_ROBOT_ASSET_IDS).map((id) => ({
    id, kind: 'visual' as const, source: 'glb' as const, description: 'Generated professional generic six-axis robot GLB.',
  })),
  { id: CAPSULE_COLLISION_MODEL_ID, kind: 'collision', source: 'procedural', description: 'Capsule-segment collision model for a generic six-axis arm.' },
]

export function isKnownAsset(assetId: string): boolean {
  return CATALOG_ASSETS.some((asset) => asset.id === assetId)
}
