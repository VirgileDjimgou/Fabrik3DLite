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
 * - S72: the floor, safety markings and cell-identifier plate carry deterministic
 *   procedural surface maps from the shared material vocabulary. Every texture is
 *   repository-generated at runtime; no image file is imported.
 */

import * as THREE from 'three'
import { createMaterialPack, MATERIAL_IDS, type MaterialId } from './materialLibrary'
import type { SurfaceId } from './proceduralSurfaces'

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
  /** S75: human-scale dressing props (mannequins, cabinets, extinguishers, signage, pipes). */
  includeDressing?: boolean
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

/** Procedural surfaces the environment builder can attach (S72). */
export const FACTORY_ENVIRONMENT_TEXTURES: readonly SurfaceId[] = Object.freeze([
  'painted-floor',
  'painted-floor-roughness',
  'concrete-floor',
  'safety-stripes',
  'equipment-signage',
  'brushed-metal',
  'painted-steel-wear',
])

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
 * S75: places one shared geometry/material as a single `InstancedMesh` for a
 * list of repeated static elements. This keeps the draw-call count at one per
 * repeated family instead of one per element. Returns `null` for an empty list
 * so no empty instance is added.
 */
function instanced(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  name: string,
  positions: readonly [number, number, number][],
): THREE.InstancedMesh | null {
  if (positions.length === 0) {
    geometry.dispose()
    return null
  }
  const object = new THREE.InstancedMesh(geometry, material, positions.length)
  object.name = name
  object.userData.semanticId = name
  object.userData.instanced = true
  object.receiveShadow = true
  const matrix = new THREE.Matrix4()
  positions.forEach((position, index) => {
    matrix.makeTranslation(position[0], position[1], position[2])
    object.setMatrixAt(index, matrix)
  })
  object.instanceMatrix.needsUpdate = true
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
  const includeDressing = options.includeDressing ?? true

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
    // S75 dressing materials.
    dressingSteel: pack.get('structural-steel'),
    dressingTrim: pack.get('machine-trim'),
    dressingHazard: pack.get('hazard-amber'),
    dressingRed: pack.get('warning-red'),
    dressingLabel: pack.get('white-label'),
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

  // ── Expansion joints (S75: one InstancedMesh per axis) ───────────
  if (includeExpansionJoints) {
    const jointX = new THREE.BoxGeometry(size.x, MARKING_HEIGHT, 0.02)
    const jointZ = new THREE.BoxGeometry(0.02, MARKING_HEIGHT, size.z)
    const xs: number[] = []
    for (let x = -size.x / 2 + JOINT_SPACING; x < size.x / 2; x += JOINT_SPACING) xs.push(x)
    const zs: number[] = []
    for (let z = -size.z / 2 + JOINT_SPACING; z < size.z / 2; z += JOINT_SPACING) zs.push(z)
    instanced(group, jointX, materials.joint, 'env:joint-x', xs.map((x) => [x, 0.001, 0] as [number, number, number]))
    instanced(group, jointZ, materials.joint, 'env:joint-z', zs.map((z) => [0, 0.001, z] as [number, number, number]))
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
    const ticks: [number, number, number][] = []
    for (let x = -laneLength / 2; x <= laneLength / 2; x += 0.9) ticks.push([x, 0.004, laneZ])
    instanced(group, tick, materials.marking, 'env:access-lane-tick', ticks)
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
    const rungs: [number, number, number][] = []
    for (let x = -trayLength / 2; x <= trayLength / 2; x += 0.5) rungs.push([x, 0.08, trayZ])
    instanced(group, rungGeometry, materials.trayRung, 'env:cable-tray-rung', rungs)
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

  // ── Human-scale dressing props (S75) ─────────────────────────────
  if (includeDressing) {
    buildDressing(group, size, materials, features, used)
  }

  group.userData.environment = {
    schemaVersion: FACTORY_ENVIRONMENT_SCHEMA_VERSION,
    kind: 'framework-factory-environment',
    cellId,
    variant,
    sizeMeters: size,
    features,
    materialIds: [...used].sort(),
    textures: [...collectEnvironmentSurfaces(group)].sort(),
  } satisfies FactoryEnvironmentDefinition

  return group
}

/**
 * S75 human-scale dressing. Adds silhouette mannequins, a control cabinet, an
 * extinguisher, signage boards and a pipe run using shared geometry and
 * materials. It is render-only, deterministic and never a collision authority.
 */
function buildDressing(
  group: THREE.Group,
  size: FactoryEnvironmentSize,
  materials: {
    dressingSteel: THREE.Material
    dressingTrim: THREE.Material
    dressingHazard: THREE.Material
    dressingRed: THREE.Material
    dressingLabel: THREE.Material
  },
  features: string[],
  used: Set<MaterialId>,
): void {
  const halfX = size.x / 2
  const halfZ = size.z / 2

  // Silhouette mannequins: a simple human-scale figure (1.75 m) that gives the
  // cell a readable scale reference. Two figures, one per access side.
  const mannequin = (name: string, x: number, z: number, rotationY: number) => {
    const figure = new THREE.Group()
    figure.name = name
    figure.userData.semanticId = name
    figure.position.set(x, 0, z)
    figure.rotation.y = rotationY
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.5, 4, 8), materials.dressingTrim)
    torso.position.set(0, 1.05, 0)
    torso.castShadow = true
    figure.add(torso)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), materials.dressingHazard)
    head.position.set(0, 1.55, 0)
    head.castShadow = true
    figure.add(head)
    for (const sign of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.55, 4, 8), materials.dressingSteel)
      leg.position.set(sign * 0.09, 0.42, 0)
      leg.castShadow = true
      figure.add(leg)
    }
    group.add(figure)
  }
  mannequin('env:dressing:mannequin-a', -halfX + 1.1, halfZ - 1.4, Math.PI)
  mannequin('env:dressing:mannequin-b', halfX - 1.1, -halfZ + 1.4, 0)

  // Control cabinet with a door seam and a label plate.
  const cabinet = new THREE.Group()
  cabinet.name = 'env:dressing:cabinet'
  cabinet.userData.semanticId = 'env:dressing:cabinet'
  cabinet.position.set(-halfX + 0.6, 0, -halfZ + 0.6)
  const cabinetBody = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.9, 0.5), materials.dressingSteel)
  cabinetBody.position.set(0, 0.95, 0)
  cabinetBody.castShadow = true
  cabinetBody.receiveShadow = true
  cabinet.add(cabinetBody)
  const cabinetDoor = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.7, 0.02), materials.dressingTrim)
  cabinetDoor.position.set(0, 0.95, 0.26)
  cabinet.add(cabinetDoor)
  const cabinetLabel = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.01), materials.dressingLabel)
  cabinetLabel.position.set(0, 1.6, 0.26)
  cabinet.add(cabinetLabel)
  group.add(cabinet)

  // Wall-mounted extinguisher on a small bracket.
  const extinguisher = new THREE.Group()
  extinguisher.name = 'env:dressing:extinguisher'
  extinguisher.userData.semanticId = 'env:dressing:extinguisher'
  extinguisher.position.set(halfX - 0.5, 0, -halfZ + 0.5)
  const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 12), materials.dressingRed)
  bottle.position.set(0, 0.9, 0)
  bottle.castShadow = true
  extinguisher.add(bottle)
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.12), materials.dressingTrim)
  bracket.position.set(0, 1.18, 0)
  extinguisher.add(bracket)
  group.add(extinguisher)

  // Signage boards: a hazard board and a keep-clear board.
  const signage = (name: string, x: number, z: number, rotationY: number, material: THREE.Material) => {
    const board = new THREE.Group()
    board.name = name
    board.userData.semanticId = name
    board.position.set(x, 0, z)
    board.rotation.y = rotationY
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.6, 0.05), materials.dressingSteel)
    post.position.set(0, 0.8, 0)
    board.add(post)
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.02), material)
    panel.position.set(0, 1.5, 0)
    panel.castShadow = true
    board.add(panel)
    group.add(board)
  }
  signage('env:dressing:signage-hazard', -halfX + 0.4, halfZ - 0.4, Math.PI / 2, materials.dressingHazard)
  signage('env:dressing:signage-clear', halfX - 0.4, halfZ - 0.4, -Math.PI / 2, materials.dressingLabel)

  // Overhead pipe run along the back wall with two support brackets.
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, size.x - 1.2, 12), materials.dressingSteel)
  pipe.name = 'env:dressing:pipe'
  pipe.userData.semanticId = 'env:dressing:pipe'
  pipe.rotation.z = Math.PI / 2
  pipe.position.set(0, 2.6, -halfZ + 0.35)
  pipe.castShadow = true
  group.add(pipe)
  for (const x of [-size.x / 4, size.x / 4]) {
    const support = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.05), materials.dressingTrim)
    support.position.set(x, 2.45, -halfZ + 0.35)
    group.add(support)
  }

  features.push('human-scale-dressing')
  used.add('structural-steel')
  used.add('machine-trim')
  used.add('hazard-amber')
  used.add('warning-red')
  used.add('white-label')
}

/** Collects the procedural surface ids actually attached to the built environment. */
function collectEnvironmentSurfaces(group: THREE.Object3D): Set<string> {
  const surfaces = new Set<string>()
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    for (const material of materials) {
      const ids = material.userData?.surfaceIds
      if (Array.isArray(ids)) for (const id of ids) if (typeof id === 'string') surfaces.add(id)
    }
  })
  return surfaces
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
    'structural-steel', 'machine-trim', 'hazard-amber', 'warning-red',
  ] satisfies MaterialId[])].filter((id) => MATERIAL_IDS.includes(id))
}
