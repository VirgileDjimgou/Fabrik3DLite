/**
 * Framework-independent cell editor model: placements, selection,
 * grid-snapped transforms, overlap reporting, undo/redo, and an explicit
 * editing/execution mode guard.
 */

import { EQUIPMENT_SDK_VERSION, createTransform, WORLD_FRAME_ID, compatiblePorts, type CellDefinition, type EquipmentConnection, type EquipmentInstance } from '../equipment'
import { buildReferencePlacements } from './referenceCell'
import { catalogEntryFor } from './catalog'
import type { EditorCatalogEntry, EditorCommandResult, EditorMode, EditorPlacement, EditorEquipmentKind, OverlapReport } from './editorTypes'
import { findOverlaps, hasInvalidOverlap } from './overlap'
import { DEFAULT_ANGLE_GRID_DEG, DEFAULT_GRID_METERS, normalizeGridValue, snapAngle, snapDistance } from './snapping'

export class CellEditorModel {
  mode: EditorMode = 'editing'

  private placements: EditorPlacement[] = []
  private selectionId: string | null = null
  private history: EditorSnapshot[] = []
  private redoHistory: EditorSnapshot[] = []
  private connections: EquipmentConnection[] = []

  readonly catalog: EditorCatalogEntry[]
  readonly snapGridMeters: number
  readonly snapAngleDeg: number

  constructor(
    catalog: EditorCatalogEntry[],
    initial: EditorPlacement[] = [],
    snapGridMeters = DEFAULT_GRID_METERS,
    snapAngleDeg = DEFAULT_ANGLE_GRID_DEG,
  ) {
    this.catalog = catalog
    this.placements = clone(initial)
    this.snapGridMeters = snapGridMeters
    this.snapAngleDeg = snapAngleDeg
  }

  // ── Introspection ────────────────────────────────────────────────

  getPlacements(): EditorPlacement[] { return clone(this.placements) }
  getPlacement(id: string): EditorPlacement | null { return this.placements.find((p) => p.id === id) ?? null }
  getSelectionId(): string | null { return this.selectionId }
  getSelected(): EditorPlacement | null { return this.selectionId ? this.getPlacement(this.selectionId) : null }
  getOverlaps(): OverlapReport[] { return findOverlaps(this.placements) }
  isInvalid(id: string): boolean { return hasInvalidOverlap(id, this.placements) }
  canUndo(): boolean { return this.history.length > 0 }
  canRedo(): boolean { return this.redoHistory.length > 0 }
  getConnections(): EquipmentConnection[] { return this.connections.map(connection => ({ ...connection })) }

  /** Lists receiver ports compatible with an output port for editor highlighting. */
  compatibleTargets(fromId: string, fromPortId: string): Array<{ equipmentId: string; portId: string }> {
    const from = this.port(fromId, fromPortId)
    if (!from) return []
    return this.placements.flatMap(placement => this.entry(placement)?.ports?.filter(port => compatiblePorts(from, port)).map(port => ({ equipmentId: placement.id, portId: port.id })) ?? [])
  }

  /** Adds a semantic port link. Connections remain independent from visuals. */
  connect(connection: EquipmentConnection): EditorCommandResult {
    if (!this.ensureEditing()) return this.rejected('Editing is only allowed in editing mode.')
    if (this.connections.some(item => item.id === connection.id)) return this.rejected(`Connection '${connection.id}' already exists.`)
    const from = this.port(connection.fromEquipmentId, connection.fromPortId)
    const to = this.port(connection.toEquipmentId, connection.toPortId)
    if (!from || !to) return this.rejected(`Connection '${connection.id}' references an unknown port.`)
    if (connection.kind !== from.kind || !compatiblePorts(from, to)) return this.rejected(`Connection '${connection.id}' has incompatible ports.`)
    this.pushHistory()
    this.connections.push({ ...connection })
    return { ok: true }
  }

  /** Explicit mode transition; only editing mode allows mutations. */
  setMode(mode: EditorMode): void { this.mode = mode }

  // ── Selection (not undoable) ─────────────────────────────────────

  select(id: string | null): void {
    if (id === null || this.placements.some((p) => p.id === id)) this.selectionId = id
  }

  // ── Mutations (guarded by mode) ──────────────────────────────────

  add(kind: EditorEquipmentKind, x: number, z: number, snap = true): EditorCommandResult {
    if (!this.ensureEditing()) return this.rejected('Editing is only allowed in editing mode.')
    const entry = catalogEntryFor(kind, this.catalog)
    const placement: EditorPlacement = {
      id: nextId(),
      kind,
      definitionId: entry.definitionId,
      label: entry.label,
      x: normalizeGridValue(snap ? snapDistance(x, this.snapGridMeters) : x),
      z: normalizeGridValue(snap ? snapDistance(z, this.snapGridMeters) : z),
      rotationRad: 0,
      width: entry.width,
      depth: entry.depth,
      reachMeters: entry.reachMeters,
    }
    this.pushHistory()
    this.placements.push(placement)
    this.selectionId = placement.id
    return { ok: true }
  }

  remove(id: string): EditorCommandResult {
    if (!this.ensureEditing()) return this.rejected('Editing is only allowed in editing mode.')
    if (!this.getPlacement(id)) return this.rejected(`Placement '${id}' does not exist.`)
    this.pushHistory()
    this.placements = this.placements.filter((p) => p.id !== id)
    if (this.selectionId === id) this.selectionId = null
    return { ok: true }
  }

