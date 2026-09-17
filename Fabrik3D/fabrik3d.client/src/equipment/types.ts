/**
 * Stable equipment SDK contracts for Fabrik3D cells.
 *
 * Coordinates use a right-handed world frame: X right, Y up, Z forward.
 * All lengths are meters, rotations radians, time seconds and masses kilograms.
 */

export const EQUIPMENT_SDK_VERSION = '1.0' as const

export type EquipmentCategory =
  | 'robot'
  | 'machine'
  | 'conveyor'
  | 'pallet-station'
  | 'tool'
  | 'sensor'
  | 'safety-device'

export type EquipmentRuntimeStatus = 'idle' | 'running' | 'paused' | 'faulted' | 'offline'

export interface Vector3Meters {
  x: number
  y: number
  z: number
}

export interface EulerRadians {
  x: number
  y: number
  z: number
}

export interface Transform {
  /** Identifier of the frame in which this pose is expressed. */
  frameId: string
  position: Vector3Meters
  rotation: EulerRadians
}

export interface EquipmentPort {
  id: string
  kind: 'material' | 'signal' | 'energy' | 'data' | 'safety'
  direction: 'input' | 'output' | 'bidirectional'
}

export interface EquipmentCapability {
  id: string
  description: string
}

export interface EquipmentDefinition {
  sdkVersion: typeof EQUIPMENT_SDK_VERSION
  id: string
  category: EquipmentCategory
  manufacturer?: string
  model?: string
  capabilities: EquipmentCapability[]
  ports: EquipmentPort[]
  dimensionsMeters?: Vector3Meters
}

export interface EquipmentInstance {
  id: string
  definitionId: string
  transform: Transform
  runtimeState?: EquipmentRuntimeState
}

export interface EquipmentRuntimeState {
  status: EquipmentRuntimeStatus
  updatedAt: string
  values?: Record<string, string | number | boolean | null>
}

export interface CellDefinition {
  sdkVersion: typeof EQUIPMENT_SDK_VERSION
  id: string
  name: string
  worldFrameId: string
  equipment: EquipmentInstance[]
}

/** Runtime behaviour stays independent from a scene framework or visual component. */
export interface EquipmentRuntimeAdapter {
  readonly equipmentId: string
  getRuntimeState(): EquipmentRuntimeState
}

/** Visual integration is optional and deliberately separate from runtime behaviour. */
export interface EquipmentVisualAdapter<TVisual = unknown> {
  readonly equipmentId: string
  attach(visual: TVisual): void
  detach(): void
}

/** Maps local runtime values to the backend telemetry boundary. */
export interface EquipmentTelemetryMapper {
  readonly equipmentId: string
  toTelemetry(): Record<string, string | number | boolean | null>
}

/** The motion surface required by machining workflows. */
export interface RobotMotionRuntime extends EquipmentRuntimeAdapter {
  readonly isMoving: boolean
  moveJoints(targetAngles: number[], duration?: number): void
  enqueueMove(targetAngles: number[], duration?: number): void
  clearCommands(): void
}

export interface CncRuntime extends EquipmentRuntimeAdapter {
  openForLoad(): void
  startMachining(): void
  completeUnload(): void
  getMachineState(): string
}

export interface PalletStationRuntime extends EquipmentRuntimeAdapter {
  getFirstStoppedPallet(): import('../simulation/PalletModels').PalletData | null
  setSlotVisible(palletId: string, row: number, col: number, visible: boolean): void
}
