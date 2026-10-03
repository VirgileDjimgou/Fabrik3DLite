/**
 * S68 coherent factory environment.
 *
 * Builds the shared industrial ground layer that standardizes the five flagship
 * cells: an epoxy/concrete floor, expansion joints, a safety-zone perimeter,
 * a pedestrian/operator access lane, a cable tray and a simple cell-identifier
 * plate. Equipment (cabinets, stack lights, guards, robot) stays owned by each
 * cell's equipment instances; the environment only supplies the coherent ground
 * and access context.
 *
 * Boundaries:
 * - Visual-only. It never becomes collision, runtime, scenario or telemetry
 *   truth; it declares no semantic anchors and no collision geometry.
 * - Deterministic: same options → identical mesh/material counts.
 * - Texture-free: it reuses the shared {@link MaterialId} vocabulary only.
 */

import * as THREE from 'three'
import { createMaterialPack, MATERIAL_IDS, type MaterialId } from './materialLibrary'

export const FACTORY_ENVIRONMENT_SCHEMA_VERSION = '1.0' as const

export type FactoryEnvironmentVariant = 'industrial-hall' | 'training-lab'

export interface FactoryEnvironmentSize {
  x: number
  z: number
}

export interface FactoryEnvironmentOptions {
  sizeMeters?: FactoryEnvironmentSize
  cellId?: string
  variant?: FactoryEnvironmentVariant
  includeFloor?: boolean
  includeExpansionJoints?: boolean
  includeSafetyPerimeter?: boolean
  includeAccessLane?: boolean
  includeCableTray?: boolean
  includeCellLabel?: boolean
}

export interface FactoryEnvironmentDefinition {
  schemaVersion: typeof FACTORY_ENVIRONMENT_SCHEMA_VERSION
  kind: 'framework-factory-environment'
  cellId: string
  variant: FactoryEnvironmentVariant
  sizeMeters: FactoryEnvironmentSize
  features: string[]
  materialIds: MaterialId[]
  textures: string[]
}

export const DEFAULT_FACTORY_ENVIRONMENT_SIZE: FactoryEnvironmentSize = Object.freeze({ x: 12, z: 10 })

export const FACTORY_ENVIRONMENT_TEXTURES: readonly string[] = Object.freeze([])

const MARKING_HEIGHT = 0.003
const LINE_THICKNESS = 0.05
const JOINT_SPACING = 2

function normalizedSize(size?: FactoryEnvironmentSize): FactoryEnvironmentSize {
  const x = size && Number.isFinite(size.x) && size.x > 0 ? size.x : DEFAULT_FACTORY_ENVIRONMENT_SIZE.x
  const z = size && Number.isFinite(size.z) && size.z > 0 ? size.z : DEFAULT_FACTORY_ENVIRONMENT_SIZE.z
  return { x, z }
}

function mesh(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  name: string,
  position: [number, number, number],
  rotationY = 0,
): THREE.Mesh {
  const object = new THREE.Mesh(geometry, material)
  object.name = name
  object.position.set(...position)
  if (rotationY) object.rotation.y = rotationY
  object.receiveShadow = true
  parent.add(object)
  return object
}

/**
 * Builds the shared environment group. Options default to the full
 * `industrial-hall` treatment; callers can trim features (e.g. a training lab).
 */
