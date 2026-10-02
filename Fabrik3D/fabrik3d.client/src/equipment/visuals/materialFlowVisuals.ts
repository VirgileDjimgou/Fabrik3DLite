/**
 * S58 procedural equipment visuals for scenario cells.
 *
 * These are deterministic, license-safe, repository-generated placeholder
 * visuals used until scenario-specific generated GLB packages arrive (S59/S60).
 * They are keyed by equipment definition class, never by scenario id, so a
 * scenario composes its 3D cell through data instead of conditional code.
 *
 * They are render-only: they never become authority for state, events,
 * collision or telemetry.
 */

import * as THREE from 'three'
import { MATERIAL_FLOW_EQUIPMENT_DEFINITIONS } from '../materialFlow'
import type { Vector3Meters } from '../types'
import type { EquipmentAssetRegistry } from '../assets/registry'
import {
  PROCEDURAL_CONVEYOR_ASSET_ID,
  PROCEDURAL_PALLET_STATION_ASSET_ID,
  PROCEDURAL_ROBOT_ASSET_ID,
} from '../assets/industrialAssets'

export const PROCEDURAL_MATERIAL_FLOW_ASSET_PREFIX = 'procedural-material-flow:' as const
export const GENERIC_EQUIPMENT_CLASS = 'generic' as const

const CONVEYOR_CLASSES = new Set([
  'straight-conveyor', 'curved-conveyor', 'roller-transfer', 'pneumatic-stop', 'diverter-pusher',
])
const PALLET_STATION_CLASSES = new Set([
  'infeed-buffer', 'outfeed-buffer', 'storage-bin', 'parts-rack', 'euro-pallet', 'carton',
  'pallet-nest', 'configurable-part',
])

/** Declared dimensions for infrastructure/safety classes (Y-up, metres). */
const INFRASTRUCTURE_DIMENSIONS: Readonly<Record<string, Vector3Meters>> = {
  'fence-panel': { x: 2.4, y: 2.1, z: 0.06 },
  'corner-post': { x: 0.1, y: 2.1, z: 0.1 },
  'kick-plate': { x: 2.4, y: 0.18, z: 0.07 },
  'interlocked-gate': { x: 1.2, y: 2.1, z: 0.08 },
  'light-curtain': { x: 1.4, y: 1.8, z: 0.08 },
  'area-scanner': { x: 0.25, y: 0.22, z: 0.25 },
  'emergency-stop': { x: 0.35, y: 1.15, z: 0.35 },
  'stack-light': { x: 0.15, y: 0.65, z: 0.15 },
  'robot-controller-cabinet': { x: 0.8, y: 1.8, z: 0.65 },
  'plc-cabinet': { x: 1, y: 2, z: 0.5 },
  'operator-hmi-pedestal': { x: 0.55, y: 1.35, z: 0.45 },
  'fanuc-like-6axis': { x: 0.7, y: 1.6, z: 0.7 },
  // S59 scenario cell infrastructure and safety props.
  'vision-inspection-station': { x: 0.9, y: 2.0, z: 0.7 },
  'safety-zone': { x: 2.5, y: 0.04, z: 2.5 },
}

const GENERIC_DIMENSIONS: Vector3Meters = { x: 0.5, y: 0.5, z: 0.5 }

const DIMENSIONS: Readonly<Record<string, Vector3Meters>> = {
  ...Object.fromEntries(MATERIAL_FLOW_EQUIPMENT_DEFINITIONS
    .filter(definition => definition.dimensionsMeters)
    .map(definition => [definition.id, definition.dimensionsMeters!])),
  ...INFRASTRUCTURE_DIMENSIONS,
}

/** All equipment classes with a declared procedural visual. */
export const KNOWN_EQUIPMENT_CLASSES: readonly string[] = Object.freeze(Object.keys(DIMENSIONS))

export function dimensionsFor(definitionId: string): Vector3Meters {
  return DIMENSIONS[definitionId] ?? GENERIC_DIMENSIONS
}