  move(id: string, x: number, z: number, snap = true): EditorCommandResult {
    return this.update(id, (placement) => {
      placement.x = normalizeGridValue(snap ? snapDistance(x, this.snapGridMeters) : x)
      placement.z = normalizeGridValue(snap ? snapDistance(z, this.snapGridMeters) : z)
    })
  }

  rotate(id: string, angleRad: number, snap = true): EditorCommandResult {
    return this.update(id, (placement) => {
      placement.rotationRad = normalizeGridValue(snap ? snapAngle(angleRad, this.snapAngleDeg) : angleRad)
    })
  }

  /** Reloads the built-in reference cell (undoable). */
  reset(): EditorCommandResult {
    if (!this.ensureEditing()) return this.rejected('Editing is only allowed in editing mode.')
    const reference = buildReferencePlacements(this.catalog)
    if (samePlacements(this.placements, reference)) return { ok: true }
    this.pushHistory()
    this.placements = reference
    this.selectionId = null
    return { ok: true }
  }

  /**
   * Replaces the current placements with the given cell (undoable). Used by
   * import and sample loading. Placements that reference an unknown catalog
   * definition are skipped.
   */
  load(placements: EditorPlacement[]): EditorCommandResult {
    if (!this.ensureEditing()) return this.rejected('Editing is only allowed in editing mode.')
    if (samePlacements(this.placements, placements)) return { ok: true }
    this.pushHistory()
    this.placements = placements
    this.selectionId = null
    return { ok: true }
  }

  undo(): boolean {
    const previous = this.history.pop()
    if (!previous) return false
    this.redoHistory.push(this.snapshot())
    this.restore(previous)
    if (this.selectionId && !this.getPlacement(this.selectionId)) this.selectionId = null
    return true
  }

  redo(): boolean {
    const next = this.redoHistory.pop()
    if (!next) return false
    this.history.push(this.snapshot())
    this.restore(next)
    if (this.selectionId && !this.getPlacement(this.selectionId)) this.selectionId = null
    return true
  }

  // ── Export ───────────────────────────────────────────────────────

  /** Produces an equipment-SDK cell definition from the current placements. */
  toCellDefinition(): CellDefinition {
    const equipment: EquipmentInstance[] = this.placements.map((placement) => ({
      id: placement.id,
      definitionId: placement.definitionId,
      transform: createTransform(
        { x: placement.x, y: 0, z: placement.z },
        { x: 0, y: placement.rotationRad, z: 0 },
        WORLD_FRAME_ID,
      ),
    }))
    return {
      sdkVersion: EQUIPMENT_SDK_VERSION,
      id: 'edited-cell',
      name: 'Edited cell',
      worldFrameId: WORLD_FRAME_ID,
      equipment,
      connections: this.getConnections(),
    }
  }

  // ── Internal ─────────────────────────────────────────────────────

  private update(id: string, mutate: (placement: EditorPlacement) => void): EditorCommandResult {
    if (!this.ensureEditing()) return this.rejected('Editing is only allowed in editing mode.')
    const placement = this.getPlacement(id)
    if (!placement) return this.rejected(`Placement '${id}' does not exist.`)
    const before = { x: placement.x, z: placement.z, rotationRad: placement.rotationRad }
    const draft = { ...placement }
    mutate(draft)
    if (draft.x === before.x && draft.z === before.z && draft.rotationRad === before.rotationRad) {
      return { ok: true }
    }
    this.pushHistory()
    Object.assign(placement, draft)
    return { ok: true }
  }

  private pushHistory(): void {
    this.history.push(this.snapshot())
    if (this.history.length > 200) this.history.shift()
    this.redoHistory = []
  }

  private ensureEditing(): boolean { return this.mode === 'editing' }

  private rejected(reason: string): EditorCommandResult { return { ok: false, reason } }

  private snapshot(): EditorSnapshot { return { placements: clone(this.placements), connections: this.getConnections() } }
  private restore(snapshot: EditorSnapshot): void { this.placements = clone(snapshot.placements); this.connections = snapshot.connections.map(connection => ({ ...connection })) }

  private entry(placement: EditorPlacement): EditorCatalogEntry | undefined {
    return this.catalog.find(entry => entry.definitionId === placement.definitionId)
  }

  private port(placementId: string, portId: string) {
    const placement = this.getPlacement(placementId)
    return placement ? this.entry(placement)?.ports?.find(port => port.id === portId) : undefined
  }
}

interface EditorSnapshot { placements: EditorPlacement[]; connections: EquipmentConnection[] }

function clone(placements: EditorPlacement[]): EditorPlacement[] {
  return placements.map((placement) => ({ ...placement }))
}

function samePlacements(a: EditorPlacement[], b: EditorPlacement[]): boolean {
  if (a.length !== b.length) return false
  return a.every((placement, index) => {
    const other = b[index]!
    return placement.id === other.id
      && placement.kind === other.kind
      && placement.x === other.x
      && placement.z === other.z
      && placement.rotationRad === other.rotationRad
  })
}

let sequence = 0
function nextId(): string {
  sequence += 1
  return `equipment-${sequence}`
}
