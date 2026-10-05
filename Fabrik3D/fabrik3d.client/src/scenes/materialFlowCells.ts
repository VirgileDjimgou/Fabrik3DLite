/**
 * S59 explicit industrial cells for the material-flow scenario presets.
 *
 * S58 composed each preset from a generic 4-column grid of definition classes.
 * S59 replaces that with hand-placed equipment so every existing scenario cell
 * visibly contains the equipment its logic requires: infeed/inspection/diverter
 * and bins for vision sorting, robot + gripper + pallets for palletizing, a
 * fixture with clamps for assembly, and a fenced safety cell with gate, scanner
 * and E-stop. All coordinates are SI metres and Y-up, matching the equipment SDK.
 *
 * These are data-only `CellDefinition`s: they declare equipment and transforms
 * but never scenario truth, runtime behavior, collision or telemetry.
 */

import { EQUIPMENT_SDK_VERSION, createTransform, type CellDefinition, type EquipmentAttachment } from '../equipment'

interface Piece {
  id: string
  definitionId: string
  x: number
  y: number
  z: number
  ry?: number
  /** S73 declared attachment; the transform above stays the compatibility fallback. */
  attachTo?: EquipmentAttachment
}

function cell(id: string, name: string, pieces: Piece[]): CellDefinition {
  return {
    sdkVersion: EQUIPMENT_SDK_VERSION,
    id,
    name,
    worldFrameId: 'world',
    equipment: pieces.map(piece => ({
      id: piece.id,
      definitionId: piece.definitionId,
      transform: createTransform(
        { x: piece.x, y: piece.y, z: piece.z },
        { x: 0, y: piece.ry ?? 0, z: 0 },
      ),
      ...(piece.attachTo ? { attachTo: piece.attachTo } : {}),
    })),
  }
}

/** Infeed conveyor → gantry inspection station → diverter → accepted/reject bins. */
export const VISION_SORTING_CELL: CellDefinition = cell('vision-sorting-cell', 'Vision sorting cell', [
  { id: 'infeed-conveyor-1', definitionId: 'straight-conveyor', x: -1.0, y: 0, z: 0 },
  { id: 'inspection-station-1', definitionId: 'vision-inspection-station', x: -0.8, y: 0, z: 0 },
  { id: 'inspection-sensor-1', definitionId: 'photoelectric-sensor', x: -0.8, y: 0.72, z: 0.24 },
  { id: 'inspection-camera-1', definitionId: 'barcode-rfid-reader', x: -0.8, y: 1.68, z: 0 },
  { id: 'diverter-1', definitionId: 'diverter-pusher', x: 0.35, y: 0, z: 0 },
  { id: 'accepted-bin-1', definitionId: 'storage-bin', x: 0.95, y: 0, z: -0.85 },
  { id: 'reject-bin-1', definitionId: 'storage-bin', x: 0.95, y: 0, z: 0.85 },
  { id: 'control-cabinet-1', definitionId: 'plc-cabinet', x: -2.5, y: 0, z: 1.25 },
  { id: 'hmi-pedestal-1', definitionId: 'operator-hmi-pedestal', x: -2.5, y: 0, z: 0.45 },
  { id: 'workpiece-1', definitionId: 'configurable-part', x: -1.8, y: 0.6, z: 0 },
  { id: 'workpiece-2', definitionId: 'configurable-part', x: -1.4, y: 0.6, z: 0 },
])

