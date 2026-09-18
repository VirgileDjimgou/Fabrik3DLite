/**
 * Placement overlap detection in the plan view.
 *
 * Bounds are axis-aligned boxes (width × depth) centred on the placement.
 * Rotation is ignored for the AABB footprint (a conservative overlap
 * estimate), which is documented and deterministic.
 */

import type { EditorPlacement, OverlapReport } from './editorTypes'

/** AABB of a placement in world coordinates. */
export interface Aabb {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export function placementAabb(placement: EditorPlacement): Aabb {
  return {
    minX: placement.x - placement.width / 2,
    maxX: placement.x + placement.width / 2,
    minZ: placement.z - placement.depth / 2,
    maxZ: placement.z + placement.depth / 2,
  }
}

export function aabbsOverlap(a: Aabb, b: Aabb, margin = 0): boolean {
  return a.minX < b.maxX - margin && b.minX < a.maxX - margin && a.minZ < b.maxZ - margin && b.minZ < a.maxZ - margin
}

/**
 * Placement kinds that are allowed to stack geometrically (a pallet station
 * sits on a conveyor belt, so their footprints legitimately overlap).
 */
const STACKING_PAIRS: ReadonlySet<string> = new Set([
  'pallet-station|conveyor',
  'conveyor|pallet-station',
])

function isAllowedStacking(a: EditorPlacement, b: EditorPlacement): boolean {
  return STACKING_PAIRS.has(`${a.kind}|${b.kind}`)
}

/** Returns every overlapping placement pair and whether the overlap is invalid. */
export function findOverlaps(placements: readonly EditorPlacement[]): OverlapReport[] {
  const reports: OverlapReport[] = []
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const a = placements[i]!
      const b = placements[j]!
      if (!aabbsOverlap(placementAabb(a), placementAabb(b))) continue
      reports.push({ idA: a.id, idB: b.id, invalid: !isAllowedStacking(a, b) })
    }
  }
  return reports
}

/** True when a placement participates in an invalid overlap. */
export function hasInvalidOverlap(placementId: string, placements: readonly EditorPlacement[]): boolean {
  return findOverlaps(placements).some((report) => report.invalid && (report.idA === placementId || report.idB === placementId))
}