import { SINGLE_CELL_CONVEYOR, SINGLE_CELL_POSITIONS } from '../../simulation/SingleConveyorCellLayout'
import { EquipmentRegistry } from '../EquipmentRegistry'
import { createTransform, WORLD_FRAME_ID } from '../transforms'
import { EQUIPMENT_SDK_VERSION, type CellDefinition, type EquipmentDefinition, type EquipmentSignalDeclaration } from '../types'

/**
 * Vendor-neutral reference I/O for the CNC machine-tending cell.
 * Directions are expressed relative to a controller; declarations are metadata
 * only and are bound to the runtime by `ReferenceCellSignalBinding`.
 */
const ROBOT_SIGNALS: EquipmentSignalDeclaration[] = [
  { name: 'ServoOn', displayName: 'Servo on', direction: 'input-to-controller', dataType: 'bool', defaultValue: false, semanticCategory: 'status' },
  { name: 'Ready', displayName: 'Ready', direction: 'input-to-controller', dataType: 'bool', defaultValue: false, semanticCategory: 'status' },
  { name: 'ProgramRunning', displayName: 'Program running', direction: 'input-to-controller', dataType: 'bool', defaultValue: false, semanticCategory: 'status' },
  { name: 'AtHome', displayName: 'At home', direction: 'input-to-controller', dataType: 'bool', defaultValue: false, semanticCategory: 'status' },
  { name: 'AtPick', displayName: 'At pick position', direction: 'input-to-controller', dataType: 'bool', defaultValue: false, semanticCategory: 'status' },
  { name: 'AtMachine', displayName: 'At machine position', direction: 'input-to-controller', dataType: 'bool', defaultValue: false, semanticCategory: 'status' },
  { name: 'Start', displayName: 'Start', direction: 'output-from-controller', dataType: 'bool', writable: true, defaultValue: false, semanticCategory: 'command' },
  { name: 'Stop', displayName: 'Stop', direction: 'output-from-controller', dataType: 'bool', writable: true, defaultValue: false, semanticCategory: 'command' },
  { name: 'Reset', displayName: 'Reset', direction: 'output-from-controller', dataType: 'bool', writable: true, defaultValue: false, semanticCategory: 'command' },
  { name: 'GripperOpen', displayName: 'Gripper open', direction: 'input-to-controller', dataType: 'bool', defaultValue: true, semanticCategory: 'status' },
  { name: 'GripperClosed', displayName: 'Gripper closed', direction: 'input-to-controller', dataType: 'bool', defaultValue: false, semanticCategory: 'status' },
  { name: 'PayloadDetected', displayName: 'Payload detected', direction: 'input-to-controller', dataType: 'bool', defaultValue: false, semanticCategory: 'status' },
  { name: 'Dwell', displayName: 'Grip dwell active', direction: 'input-to-controller', dataType: 'bool', defaultValue: false, semanticCategory: 'status' },
  { name: 'CycleStep', displayName: 'Workflow step index', direction: 'input-to-controller', dataType: 'uint', min: 0, max: 22, defaultValue: 0, semanticCategory: 'measurement' },
  { name: 'Fault', displayName: 'Robot fault', direction: 'input-to-controller', dataType: 'bool', defaultValue: false, semanticCategory: 'diagnostic' },
  { name: 'ProtectiveStop', displayName: 'Protective stop', direction: 'input-to-controller', dataType: 'bool', defaultValue: false, semanticCategory: 'safety' },
]