/** Robot + vacuum gripper tending an infeed conveyor, empty and completed pallets. */
export const PALLETIZING_CELL: CellDefinition = cell('palletizing-cell', 'Palletizing cell', [
  { id: 'robot-1', definitionId: 'fanuc-like-6axis', x: -0.7, y: 0, z: 0.2 },
  // S73: the gripper is attached to the robot's declared `tool:flange` anchor.
  // The declared transform is the compatibility fallback and resolves to the
  // same pose, so the existing visual baseline is unchanged.
  { id: 'vacuum-gripper-1', definitionId: 'vacuum-gripper', x: -0.7, y: 1.35, z: 0.55, attachTo: { targetId: 'robot-1', anchorId: 'tool:flange' } },
  { id: 'infeed-conveyor-1', definitionId: 'straight-conveyor', x: -2.3, y: 0, z: -1.3 },
  { id: 'box-1', definitionId: 'carton', x: -2.6, y: 0.55, z: -1.3 },
  { id: 'box-2', definitionId: 'carton', x: -2.3, y: 0.55, z: -1.3 },
  { id: 'box-3', definitionId: 'carton', x: -2.0, y: 0.55, z: -1.3 },
  { id: 'empty-pallet-1', definitionId: 'euro-pallet', x: 0.8, y: 0, z: -0.9 },
  { id: 'completed-pallet-1', definitionId: 'euro-pallet', x: 1.8, y: 0, z: 0.6 },
  { id: 'infeed-buffer-1', definitionId: 'infeed-buffer', x: -2.5, y: 0, z: 1.3 },
  { id: 'outfeed-buffer-1', definitionId: 'outfeed-buffer', x: 2.0, y: 0, z: 1.4 },
  // S69: the back fence sits outside the medium arm's swept envelope so the
  // guarding is never inside the robot's reach.
  { id: 'fence-panel-1', definitionId: 'fence-panel', x: 0, y: 0, z: -3.9 },
  { id: 'fence-panel-2', definitionId: 'fence-panel', x: -2.4, y: 0, z: -3.9 },
  { id: 'fence-panel-3', definitionId: 'fence-panel', x: 2.4, y: 0, z: -3.9 },
  { id: 'light-curtain-1', definitionId: 'light-curtain', x: 0.2, y: 0, z: -3.9 },
  { id: 'controller-cabinet-1', definitionId: 'robot-controller-cabinet', x: -2.2, y: 0, z: 1.6 },
])

/** Robot loading a clamped fixture with presence/camera inspection and rework buffer. */
export const ASSEMBLY_INSPECTION_CELL: CellDefinition = cell('assembly-inspection-cell', 'Assembly and inspection cell', [
  { id: 'robot-1', definitionId: 'fanuc-like-6axis', x: -0.9, y: 0, z: 0 },
  { id: 'assembly-station-1', definitionId: 'workholding-adapter', x: 0.7, y: 0.45, z: 0 },
  { id: 'fixture-1', definitionId: 'machining-fixture', x: 0.7, y: 0.6, z: 0 },
  { id: 'clamp-1', definitionId: 'toggle-clamp', x: 0.45, y: 0.85, z: -0.28 },
  { id: 'clamp-2', definitionId: 'toggle-clamp', x: 0.95, y: 0.85, z: 0.28 },
  { id: 'part-1', definitionId: 'configurable-part', x: 0.7, y: 0.85, z: 0 },
  { id: 'presence-sensor-1', definitionId: 'part-presence-sensor', x: 0.7, y: 1.0, z: 0.34 },
  { id: 'inspection-camera-1', definitionId: 'barcode-rfid-reader', x: 0.7, y: 1.35, z: 0 },
  { id: 'assembly-feed-1', definitionId: 'infeed-buffer', x: -2.2, y: 0, z: 0.9 },
  { id: 'rework-buffer-1', definitionId: 'outfeed-buffer', x: 1.9, y: 0, z: -0.7 },
  { id: 'operator-station-1', definitionId: 'operator-hmi-pedestal', x: 2.0, y: 0, z: 1.3 },
  { id: 'control-cabinet-1', definitionId: 'plc-cabinet', x: -2.6, y: 0, z: -0.9 },
])

