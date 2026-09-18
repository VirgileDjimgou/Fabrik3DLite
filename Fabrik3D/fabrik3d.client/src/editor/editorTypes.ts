/**
 * Visual cell editor contracts. All lengths are meters, rotations radians.
 *
 * The editor works in a top-down plan view (X right, Z forward) matching
 * the equipment SDK world frame; `rotation` is a rotation about Y.
 */

export type EditorEquipmentKind =
  | 'robot' | 'cnc' | 'conveyor' | 'pallet-station' | 'safety-zone'
  | import('../safety').IndustrialInfrastructureKind
  | import('../equipment').MaterialFlowEquipmentKind

export type EditorMode = 'editing' | 'execution'

export interface EditorPlacement {
  id: string
  kind: EditorEquipmentKind
  definitionId: string
  label: string
  /** World X in meters. */
  x: number
  /** World Z in meters. */
  z: number
  /** Rotation about Y in radians. */
  rotationRad: number
  /** Plan-view bounding box half extents (meters). */
  width: number
  depth: number
  /** Reach radius for robots, in meters. */
  reachMeters?: number
}

/** Result of a mutating editor command. */
export interface EditorCommandResult {
  ok: boolean
  reason?: string
}

export interface OverlapReport {
  idA: string
  idB: string
  /** Geometric overlap is invalid (not a supported stacking). */
  invalid: boolean
}

/** Equipment catalog entry usable from the editor. */
export interface EditorCatalogEntry {
  kind: EditorEquipmentKind
  definitionId: string
  label: string
  width: number
  depth: number
  reachMeters?: number
  group?: 'Core equipment' | 'Material flow' | 'Tooling' | 'Safety' | 'Infrastructure'
  capability?: 'static' | 'simulation-ready'
  anchorIds?: string[]
  ports?: import('../equipment').EquipmentPort[]
}