const CNC_SIGNALS: EquipmentSignalDeclaration[] = [
  { name: 'Ready', displayName: 'Ready', direction: 'input-to-controller', dataType: 'bool', defaultValue: false, semanticCategory: 'status' },
  { name: 'DoorOpen', displayName: 'Door open', direction: 'input-to-controller', dataType: 'bool', defaultValue: false, semanticCategory: 'status' },
  { name: 'DoorClosed', displayName: 'Door closed', direction: 'input-to-controller', dataType: 'bool', defaultValue: true, semanticCategory: 'status' },
  { name: 'DoorLocked', displayName: 'Door interlock locked', direction: 'input-to-controller', dataType: 'bool', defaultValue: true, semanticCategory: 'status' },
  { name: 'DoorCommand', displayName: 'Door command', direction: 'output-from-controller', dataType: 'bool', writable: true, defaultValue: false, semanticCategory: 'command' },
  { name: 'FixtureClamped', displayName: 'Fixture clamped', direction: 'input-to-controller', dataType: 'bool', defaultValue: false, semanticCategory: 'status' },
  { name: 'PartPresent', displayName: 'Part present', direction: 'input-to-controller', dataType: 'bool', defaultValue: false, semanticCategory: 'status' },
  { name: 'CycleStart', displayName: 'Cycle start', direction: 'output-from-controller', dataType: 'bool', writable: true, defaultValue: false, semanticCategory: 'command' },
  { name: 'CycleRunning', displayName: 'Cycle running', direction: 'input-to-controller', dataType: 'bool', defaultValue: false, semanticCategory: 'status' },
  { name: 'CycleComplete', displayName: 'Cycle complete', direction: 'input-to-controller', dataType: 'bool', defaultValue: false, semanticCategory: 'status' },
  { name: 'CycleStep', displayName: 'Cycle phase index', direction: 'input-to-controller', dataType: 'uint', min: 0, max: 9, defaultValue: 0, semanticCategory: 'measurement' },
  { name: 'SpindleRunning', displayName: 'Spindle running', direction: 'input-to-controller', dataType: 'bool', defaultValue: false, semanticCategory: 'status' },
  { name: 'SpindleAtSpeed', displayName: 'Spindle at speed', direction: 'input-to-controller', dataType: 'bool', defaultValue: false, semanticCategory: 'status' },
  { name: 'SpindleSpeed', displayName: 'Spindle speed', direction: 'input-to-controller', dataType: 'float', min: 0, max: 24_000, engineeringUnit: 'rpm', defaultValue: 0, semanticCategory: 'measurement' },
  { name: 'FeedActive', displayName: 'Feed axis cutting', direction: 'input-to-controller', dataType: 'bool', defaultValue: false, semanticCategory: 'status' },
  { name: 'FeedRate', displayName: 'Feed rate', direction: 'input-to-controller', dataType: 'float', min: 0, max: 10_000, engineeringUnit: 'mm/min', defaultValue: 0, semanticCategory: 'measurement' },
  { name: 'CoolantOn', displayName: 'Coolant on', direction: 'input-to-controller', dataType: 'bool', defaultValue: false, semanticCategory: 'status' },
  { name: 'Fault', displayName: 'CNC fault', direction: 'input-to-controller', dataType: 'bool', defaultValue: false, semanticCategory: 'diagnostic' },
  { name: 'EmergencyStop', displayName: 'Emergency stop', direction: 'input-to-controller', dataType: 'bool', defaultValue: false, semanticCategory: 'safety' },
]

const CONVEYOR_SIGNALS: EquipmentSignalDeclaration[] = [
  { name: 'RunCommand', displayName: 'Run command', direction: 'output-from-controller', dataType: 'bool', writable: true, defaultValue: true, semanticCategory: 'command' },
  { name: 'Running', displayName: 'Running', direction: 'input-to-controller', dataType: 'bool', defaultValue: false, semanticCategory: 'status' },
  { name: 'SpeedReference', displayName: 'Speed reference', direction: 'output-from-controller', dataType: 'float', writable: true, min: 0, max: 2, engineeringUnit: 'm/s', defaultValue: 0.35, semanticCategory: 'command' },
  { name: 'ActualSpeed', displayName: 'Actual speed', direction: 'input-to-controller', dataType: 'float', min: 0, max: 2, engineeringUnit: 'm/s', defaultValue: 0, semanticCategory: 'measurement' },
  { name: 'MotorFault', displayName: 'Motor fault', direction: 'input-to-controller', dataType: 'bool', defaultValue: false, semanticCategory: 'diagnostic' },
  { name: 'PhotoeyeIn', displayName: 'Photoeye infeed', direction: 'input-to-controller', dataType: 'bool', defaultValue: false, semanticCategory: 'status' },
  { name: 'PhotoeyeStation', displayName: 'Photoeye station', direction: 'input-to-controller', dataType: 'bool', defaultValue: false, semanticCategory: 'status' },
  { name: 'EncoderPulse', displayName: 'Encoder pulses', direction: 'input-to-controller', dataType: 'uint', defaultValue: 0, semanticCategory: 'measurement' },
  { name: 'RawSlotsRemaining', displayName: 'Raw slots remaining', direction: 'input-to-controller', dataType: 'uint', min: 0, max: 100, defaultValue: 0, semanticCategory: 'measurement' },
  { name: 'MachinedSlots', displayName: 'Machined slots', direction: 'input-to-controller', dataType: 'uint', min: 0, max: 100, defaultValue: 0, semanticCategory: 'measurement' },
  { name: 'SpeedDeviation', displayName: 'Speed deviation', direction: 'input-to-controller', dataType: 'float', min: 0, max: 2, engineeringUnit: 'm/s', defaultValue: 0, semanticCategory: 'measurement' },
]

