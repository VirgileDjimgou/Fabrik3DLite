/**
 * Built-in reference template: the existing single-conveyor cell,
 * expressed as editor placements. Reset-to-reference reloads these.
 */

import { SINGLE_CELL_CONVEYOR, SINGLE_CELL_POSITIONS } from '../simulation/SingleConveyorCellLayout'
import type { EditorCatalogEntry, EditorPlacement } from './editorTypes'
import { ROBOT_DEFINITION_ID, catalogEntryFor } from './catalog'

export const REFERENCE_CELL_NAME = 'Single conveyor machining cell'

/**
 * Reference placements for the current single-conveyor cell. The pallet
 * station sits on the conveyor (a supported stacking overlap).
 */
export function buildReferencePlacements(catalog: EditorCatalogEntry[]): EditorPlacement[] {
  const robot = catalogEntryFor('robot', catalog)
  const cnc = catalogEntryFor('cnc', catalog)
  const conveyor = catalogEntryFor('conveyor', catalog)
  const pallet = catalogEntryFor('pallet-station', catalog)

  return [
    placement('robot-1', 'robot', robot, 0, 0, 0),
    placement('cnc-1', 'cnc', cnc, SINGLE_CELL_POSITIONS.cnc[0], SINGLE_CELL_POSITIONS.cnc[2], SINGLE_CELL_POSITIONS.cncRotationY),
    placement('conveyor-1', 'conveyor', conveyor, SINGLE_CELL_POSITIONS.conveyor[0], SINGLE_CELL_POSITIONS.conveyor[2], SINGLE_CELL_POSITIONS.conveyorRotationY),
    placement('pallet-station-1', 'pallet-station', pallet, 0, SINGLE_CELL_POSITIONS.conveyor[2], 0),
  ]
}

function placement(
  id: string,
  kind: EditorPlacement['kind'],
  entry: EditorCatalogEntry,
  x: number,
  z: number,
  rotationRad: number,
): EditorPlacement {
  return {
    id,
    kind,
    definitionId: entry.definitionId,
    label: entry.label,
    x,
    z,
    rotationRad,
    width: entry.width,
    depth: entry.depth,
    reachMeters: entry.reachMeters,
  }
}

/** The conveyor surface Y used by the reference cell. */
export const REFERENCE_CONVEYOR_SURFACE_Y = SINGLE_CELL_CONVEYOR.surfaceY

/** The default robot profile id used by the reference cell. */
export const REFERENCE_ROBOT_ID = ROBOT_DEFINITION_ID