/** Shared asset id used by the `EquipmentAssetRuntime` for a class. */
export function resolveEquipmentAssetId(definitionId: string): string {
  if (definitionId === 'fanuc-like-6axis') return PROCEDURAL_ROBOT_ASSET_ID
  if (CONVEYOR_CLASSES.has(definitionId)) return PROCEDURAL_CONVEYOR_ASSET_ID
  if (PALLET_STATION_CLASSES.has(definitionId)) return PROCEDURAL_PALLET_STATION_ASSET_ID
  return `${PROCEDURAL_MATERIAL_FLOW_ASSET_PREFIX}${KNOWN_EQUIPMENT_CLASSES.includes(definitionId) ? definitionId : GENERIC_EQUIPMENT_CLASS}`
}

/**
 * Registers one procedural asset per known equipment class. Idempotent, so a
 * shared runtime can be prepared more than once without throwing.
 */
export function registerMaterialFlowProceduralAssets(registry: EquipmentAssetRegistry): void {
  const shared: ReadonlyArray<readonly [string, string]> = [
    [PROCEDURAL_ROBOT_ASSET_ID, 'Existing procedural six-axis robot fallback.'],
    [PROCEDURAL_CONVEYOR_ASSET_ID, 'Existing procedural conveyor fallback.'],
    [PROCEDURAL_PALLET_STATION_ASSET_ID, 'Existing procedural pallet fallback.'],
  ]
  for (const [assetId, description] of shared) {
    if (!registry.has(assetId)) registry.register({ id: assetId, source: 'procedural', description })
  }
  for (const definitionId of [...KNOWN_EQUIPMENT_CLASSES, GENERIC_EQUIPMENT_CLASS]) {
    const assetId = `${PROCEDURAL_MATERIAL_FLOW_ASSET_PREFIX}${definitionId}`
    if (!registry.has(assetId)) {
      registry.register({ id: assetId, source: 'procedural', description: `Procedural visual for equipment class '${definitionId}'.` })
    }
  }
}

/** Instantiates a deterministic procedural visual for an equipment class. */
export function createMaterialFlowVisual(definitionId: string, dimensions?: Vector3Meters): THREE.Group {
  const group = new THREE.Group()
  group.name = `equipment-visual:${definitionId}`
  group.userData.definitionId = definitionId
  group.userData.procedural = true
  const known = KNOWN_EQUIPMENT_CLASSES.includes(definitionId)
  group.userData.known = known
  if (!known) group.userData.diagnostic = `No procedural visual for '${definitionId}'; a generic block was composed.`
  buildInto(group, known ? definitionId : GENERIC_EQUIPMENT_CLASS, dimensions ?? dimensionsFor(definitionId))
  return group
}

type EquipmentPalette = {
  steelFrame: THREE.MeshStandardMaterial
  darkSteel: THREE.MeshStandardMaterial
  rubber: THREE.MeshStandardMaterial
  safetyYellow: THREE.MeshStandardMaterial
  signalGreen: THREE.MeshStandardMaterial
  signalRed: THREE.MeshStandardMaterial
  enclosure: THREE.MeshStandardMaterial
  plastic: THREE.MeshStandardMaterial
  sensorGlass: THREE.MeshStandardMaterial
}

function palette(): EquipmentPalette {
  const make = (color: number, metalness: number, roughness: number) =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness })
  return {
    steelFrame: make(0x5d6b73, 0.65, 0.45),
    darkSteel: make(0x2f3a40, 0.7, 0.5),
    rubber: make(0x1c2124, 0.05, 0.95),
    safetyYellow: make(0xd8a51f, 0.25, 0.6),
    signalGreen: make(0x2fa864, 0.1, 0.7),
    signalRed: make(0xc0392b, 0.1, 0.7),
    enclosure: make(0xb9c2c8, 0.35, 0.55),
    plastic: make(0x2b6f8f, 0.1, 0.8),
    sensorGlass: make(0x9fe3ff, 0.1, 0.2),
  }
}

