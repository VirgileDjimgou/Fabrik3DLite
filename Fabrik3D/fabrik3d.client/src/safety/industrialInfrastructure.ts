import { EQUIPMENT_SDK_VERSION, type EquipmentDefinition, type EquipmentParameter, type EquipmentPort, type Vector3Meters } from '../equipment'
import type { SafetyVisualState } from './safetyVisualState'

export type IndustrialInfrastructureKind =
  | 'fence-panel' | 'corner-post' | 'kick-plate' | 'interlocked-gate'
  | 'light-curtain' | 'area-scanner' | 'emergency-stop' | 'stack-light'
  | 'robot-controller-cabinet' | 'plc-cabinet' | 'operator-hmi-pedestal'
  | 'utility-cabinet' | 'cable-tray' | 'pneumatic-service'

export interface InfrastructureAnchor { id: string; position: Vector3Meters }

/**
 * Registered industrial modules. Dimensions, ports and collision proxies are
 * data; their render meshes and runtime adapters remain independent.
 */
export const INDUSTRIAL_INFRASTRUCTURE_DEFINITIONS: readonly EquipmentDefinition[] = [
  safety('fence-panel', 'Fence panel', { x: 2.4, y: 2.1, z: 0.06 }, 'static'),
  safety('corner-post', 'Fence corner post', { x: 0.1, y: 2.1, z: 0.1 }, 'static'),
  safety('kick-plate', 'Fence kick plate', { x: 2.4, y: 0.18, z: 0.07 }, 'static'),
  safety('interlocked-gate', 'Interlocked access gate', { x: 1.2, y: 2.1, z: 0.08 }, 'simulation-ready', [{ id: 'interlock', kind: 'safety', direction: 'output' }], [{ id: 'gate-open', label: 'Gate open', defaultValue: false }]),
  safety('light-curtain', 'Light curtain', { x: 1.4, y: 1.8, z: 0.08 }, 'simulation-ready', [{ id: 'protective-field', kind: 'safety', direction: 'output' }], [{ id: 'field-height', label: 'Field height', defaultValue: 1.45, unit: 'm' }]),
  safety('area-scanner', 'Safety area scanner', { x: 0.25, y: 0.22, z: 0.25 }, 'simulation-ready', [{ id: 'protective-zone', kind: 'safety', direction: 'output' }], [{ id: 'scan-range', label: 'Scan range', defaultValue: 2.5, unit: 'm' }]),
  safety('emergency-stop', 'Pedestal emergency stop', { x: 0.35, y: 1.15, z: 0.35 }, 'simulation-ready', [{ id: 'emergency-stop', kind: 'safety', direction: 'output' }]),
  safety('stack-light', 'Three-colour stack light', { x: 0.15, y: 0.65, z: 0.15 }, 'simulation-ready', [{ id: 'status', kind: 'signal', direction: 'input' }], [{ id: 'state', label: 'State', defaultValue: 'safe' }]),
  infrastructure('robot-controller-cabinet', 'Robot controller cabinet', { x: 0.8, y: 1.8, z: 0.65 }),
  infrastructure('plc-cabinet', 'PLC and electrical cabinet', { x: 1, y: 2, z: 0.5 }),
  infrastructure('operator-hmi-pedestal', 'Operator HMI pedestal', { x: 0.55, y: 1.35, z: 0.45 }),
  infrastructure('utility-cabinet', 'Utility cabinet', { x: 0.7, y: 1.6, z: 0.55 }),
  infrastructure('cable-tray', 'Cable tray', { x: 2, y: 0.12, z: 0.28 }),
  infrastructure('pneumatic-service', 'Pneumatic service unit', { x: 0.35, y: 0.7, z: 0.28 }),
]

export const INFRASTRUCTURE_ANCHORS: readonly InfrastructureAnchor[] = [
  { id: 'anchor:fence.start', position: { x: -4.8, y: 0, z: -3.6 } },
  { id: 'anchor:fence.gate', position: { x: 0, y: 0, z: 4.7 } },
  { id: 'anchor:operator.station', position: { x: 3.8, y: 0, z: 3.1 } },
]

export function nearestInfrastructureAnchor(position: Vector3Meters, toleranceMeters = 0.25): InfrastructureAnchor | null {
  const candidates = INFRASTRUCTURE_ANCHORS
    .map(anchor => ({ anchor, distance: Math.hypot(position.x - anchor.position.x, position.y - anchor.position.y, position.z - anchor.position.z) }))
    .filter(candidate => candidate.distance <= toleranceMeters)
    .sort((a, b) => a.distance - b.distance || a.anchor.id.localeCompare(b.anchor.id))
  return candidates[0]?.anchor ?? null
}

/** Visual status only: it is not a safety controller or certification claim. */
export function infrastructureState(cncState: string, online: boolean, emergencyStop = false, gateOpen = false): SafetyVisualState {
  if (!online) return 'offline'
  if (emergencyStop) return 'fault'
  if (gateOpen || cncState === 'LOADING' || cncState === 'UNLOADING') return 'warning'
  if (cncState === 'MACHINING') return 'running'
  return 'safe'
}

function safety(id: IndustrialInfrastructureKind, description: string, dimensionsMeters: Vector3Meters, runtimeCapability: 'static' | 'simulation-ready', ports: EquipmentPort[] = [], parameters: EquipmentParameter[] = []): EquipmentDefinition {
  return {
    sdkVersion: EQUIPMENT_SDK_VERSION, id, category: 'safety-device', capabilities: [{ id, description }], ports, dimensionsMeters,
    collisionProxy: { kind: 'box', dimensionsMeters }, runtimeCapability,
    anchors: [{ id: 'anchor:placement', kind: 'placement', position: { x: 0, y: 0, z: 0 } }], parameters,
  }
}

function infrastructure(id: IndustrialInfrastructureKind, description: string, dimensionsMeters: Vector3Meters): EquipmentDefinition {
  return {
    sdkVersion: EQUIPMENT_SDK_VERSION, id, category: 'infrastructure', capabilities: [{ id, description }], ports: [], dimensionsMeters,
    collisionProxy: { kind: 'box', dimensionsMeters }, runtimeCapability: 'static',
    anchors: [{ id: 'anchor:placement', kind: 'placement', position: { x: 0, y: 0, z: 0 } }],
  }
}
