import { SINGLE_CELL_CONVEYOR, SINGLE_CELL_POSITIONS } from '../../simulation/SingleConveyorCellLayout'
import { EquipmentRegistry } from '../EquipmentRegistry'
import { createTransform, WORLD_FRAME_ID } from '../transforms'
import { EQUIPMENT_SDK_VERSION, type CellDefinition, type EquipmentDefinition } from '../types'

export const SINGLE_CONVEYOR_EQUIPMENT_DEFINITIONS: EquipmentDefinition[] = [
  { sdkVersion: EQUIPMENT_SDK_VERSION, id: 'fanuc-like-6axis', category: 'robot', manufacturer: 'Fabrik3D', model: 'Educational 6-axis', capabilities: [{ id: 'pick-place', description: 'Moves a part between defined work positions.' }], ports: [{ id: 'tool-flange', kind: 'material', direction: 'bidirectional' }] },
  { sdkVersion: EQUIPMENT_SDK_VERSION, id: 'educational-cnc', category: 'machine', manufacturer: 'Fabrik3D', model: 'CNC cell', capabilities: [{ id: 'machining', description: 'Processes a loaded workpiece.' }], ports: [{ id: 'load-door', kind: 'material', direction: 'input' }] },
  { sdkVersion: EQUIPMENT_SDK_VERSION, id: 'belt-conveyor', category: 'conveyor', manufacturer: 'Fabrik3D', model: 'Single line', capabilities: [{ id: 'pallet-feed', description: 'Brings pallets to the robot work area.' }], ports: [{ id: 'pallet-infeed', kind: 'material', direction: 'input' }, { id: 'pallet-stop', kind: 'material', direction: 'output' }], dimensionsMeters: { x: SINGLE_CELL_CONVEYOR.length, y: 0.6, z: 0.5 } },
  { sdkVersion: EQUIPMENT_SDK_VERSION, id: 'pallet-station', category: 'pallet-station', capabilities: [{ id: 'part-storage', description: 'Stores raw and machined parts in a cavity grid.' }], ports: [{ id: 'robot-access', kind: 'material', direction: 'bidirectional' }] },
]

const SINGLE_CELL_FLOW_STOP_X = 0

export const SINGLE_CONVEYOR_CELL: CellDefinition = {
  sdkVersion: EQUIPMENT_SDK_VERSION,
  id: 'single-conveyor-machining-cell',
  name: 'Single conveyor machining cell',
  worldFrameId: WORLD_FRAME_ID,
  equipment: [
    { id: 'robot-1', definitionId: 'fanuc-like-6axis', transform: createTransform(tupleToVector(SINGLE_CELL_POSITIONS.robot)) },
    { id: 'cnc-1', definitionId: 'educational-cnc', transform: createTransform(tupleToVector(SINGLE_CELL_POSITIONS.cnc), { x: 0, y: SINGLE_CELL_POSITIONS.cncRotationY, z: 0 }) },
    { id: 'conveyor-1', definitionId: 'belt-conveyor', transform: createTransform(tupleToVector(SINGLE_CELL_POSITIONS.conveyor), { x: 0, y: SINGLE_CELL_POSITIONS.conveyorRotationY, z: 0 }) },
    { id: 'pallet-station-1', definitionId: 'pallet-station', transform: createTransform({ x: SINGLE_CELL_FLOW_STOP_X, y: SINGLE_CELL_CONVEYOR.surfaceY, z: SINGLE_CELL_POSITIONS.conveyor[2] }) },
  ],
}

function tupleToVector([x, y, z]: [number, number, number]) { return { x, y, z } }

export function createSingleConveyorEquipmentRegistry(): EquipmentRegistry {
  const registry = new EquipmentRegistry()
  for (const definition of SINGLE_CONVEYOR_EQUIPMENT_DEFINITIONS) registry.registerDefinition(definition)
  registry.loadCell(SINGLE_CONVEYOR_CELL)
  return registry
}
