/**
 * Stable equipment SDK contracts for Fabrik3D cells.
 *
 * Coordinates use a right-handed world frame: X right, Y up, Z forward.
 * All lengths are meters, rotations radians, time seconds and masses kilograms.
 */

import type { EquipmentSignalDeclaration } from '../signals/types'

export type { EquipmentSignalDeclaration } from '../signals/types'

export const EQUIPMENT_SDK_VERSION = '1.0' as const

export type EquipmentCategory =
  | 'robot'
  | 'machine'
  | 'conveyor'
  | 'pallet-station'
  | 'tool'
  | 'sensor'
  | 'safety-device'
  | 'infrastructure'

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
  /**
   * S73 optional anchor id that declares where this port mates physically.
   * When absent, a deterministic convention applies: material inputs default to
   * `anchor:in`, material outputs to `anchor:out` and everything else to
   * `anchor:placement`. Data-only ports never need a physical anchor.
   */
  anchorId?: string
}

/** A declared link between semantic equipment ports. It never references a mesh. */
export interface EquipmentConnection {
  id: string
  fromEquipmentId: string
  fromPortId: string
  toEquipmentId: string
  toPortId: string
  kind: EquipmentPort['kind']
}

export interface EquipmentCapability {
  id: string
  description: string
}

export interface EquipmentAnchor {
  id: string
  kind: 'placement' | 'material' | 'signal' | 'safety' | 'service'
  position: Vector3Meters
}

export interface EquipmentParameter {
  id: string
  label: string
  defaultValue: number | boolean | string
  unit?: string
}

/** Deliberately simple geometry; never inferred from a detailed visual mesh. */
export interface EquipmentCollisionProxy {
  kind: 'box' | 'cylinder'
  dimensionsMeters: Vector3Meters
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
  anchors?: EquipmentAnchor[]
  parameters?: EquipmentParameter[]
  collisionProxy?: EquipmentCollisionProxy
  /** Declared industrial I/O. Metadata only; runtime binding is hosted separately. */
  signals?: EquipmentSignalDeclaration[]
  /** Static means visual/layout-only; simulation-ready requires a trusted adapter. */
  runtimeCapability?: 'static' | 'simulation-ready'
}

/**
 * S73 declared attachment. Placement is derived from the target instance's
 * declared anchor/port instead of the local `transform`, while `transform`
 * remains the compatibility fallback when the attachment cannot be resolved.
 * Attachment changes placement only; it never changes collision, signal,
 * telemetry or runtime behaviour.
 */
export interface EquipmentAttachment {
  /** Id of the equipment instance this instance mounts on. */
  targetId: string
  /** Target anchor id. Mutually exclusive with `portId`. */
  anchorId?: string
  /** Target port id; the resolver requires a compatible mating port. Mutually exclusive with `anchorId`. */
  portId?: string
  /** Explicit compatible port on this instance. Defaults to the first compatible port. */
  sourcePortId?: string
  /** Local anchor on this instance that mates with the target. Defaults to `anchor:placement`. */
  sourceAnchorId?: string
  /** Extra rotation (radians) about Y applied relative to the target. Defaults to 0. */
  rotationOffsetRad?: number
  /** Declared target frame. Only the world/cell frame is supported today. */
  frameId?: string
}

export interface EquipmentInstance {
  id: string
  definitionId: string
  transform: Transform
  /** S73 declared attachment; `transform` is the fallback when resolution fails. */
  attachTo?: EquipmentAttachment
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
  connections?: EquipmentConnection[]
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
  /** Optional current joint readout used by safety checks. */
  getJointAngles?(): number[]
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