/**
 * S73 anchor-driven composition demonstration. Every attached instance declares
 * only an origin fallback transform; its effective placement is derived end to
 * end from declared anchors/ports:
 * - `conveyor-b`/`conveyor-c` chain onto `conveyor-a` (`anchor:out` → `anchor:in`),
 * - `fence-2`/`gate-1` form a fence run with an interlocked gate,
 * - `gripper-1` mounts on the robot's `tool:flange`,
 * - `pallet-station-1` attaches to the conveyor's declared material port.
 * It is data-only and never scenario truth, collision or telemetry.
 */
export const MODULAR_ASSEMBLY_CELL: CellDefinition = cell('modular-assembly-cell', 'Modular assembly cell', [
  { id: 'conveyor-a', definitionId: 'straight-conveyor', x: 0, y: 0, z: 0 },
  { id: 'conveyor-b', definitionId: 'straight-conveyor', x: 0, y: 0, z: 0, attachTo: { targetId: 'conveyor-a', anchorId: 'anchor:out', sourceAnchorId: 'anchor:in' } },
  { id: 'conveyor-c', definitionId: 'straight-conveyor', x: 0, y: 0, z: 0, attachTo: { targetId: 'conveyor-b', anchorId: 'anchor:out', sourceAnchorId: 'anchor:in' } },
  { id: 'robot-1', definitionId: 'fanuc-like-6axis', x: 0, y: 0, z: 3 },
  { id: 'gripper-1', definitionId: 'vacuum-gripper', x: 0, y: 0, z: 0, attachTo: { targetId: 'robot-1', anchorId: 'tool:flange' } },
  { id: 'fence-1', definitionId: 'fence-panel', x: -3, y: 0, z: -3 },
  { id: 'fence-2', definitionId: 'fence-panel', x: 0, y: 0, z: 0, attachTo: { targetId: 'fence-1', anchorId: 'anchor:out', sourceAnchorId: 'anchor:in' } },
  { id: 'gate-1', definitionId: 'interlocked-gate', x: 0, y: 0, z: 0, attachTo: { targetId: 'fence-2', anchorId: 'anchor:out', sourceAnchorId: 'anchor:in' } },
  { id: 'pallet-station-1', definitionId: 'pallet-station', x: 0, y: 0, z: 0, attachTo: { targetId: 'conveyor-a', portId: 'material-out' } },
])

/** Fenced training cell with interlocked gate, scanner, E-stop, stack light and zones. */
export const SAFETY_TRAINING_CELL: CellDefinition = cell('safety-training-cell', 'Safety training cell', [
  { id: 'robot-1', definitionId: 'fanuc-like-6axis', x: 0, y: 0, z: 0 },
  // S69: the compact training arm's envelope is fully enclosed by the fence,
  // which sits outside the swept envelope with the declared fence clearance.
  { id: 'fence-panel-left', definitionId: 'fence-panel', x: -2.3, y: 0, z: 2.3, ry: Math.PI / 2 },
  { id: 'fence-panel-right', definitionId: 'fence-panel', x: 2.3, y: 0, z: 2.3, ry: Math.PI / 2 },
  { id: 'fence-panel-back', definitionId: 'fence-panel', x: 0, y: 0, z: -2.3 },
  { id: 'interlocked-gate-1', definitionId: 'interlocked-gate', x: 0, y: 0, z: 2.3 },
  { id: 'area-scanner-1', definitionId: 'area-scanner', x: 0.6, y: 0.12, z: 1.9 },
  { id: 'emergency-stop-1', definitionId: 'emergency-stop', x: -1.8, y: 0, z: 1.7 },
  { id: 'stack-light-1', definitionId: 'stack-light', x: -1.8, y: 1.55, z: 1.7 },
  { id: 'operator-access-zone-1', definitionId: 'safety-zone', x: 0, y: 0, z: 3.2 },
  { id: 'protected-zone-1', definitionId: 'safety-zone', x: 0, y: 0, z: 0 },
  { id: 'control-cabinet-1', definitionId: 'plc-cabinet', x: 1.5, y: 0, z: 1.4 },
])