const SAFETY_SIGNALS: EquipmentSignalDeclaration[] = [
  { name: 'EmergencyStop', displayName: 'Emergency stop', direction: 'input-to-controller', dataType: 'bool', defaultValue: false, semanticCategory: 'safety' },
  { name: 'GateClosed', displayName: 'Gate closed', direction: 'input-to-controller', dataType: 'bool', defaultValue: true, semanticCategory: 'safety' },
  { name: 'GateLocked', displayName: 'Gate locked', direction: 'input-to-controller', dataType: 'bool', defaultValue: true, semanticCategory: 'safety' },
  { name: 'LightCurtainClear', displayName: 'Light curtain clear', direction: 'input-to-controller', dataType: 'bool', defaultValue: true, semanticCategory: 'safety' },
  { name: 'ScannerClear', displayName: 'Scanner clear', direction: 'input-to-controller', dataType: 'bool', defaultValue: true, semanticCategory: 'safety' },
  { name: 'SafetyReset', displayName: 'Safety reset', direction: 'output-from-controller', dataType: 'bool', writable: true, defaultValue: false, semanticCategory: 'command' },
  { name: 'SafetyResetRequired', displayName: 'Safety reset required', direction: 'input-to-controller', dataType: 'bool', defaultValue: false, semanticCategory: 'safety' },
  { name: 'SafetyHealthy', displayName: 'Safety healthy', direction: 'input-to-controller', dataType: 'bool', defaultValue: true, semanticCategory: 'safety' },
]

export const SINGLE_CONVEYOR_EQUIPMENT_DEFINITIONS: EquipmentDefinition[] = [
  {
    sdkVersion: EQUIPMENT_SDK_VERSION,
    id: 'fanuc-like-6axis',
    category: 'robot',
    manufacturer: 'Fabrik3D',
    model: 'Educational 6-axis',
    capabilities: [{ id: 'pick-place', description: 'Moves a part between defined work positions.' }],
    ports: [{ id: 'tool-flange', kind: 'material', direction: 'bidirectional' }],
    signals: ROBOT_SIGNALS,
  },
  {
    sdkVersion: EQUIPMENT_SDK_VERSION,
    id: 'educational-cnc',
    category: 'machine',
    manufacturer: 'Fabrik3D',
    model: 'CNC cell',
    capabilities: [{ id: 'machining', description: 'Processes a loaded workpiece.' }],
    ports: [{ id: 'load-door', kind: 'material', direction: 'input' }],
    signals: CNC_SIGNALS,
  },
  {
    sdkVersion: EQUIPMENT_SDK_VERSION,
    id: 'belt-conveyor',
    category: 'conveyor',
    manufacturer: 'Fabrik3D',
    model: 'Single line',
    capabilities: [{ id: 'pallet-feed', description: 'Brings pallets to the robot work area.' }],
    ports: [{ id: 'pallet-infeed', kind: 'material', direction: 'input' }, { id: 'pallet-stop', kind: 'material', direction: 'output' }],
    dimensionsMeters: { x: SINGLE_CELL_CONVEYOR.length, y: 0.6, z: 0.5 },
    signals: CONVEYOR_SIGNALS,
  },
  {
    sdkVersion: EQUIPMENT_SDK_VERSION,
    id: 'pallet-station',
    category: 'pallet-station',
    capabilities: [{ id: 'part-storage', description: 'Stores raw and machined parts in a cavity grid.' }],
    ports: [{ id: 'robot-access', kind: 'material', direction: 'bidirectional' }],
  },
  {
    sdkVersion: EQUIPMENT_SDK_VERSION,
    id: 'safety-zone',
    category: 'safety-device',
    capabilities: [{ id: 'protective-zone', description: 'Declares a simulated protected area for training.' }],
    ports: [{ id: 'protective-state', kind: 'safety', direction: 'output' }],
    dimensionsMeters: { x: 4, y: 0.02, z: 4 },
    signals: SAFETY_SIGNALS,
  },
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
    { id: 'safety-zone-1', definitionId: 'safety-zone', transform: createTransform({ x: SINGLE_CELL_POSITIONS.robot[0], y: 0, z: SINGLE_CELL_POSITIONS.robot[2] }) },
  ],
}

function tupleToVector([x, y, z]: [number, number, number]) { return { x, y, z } }

export function createSingleConveyorEquipmentRegistry(): EquipmentRegistry {
  const registry = new EquipmentRegistry()
  for (const definition of SINGLE_CONVEYOR_EQUIPMENT_DEFINITIONS) registry.registerDefinition(definition)
  registry.loadCell(SINGLE_CONVEYOR_CELL)
  return registry
}
