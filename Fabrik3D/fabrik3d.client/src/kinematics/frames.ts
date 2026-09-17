import { SINGLE_CELL_CONVEYOR, SINGLE_CELL_POSITIONS } from '../simulation/SingleConveyorCellLayout'
import type { KinematicPose } from './types'

export const FRAME_IDS = {
  world: 'world',
  cell: 'cell',
  robotBase: 'robot-base',
  flange: 'flange',
  tool: 'tool',
  cncEquipment: 'cnc-1',
  conveyorEquipment: 'conveyor-1',
  palletWorkObject: 'pallet-work-object',
  cncWorkObject: 'cnc-work-object',
} as const

export interface CoordinateFrame {
  id: string
  parentId: string | null
  poseInParent: KinematicPose
  kind: 'world' | 'cell' | 'robot-base' | 'flange' | 'tool' | 'equipment' | 'work-object'
}

export function identityPose(frameId: string): KinematicPose {
  return { frameId, position: { x: 0, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } }
}

/** Static frames of the currently implemented single-conveyor cell. */
export function createSingleCellFrames(): CoordinateFrame[] {
  return [
    { id: FRAME_IDS.world, parentId: null, poseInParent: identityPose(FRAME_IDS.world), kind: 'world' },
    { id: FRAME_IDS.cell, parentId: FRAME_IDS.world, poseInParent: identityPose(FRAME_IDS.world), kind: 'cell' },
    { id: FRAME_IDS.robotBase, parentId: FRAME_IDS.cell, poseInParent: pose(FRAME_IDS.cell, ...SINGLE_CELL_POSITIONS.robot), kind: 'robot-base' },
    { id: FRAME_IDS.flange, parentId: FRAME_IDS.robotBase, poseInParent: identityPose(FRAME_IDS.robotBase), kind: 'flange' },
    { id: FRAME_IDS.tool, parentId: FRAME_IDS.flange, poseInParent: pose(FRAME_IDS.flange, 0, 0.05, 0), kind: 'tool' },
    { id: FRAME_IDS.cncEquipment, parentId: FRAME_IDS.cell, poseInParent: pose(FRAME_IDS.cell, ...SINGLE_CELL_POSITIONS.cnc), kind: 'equipment' },
    { id: FRAME_IDS.conveyorEquipment, parentId: FRAME_IDS.cell, poseInParent: pose(FRAME_IDS.cell, ...SINGLE_CELL_POSITIONS.conveyor), kind: 'equipment' },
    { id: FRAME_IDS.cncWorkObject, parentId: FRAME_IDS.cncEquipment, poseInParent: pose(FRAME_IDS.cncEquipment, 0, SINGLE_CELL_CONVEYOR.surfaceY, -0.72), kind: 'work-object' },
  ]
}

export function palletWorkObjectFrame(palletWorldX: number): CoordinateFrame {
  return { id: FRAME_IDS.palletWorkObject, parentId: FRAME_IDS.conveyorEquipment, poseInParent: pose(FRAME_IDS.conveyorEquipment, palletWorldX, SINGLE_CELL_CONVEYOR.surfaceY, 0), kind: 'work-object' }
}

function pose(frameId: string, x: number, y: number, z: number): KinematicPose {
  return { frameId, position: { x, y, z }, orientation: { x: 0, y: 0, z: 0, w: 1 } }
}