function addBox(
  parent: THREE.Object3D,
  size: Vector3Meters,
  material: THREE.Material,
  name: string,
  position: Vector3Meters = { x: 0, y: size.y / 2, z: 0 },
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material)
  mesh.name = name
  mesh.userData.semanticId = name
  mesh.position.set(position.x, position.y, position.z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

function addCylinder(
  parent: THREE.Object3D,
  radius: number,
  height: number,
  material: THREE.Material,
  name: string,
  position: Vector3Meters,
  axis: 'x' | 'y' | 'z' = 'y',
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 16), material)
  mesh.name = name
  mesh.userData.semanticId = name
  mesh.rotation.z = axis === 'x' ? Math.PI / 2 : 0
  mesh.rotation.x = axis === 'z' ? Math.PI / 2 : 0
  mesh.position.set(position.x, position.y, position.z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

function buildInto(group: THREE.Group, definitionId: string, size: Vector3Meters): void {
  const p = palette()
  switch (definitionId) {
    case 'straight-conveyor':
      addBox(group, { x: size.x, y: 0.12, z: size.z }, p.steelFrame, 'frame', { x: 0, y: size.y - 0.06, z: 0 })
      addBox(group, { x: size.x, y: 0.04, z: size.z * 0.82 }, p.rubber, 'belt', { x: 0, y: size.y, z: 0 })
      for (const sign of [-1, 1]) addBox(group, { x: 0.08, y: size.y, z: size.z }, p.darkSteel, `leg-${sign}`, { x: sign * (size.x / 2 - 0.1), y: size.y / 2, z: 0 })
      return
    case 'curved-conveyor':
      addBox(group, { x: size.x, y: 0.12, z: size.z }, p.steelFrame, 'frame', { x: 0, y: size.y - 0.06, z: 0 })
      addBox(group, { x: size.x, y: 0.04, z: size.z * 0.8 }, p.rubber, 'belt', { x: 0, y: size.y, z: 0 })
      return
    case 'roller-transfer':
      addBox(group, { x: size.x, y: 0.1, z: size.z }, p.steelFrame, 'frame', { x: 0, y: size.y - 0.05, z: 0 })
      for (let i = 0; i < 5; i += 1) {
        addCylinder(group, 0.05, size.z * 0.9, p.darkSteel, `roller-${i}`, { x: -size.x / 2 + 0.15 + i * (size.x - 0.3) / 4, y: size.y, z: 0 }, 'z')
      }
      return
    case 'pneumatic-stop':
      addBox(group, { x: size.x, y: size.y, z: size.z }, p.steelFrame, 'body')
      addBox(group, { x: 0.06, y: size.y * 0.7, z: size.z * 0.7 }, p.safetyYellow, 'stop-flag', { x: 0, y: size.y * 0.65, z: 0 })
      return
    case 'diverter-pusher':
      addBox(group, { x: size.x, y: size.y, z: size.z }, p.steelFrame, 'body')
      addCylinder(group, 0.05, size.x * 0.8, p.darkSteel, 'piston', { x: 0, y: size.y * 0.55, z: 0 }, 'x')
      addBox(group, { x: 0.08, y: size.y * 0.6, z: size.z * 0.6 }, p.safetyYellow, 'pusher', { x: size.x * 0.45, y: size.y * 0.55, z: 0 })
      return
    case 'photoelectric-sensor':
      addBox(group, { x: size.x, y: size.y, z: size.z }, p.plastic, 'body')
      addCylinder(group, size.x * 0.25, 0.02, p.sensorGlass, 'lens', { x: 0, y: size.y / 2, z: size.z / 2 + 0.005 }, 'z')
      return
    case 'barcode-rfid-reader':
      addBox(group, { x: size.x, y: size.y, z: size.z }, p.darkSteel, 'body')
      addBox(group, { x: size.x * 0.7, y: 0.02, z: size.z * 0.7 }, p.sensorGlass, 'window', { x: 0, y: 0.01, z: 0 })
      return
    case 'infeed-buffer':
    case 'outfeed-buffer':
      addBox(group, { x: size.x, y: 0.08, z: size.z }, p.steelFrame, 'deck', { x: 0, y: size.y - 0.04, z: 0 })
      for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const) {
        addBox(group, { x: 0.06, y: size.y, z: 0.06 }, p.darkSteel, `leg-${sx}-${sz}`, { x: sx * (size.x / 2 - 0.08), y: size.y / 2, z: sz * (size.z / 2 - 0.08) })
      }
      return
    case 'storage-bin':
      addBox(group, { x: size.x, y: size.y, z: size.z }, p.plastic, 'bin')
      addBox(group, { x: size.x * 0.9, y: 0.02, z: size.z * 0.9 }, p.darkSteel, 'opening', { x: 0, y: size.y + 0.01, z: 0 })
      return
    case 'parts-rack':
      addBox(group, { x: size.x, y: 0.06, z: size.z }, p.steelFrame, 'base', { x: 0, y: 0.03, z: 0 })
      addBox(group, { x: size.x, y: 0.06, z: size.z }, p.steelFrame, 'shelf-1', { x: 0, y: size.y * 0.55, z: 0 })
      addBox(group, { x: size.x, y: 0.06, z: size.z }, p.steelFrame, 'shelf-2', { x: 0, y: size.y, z: 0 })
      for (const sign of [-1, 1]) addBox(group, { x: 0.06, y: size.y, z: 0.06 }, p.darkSteel, `post-${sign}`, { x: sign * (size.x / 2 - 0.05), y: size.y / 2, z: 0 })
      return
    case 'euro-pallet':
      addBox(group, { x: size.x, y: size.y * 0.3, z: size.z }, p.safetyYellow, 'pallet', { x: 0, y: size.y * 0.15, z: 0 })
      for (let i = -1; i <= 1; i += 1) addBox(group, { x: size.x, y: size.y * 0.7, z: 0.08 }, p.safetyYellow, `runner-${i}`, { x: 0, y: size.y * 0.35, z: i * size.z * 0.35 })
      return
    case 'carton':
      addBox(group, { x: size.x, y: size.y, z: size.z }, p.enclosure, 'carton')
      return
    case 'two-finger-gripper':
    case 'vacuum-gripper':
      addBox(group, { x: size.x, y: size.y, z: size.z }, p.darkSteel, 'tool-body', { x: 0, y: 0, z: 0 })
      addBox(group, { x: size.x * 0.6, y: 0.03, z: size.z * 0.6 }, p.safetyYellow, 'interface', { x: 0, y: size.y * 0.6, z: 0 })
      return
    case 'iso-flange-tcp':
      addCylinder(group, size.x * 0.5, size.y, p.darkSteel, 'flange', { x: 0, y: 0, z: 0 })
      return
    case 'tool-changer':
      addBox(group, { x: size.x, y: size.y, z: size.z }, p.steelFrame, 'body')
      addCylinder(group, size.x * 0.3, size.y * 1.2, p.darkSteel, 'spindle', { x: 0, y: 0, z: 0 })
      return
    case 'tool-rack':
      addBox(group, { x: size.x, y: size.y, z: size.z }, p.steelFrame, 'rack')
      for (let i = 0; i < 3; i += 1) addBox(group, { x: size.x * 0.2, y: 0.04, z: size.z * 0.6 }, p.safetyYellow, `slot-${i}`, { x: -size.x * 0.3 + i * size.x * 0.3, y: size.y * 0.7, z: 0 })
      return
    case 'part-presence-sensor':
    case 'grip-pressure-sensor':
      addBox(group, { x: size.x, y: size.y, z: size.z }, p.plastic, 'sensor')
      addCylinder(group, size.x * 0.2, 0.01, p.sensorGlass, 'port', { x: 0, y: 0, z: size.z / 2 + 0.005 }, 'z')
      return
    case 'pallet-nest':
      addBox(group, { x: size.x, y: size.y, z: size.z }, p.steelFrame, 'nest')
      addBox(group, { x: size.x * 0.7, y: 0.02, z: size.z * 0.7 }, p.safetyYellow, 'locator', { x: 0, y: size.y + 0.01, z: 0 })
      return
    case 'machining-fixture':
      addBox(group, { x: size.x, y: size.y, z: size.z }, p.darkSteel, 'fixture')
      addBox(group, { x: size.x * 0.5, y: 0.02, z: size.z * 0.5 }, p.steelFrame, 'workface', { x: 0, y: size.y + 0.01, z: 0 })
      return
    case 'toggle-clamp':
      addBox(group, { x: size.x, y: size.y * 0.4, z: size.z }, p.darkSteel, 'base', { x: 0, y: size.y * 0.2, z: 0 })
      addBox(group, { x: size.x * 0.3, y: size.y * 0.6, z: size.z * 0.3 }, p.safetyYellow, 'handle', { x: 0, y: size.y * 0.7, z: 0 })
      return
    case 'three-jaw-chuck':
      addCylinder(group, size.x * 0.5, size.y, p.darkSteel, 'chuck', { x: 0, y: 0, z: 0 })
      for (let i = 0; i < 3; i += 1) addBox(group, { x: size.x * 0.15, y: size.y * 0.4, z: size.z * 0.15 }, p.steelFrame, `jaw-${i}`, { x: Math.cos(i * 2.09) * size.x * 0.3, y: size.y * 0.6, z: Math.sin(i * 2.09) * size.z * 0.3 })
      return
    case 'workholding-adapter':
      addBox(group, { x: size.x, y: size.y, z: size.z }, p.steelFrame, 'adapter')
      return
    case 'configurable-part':
      addBox(group, { x: size.x, y: size.y, z: size.z }, p.enclosure, 'part')
      return
    case 'fence-panel':
    case 'kick-plate':
    case 'corner-post':
      addBox(group, { x: size.x, y: size.y, z: Math.max(size.z, 0.04) }, p.safetyYellow, 'panel')
      return
    case 'interlocked-gate':
      addBox(group, { x: size.x, y: size.y, z: Math.max(size.z, 0.04) }, p.safetyYellow, 'gate')
      addBox(group, { x: 0.12, y: 0.12, z: 0.06 }, p.signalRed, 'interlock', { x: size.x / 2 - 0.1, y: size.y * 0.6, z: 0.04 })
      return
    case 'light-curtain':
      addBox(group, { x: size.x, y: size.y, z: Math.max(size.z, 0.04) }, p.darkSteel, 'post-a', { x: -size.x / 2, y: size.y / 2, z: 0 })
      addBox(group, { x: 0.06, y: size.y * 0.8, z: Math.max(size.z, 0.04) }, p.sensorGlass, 'field', { x: 0, y: size.y / 2, z: 0 })
      addBox(group, { x: size.x, y: 0.08, z: 0.06 }, p.darkSteel, 'emitter', { x: 0, y: size.y, z: 0 })
      return
    case 'area-scanner':
      addCylinder(group, size.x * 0.5, size.y, p.darkSteel, 'scanner', { x: 0, y: 0, z: 0 })
      addBox(group, { x: size.x * 0.5, y: 0.02, z: size.z * 0.5 }, p.sensorGlass, 'window', { x: 0, y: size.y / 2, z: 0 })
      return
    case 'emergency-stop':
      addBox(group, { x: size.x, y: size.y, z: size.z }, p.darkSteel, 'pedestal')
      addCylinder(group, size.x * 0.4, 0.06, p.signalRed, 'button', { x: 0, y: size.y, z: 0 })
      return
    case 'stack-light':
      addCylinder(group, size.x * 0.45, size.y * 0.33, p.signalRed, 'red', { x: 0, y: size.y * 0.83, z: 0 })
      addCylinder(group, size.x * 0.45, size.y * 0.33, p.safetyYellow, 'amber', { x: 0, y: size.y * 0.5, z: 0 })
      addCylinder(group, size.x * 0.45, size.y * 0.33, p.signalGreen, 'green', { x: 0, y: size.y * 0.17, z: 0 })
      return
    case 'robot-controller-cabinet':
    case 'plc-cabinet':
      addBox(group, { x: size.x, y: size.y, z: size.z }, p.enclosure, 'cabinet')
      addBox(group, { x: size.x * 0.5, y: size.y * 0.15, z: 0.02 }, p.darkSteel, 'panel', { x: 0, y: size.y * 0.7, z: size.z / 2 + 0.01 })
      return
    case 'operator-hmi-pedestal':
      addBox(group, { x: size.x * 0.6, y: 0.9, z: size.z * 0.6 }, p.darkSteel, 'column', { x: 0, y: 0.45, z: 0 })
      addBox(group, { x: size.x, y: size.y * 0.3, z: 0.04 }, p.plastic, 'screen', { x: 0, y: 1.05, z: 0 })
      return
    case 'vision-inspection-station': {
      // Gantry over the conveyor: two legs, a top beam, a camera head and a
      // downward inspection light field. State-bearing nodes are 'camera' and
      // 'inspection-light'; the animator only changes their colour/emissive.
      const legHeight = size.y - 0.15
      for (const sign of [-1, 1]) {
        addBox(group, { x: 0.08, y: legHeight, z: 0.08 }, p.darkSteel, `leg-${sign}`, { x: sign * (size.x / 2 - 0.04), y: legHeight / 2, z: 0 })
      }
      addBox(group, { x: size.x, y: 0.12, z: size.z }, p.steelFrame, 'beam', { x: 0, y: legHeight + 0.06, z: 0 })
      addBox(group, { x: 0.22, y: 0.18, z: 0.22 }, p.darkSteel, 'camera', { x: 0, y: legHeight - 0.09, z: 0 })
      addCylinder(group, 0.07, 0.02, p.sensorGlass, 'lens', { x: 0, y: legHeight - 0.2, z: 0 })
      addBox(group, { x: 0.3, y: 0.02, z: 0.3 }, p.sensorGlass, 'inspection-light', { x: 0, y: legHeight - 0.24, z: 0 })
      return
    }
    case 'safety-zone':
      // Flat, clearly marked floor protective zone. It is a visual footprint and
      // never collision authority (collision stays in the safety layer).
      addBox(group, { x: size.x, y: 0.04, z: size.z }, p.safetyYellow, 'zone-floor', { x: 0, y: 0.02, z: 0 })
      addBox(group, { x: size.x, y: 0.05, z: 0.06 }, p.darkSteel, 'zone-edge-a', { x: 0, y: 0.025, z: -size.z / 2 })
      addBox(group, { x: size.x, y: 0.05, z: 0.06 }, p.darkSteel, 'zone-edge-b', { x: 0, y: 0.025, z: size.z / 2 })
      addBox(group, { x: 0.06, y: 0.05, z: size.z }, p.darkSteel, 'zone-edge-c', { x: -size.x / 2, y: 0.025, z: 0 })
      addBox(group, { x: 0.06, y: 0.05, z: size.z }, p.darkSteel, 'zone-edge-d', { x: size.x / 2, y: 0.025, z: 0 })
      return
    case 'fanuc-like-6axis':
      buildRobot(group, p)
      return
    default:
      addBox(group, { x: size.x, y: size.y, z: size.z }, p.enclosure, 'generic-block')
  }
}

function buildRobot(group: THREE.Group, p: EquipmentPalette): void {
  addCylinder(group, 0.22, 0.18, p.darkSteel, 'base', { x: 0, y: 0.09, z: 0 })
  addBox(group, { x: 0.22, y: 0.5, z: 0.22 }, p.safetyYellow, 'link-1', { x: 0, y: 0.44, z: 0 })
  addBox(group, { x: 0.18, y: 0.5, z: 0.18 }, p.safetyYellow, 'link-2', { x: 0, y: 0.95, z: 0.12 })
  addBox(group, { x: 0.14, y: 0.32, z: 0.14 }, p.darkSteel, 'wrist', { x: 0, y: 1.32, z: 0.18 })
  addBox(group, { x: 0.1, y: 0.08, z: 0.1 }, p.plastic, 'flange', { x: 0, y: 1.5, z: 0.18 })
}
