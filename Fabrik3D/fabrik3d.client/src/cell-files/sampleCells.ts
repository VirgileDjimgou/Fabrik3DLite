/**
 * Built-in sample cells for the compact, medium, and heavy robot profiles.
 * They share the reference single-conveyor layout so the only difference
 * is the robot profile. Serialized samples are deterministic for Git review.
 */

import { SINGLE_CELL_CONVEYOR, SINGLE_CELL_POSITIONS } from '../simulation/SingleConveyorCellLayout'
import { createTransform } from '../equipment'
import type { CellFileV1 } from './schema'
import { CELL_SCHEMA_VERSION } from './schema'
import { serializeCellFile } from './importExport'

export type SampleRobotId = 'compact-6axis' | 'medium-6axis' | 'heavy-6axis'

export const SAMPLE_ROBOT_IDS: readonly SampleRobotId[] = ['compact-6axis', 'medium-6axis', 'heavy-6axis']

export function buildSampleCell(robotId: SampleRobotId, name?: string): CellFileV1 {
  return {
    schemaVersion: CELL_SCHEMA_VERSION,
    id: `sample-cell-${robotId}`,
    name: name ?? `Sample cell (${robotId})`,
    worldFrameId: 'world',
    equipment: [
      equipment('robot-1', robotId, 0, 0, 0, 0),
      equipment('cnc-1', 'educational-cnc', SINGLE_CELL_POSITIONS.cnc[0], SINGLE_CELL_POSITIONS.cnc[2], 0, SINGLE_CELL_POSITIONS.cncRotationY),
      equipment('conveyor-1', 'belt-conveyor', SINGLE_CELL_POSITIONS.conveyor[0], SINGLE_CELL_POSITIONS.conveyor[2], 0, SINGLE_CELL_POSITIONS.conveyorRotationY),
      equipment('pallet-station-1', 'pallet-station', 0, SINGLE_CELL_POSITIONS.conveyor[2], SINGLE_CELL_CONVEYOR.surfaceY, 0),
    ],
  }
}

function equipment(id: string, definitionId: string, x: number, z: number, y: number, rotationY: number): CellFileV1['equipment'][number] {
  const transform = createTransform({ x, y, z }, { x: 0, y: rotationY, z: 0 })
  return {
    id,
    definitionId,
    transform: {
      position: { x: transform.position.x, y: transform.position.y, z: transform.position.z },
      rotation: { x: transform.rotation.x, y: transform.rotation.y, z: transform.rotation.z },
    },
  }
}

export const SAMPLE_CELLS: Record<SampleRobotId, CellFileV1> = {
  'compact-6axis': buildSampleCell('compact-6axis'),
  'medium-6axis': buildSampleCell('medium-6axis'),
  'heavy-6axis': buildSampleCell('heavy-6axis'),
}

/** Deterministic serialized samples (for Git review and fixtures). */
export const SAMPLE_CELL_JSON: Record<SampleRobotId, string> = {
  'compact-6axis': serializeCellFile(SAMPLE_CELLS['compact-6axis']),
  'medium-6axis': serializeCellFile(SAMPLE_CELLS['medium-6axis']),
  'heavy-6axis': serializeCellFile(SAMPLE_CELLS['heavy-6axis']),
}