export function buildFactoryEnvironment(options: FactoryEnvironmentOptions = {}): THREE.Group {
  const size = normalizedSize(options.sizeMeters)
  const variant = options.variant ?? 'industrial-hall'
  const cellId = options.cellId ?? 'cell'
  const industrial = variant === 'industrial-hall'

  const includeFloor = options.includeFloor ?? true
  const includeExpansionJoints = options.includeExpansionJoints ?? industrial
  const includeSafetyPerimeter = options.includeSafetyPerimeter ?? true
  const includeAccessLane = options.includeAccessLane ?? industrial
  const includeCableTray = options.includeCableTray ?? industrial
  const includeCellLabel = options.includeCellLabel ?? true

  const group = new THREE.Group()
  group.name = `FactoryEnvironment:${cellId}`

  const pack = createMaterialPack()
  const materials = {
    floor: pack.get(industrial ? 'painted-floor' : 'concrete-floor'),
    joint: pack.get('dark-steel'),
    marking: pack.get('safety-yellow-line'),
    trayRail: pack.get('aluminium'),
    trayRung: pack.get('bare-steel'),
    label: pack.get('white-label'),
  }

  const features: string[] = []
  const used = new Set<MaterialId>()

  // ── Industrial floor ─────────────────────────────────────────────
  if (includeFloor) {
    const floorGeometry = new THREE.PlaneGeometry(size.x, size.z)
    const floor = mesh(group, floorGeometry, materials.floor, 'env:floor', [0, 0.0005, 0])
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    materials.floor.polygonOffset = true
    materials.floor.polygonOffsetFactor = 1
    materials.floor.polygonOffsetUnits = 1
    features.push('industrial-floor')
    used.add(industrial ? 'painted-floor' : 'concrete-floor')
  }

  // ── Expansion joints ─────────────────────────────────────────────
  if (includeExpansionJoints) {
    const jointX = new THREE.BoxGeometry(size.x, MARKING_HEIGHT, 0.02)
    const jointZ = new THREE.BoxGeometry(0.02, MARKING_HEIGHT, size.z)
    for (let x = -size.x / 2 + JOINT_SPACING; x < size.x / 2; x += JOINT_SPACING) {
      mesh(group, jointX, materials.joint, 'env:joint-x', [x, 0.001, 0])
    }
    for (let z = -size.z / 2 + JOINT_SPACING; z < size.z / 2; z += JOINT_SPACING) {
      mesh(group, jointZ, materials.joint, 'env:joint-z', [0, 0.001, z])
    }
    features.push('expansion-joints')
    used.add('dark-steel')
  }

  // ── Safety-zone perimeter ────────────────────────────────────────
  if (includeSafetyPerimeter) {
    const inset = 0.45
    const w = size.x - inset * 2
    const d = size.z - inset * 2
    const perimeterX = new THREE.BoxGeometry(w, MARKING_HEIGHT, LINE_THICKNESS)
    const perimeterZ = new THREE.BoxGeometry(LINE_THICKNESS, MARKING_HEIGHT, d)
    for (const z of [-d / 2, d / 2]) mesh(group, perimeterX, materials.marking, 'env:safety-line', [0, 0.004, z])
    for (const x of [-w / 2, w / 2]) mesh(group, perimeterZ, materials.marking, 'env:safety-line', [x, 0.004, 0])
    features.push('safety-zone-perimeter')
    used.add('safety-yellow-line')
  }

  // ── Pedestrian / operator access lane ────────────────────────────
  if (includeAccessLane) {
    const laneZ = size.z / 2 - 1.0
    const laneHalfWidth = 0.45
    const laneLength = size.x - 1.6
    const laneX = new THREE.BoxGeometry(laneLength, MARKING_HEIGHT, LINE_THICKNESS)
    for (const offset of [-laneHalfWidth, laneHalfWidth]) {
      mesh(group, laneX, materials.marking, 'env:access-lane', [0, 0.004, laneZ + offset])
    }
    const tick = new THREE.BoxGeometry(0.06, MARKING_HEIGHT, laneHalfWidth)
    for (let x = -laneLength / 2; x <= laneLength / 2; x += 0.9) {
      mesh(group, tick, materials.marking, 'env:access-lane-tick', [x, 0.004, laneZ])
    }
    features.push('operator-access-lane')
    used.add('safety-yellow-line')
  }

  // ── Cable tray ───────────────────────────────────────────────────
  if (includeCableTray) {
    const trayZ = -size.z / 2 + 0.7
    const trayLength = size.x - 1.0
    const railGeometry = new THREE.BoxGeometry(trayLength, 0.05, 0.05)
    for (const offset of [-0.18, 0.18]) {
      mesh(group, railGeometry, materials.trayRail, 'env:cable-tray-rail', [0, 0.1, trayZ + offset])
    }
    const rungGeometry = new THREE.BoxGeometry(0.05, 0.02, 0.4)
    for (let x = -trayLength / 2; x <= trayLength / 2; x += 0.5) {
      mesh(group, rungGeometry, materials.trayRung, 'env:cable-tray-rung', [x, 0.08, trayZ])
    }
    features.push('cable-tray')
    used.add('aluminium')
    used.add('bare-steel')
  }

  // ── Cell identifier plate ────────────────────────────────────────
  if (includeCellLabel) {
    const label = mesh(
      group,
      new THREE.BoxGeometry(0.8, 0.02, 0.3),
      materials.label,
      'env:cell-label',
      [size.x / 2 - 1.0, 0.02, -size.z / 2 + 1.0],
    )
    label.userData.cellId = cellId
    features.push('cell-identifier')
    used.add('white-label')
  }

  group.userData.environment = {
    schemaVersion: FACTORY_ENVIRONMENT_SCHEMA_VERSION,
    kind: 'framework-factory-environment',
    cellId,
    variant,
    sizeMeters: size,
    features,
    materialIds: [...used].sort(),
    textures: [...FACTORY_ENVIRONMENT_TEXTURES],
  } satisfies FactoryEnvironmentDefinition

  return group
}

/** Reads the declared definition back out of a built environment group. */
export function factoryEnvironmentDefinition(group: THREE.Object3D): FactoryEnvironmentDefinition | null {
  const value = group.userData?.environment as FactoryEnvironmentDefinition | undefined
  return value ?? null
}

/** Disposes every geometry and material owned by an environment group. */
export function disposeFactoryEnvironment(group: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    geometries.add(child.geometry)
    const list = Array.isArray(child.material) ? child.material : [child.material]
    for (const item of list) materials.add(item)
  })
  for (const geometry of geometries) geometry.dispose()
  for (const item of materials) item.dispose()
}

/** Material ids the environment builder may use; asserted against the library. */
export function factoryEnvironmentMaterialIds(): MaterialId[] {
  return [...new Set([
    'painted-floor', 'concrete-floor', 'dark-steel', 'safety-yellow-line',
    'aluminium', 'bare-steel', 'white-label',
  ] satisfies MaterialId[])].filter((id) => MATERIAL_IDS.includes(id))
}
