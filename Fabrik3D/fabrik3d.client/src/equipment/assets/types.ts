import type { EquipmentCategory, Transform, Vector3Meters } from '../types'

/** Version of the portable equipment visual package manifest. */
export const EQUIPMENT_ASSET_MANIFEST_VERSION = '1.0' as const

export type AssetSemanticNodeKind =
  | 'joint'
  | 'door'
  | 'anchor'
  | 'sensor'
  | 'tool'
  | 'signal'
  | 'motor'
  | 'fixture'

export type CollisionProxyKind = 'box' | 'capsule' | 'convex-hull' | 'mesh'

export interface AssetFileReference {
  /** Package-relative, POSIX-style path. */
  path: string
  /** Lowercase SHA-256 digest of the referenced file. */
  sha256: string
}

export interface AssetLod {
  id: string
  glb: AssetFileReference
  /** Declared upper triangle count, used by future performance tooling. */
  triangleBudget: number
}

export interface AssetSemanticNode {
  /** Stable Blender/GLB node name, e.g. `joint:j1`. */
  id: string
  kind: AssetSemanticNodeKind
  description?: string
}

export interface AssetAnchor {
  /** Stable semantic id, e.g. `anchor:material.in`. */
  id: string
  transform: Transform
  description?: string
}

export interface RobotAssetRig {
  /** The pivot contract consumed by visual adapters; angles stay in the controller. */
  joints: readonly { id: string, axis: 'x' | 'y' | 'z', direction: 1 | -1, parentId?: string }[]
  baseFrameNode: string
  flangeNode: string
  toolFrameNode: string
}

/**
 * Renderer-facing metadata. It deliberately contains no simulation state,
 * runtime rules, kinematics, or telemetry behavior.
 */
export interface EquipmentAssetManifest {
  schemaVersion: typeof EQUIPMENT_ASSET_MANIFEST_VERSION
  id: string
  equipmentDefinitionId: string
  category: EquipmentCategory
  version: string
  coordinateSystem: {
    units: 'meters'
    upAxis: 'Y'
    handedness: 'right'
    /** Origin is on the equipment base / floor mounting plane. */
    origin: 'equipment-base'
  }
  boundsMeters: Vector3Meters
  visual: {
    glb: AssetFileReference
    lods: AssetLod[]
  }
  collision: {
    id: string
    kind: CollisionProxyKind
    /** Dimensions of a deterministic analytic proxy, when applicable. */
    dimensionsMeters?: Vector3Meters
    /** Optional mesh proxy. Analytic proxies are defined by the runtime. */
    file?: AssetFileReference
  }
  semanticNodes: AssetSemanticNode[]
  anchors: AssetAnchor[]
  /** Optional generic robot visual rig declaration. */
  robotRig?: RobotAssetRig
  materials: string[]
  thumbnail?: AssetFileReference
  license: {
    name: string
    url?: string
  }
  integrity: AssetFileReference
}

export interface EquipmentAssetPackage {
  manifest: EquipmentAssetManifest
  /** Files supplied by the package, relative to its root. */
  files: readonly string[]
}

export class EquipmentAssetManifestError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid equipment asset manifest: ${issues.join(' ')}`)
    this.name = 'EquipmentAssetManifestError'
  }
}

const categories = new Set<EquipmentCategory>([
  'robot', 'machine', 'conveyor', 'pallet-station', 'tool', 'sensor', 'safety-device',
])
const semanticPrefixes: Record<AssetSemanticNodeKind, string> = {
  joint: 'joint:',
  door: 'door:',
  anchor: 'anchor:',
  sensor: 'sensor:',
  tool: 'tool:',
  signal: 'signal:',
  motor: 'motor:',
  fixture: 'fixture:',
}
const collisionKinds = new Set<CollisionProxyKind>(['box', 'capsule', 'convex-hull', 'mesh'])
const sha256Pattern = /^[a-f0-9]{64}$/

function nonEmpty(value: string, label: string, issues: string[]): void {
  if (!value.trim()) issues.push(`${label} is required.`)
}

function validPackagePath(path: string): boolean {
  return path.length > 0
    && !path.startsWith('/')
    && !path.includes('\\')
    && !path.includes('..')
    && !path.includes(':')
}

function validateFile(file: AssetFileReference | undefined, label: string, issues: string[]): void {
  if (!file) {
    issues.push(`${label} is required.`)
    return
  }
  if (!validPackagePath(file.path)) issues.push(`${label}.path must be a safe package-relative path.`)
  if (!sha256Pattern.test(file.sha256)) issues.push(`${label}.sha256 must be a lowercase SHA-256 digest.`)
}

function validateFinitePositive(value: number, label: string, issues: string[]): void {
  if (!Number.isFinite(value) || value <= 0) issues.push(`${label} must be a finite positive number.`)
}

/** Validates a parsed manifest before it can enter an equipment catalog. */
export function validateEquipmentAssetManifest(value: unknown): asserts value is EquipmentAssetManifest {
  const issues: string[] = []
  if (!value || typeof value !== 'object') {
    throw new EquipmentAssetManifestError(['Manifest must be an object.'])
  }
  const manifest = value as Partial<EquipmentAssetManifest>
  if (manifest.schemaVersion !== EQUIPMENT_ASSET_MANIFEST_VERSION) {
    issues.push(`schemaVersion must be '${EQUIPMENT_ASSET_MANIFEST_VERSION}'.`)
  }
  nonEmpty(manifest.id ?? '', 'id', issues)
  nonEmpty(manifest.equipmentDefinitionId ?? '', 'equipmentDefinitionId', issues)
  nonEmpty(manifest.version ?? '', 'version', issues)
  if (!manifest.category || !categories.has(manifest.category)) issues.push('category is invalid.')

  const coordinates = manifest.coordinateSystem
  if (!coordinates || coordinates.units !== 'meters' || coordinates.upAxis !== 'Y'
    || coordinates.handedness !== 'right' || coordinates.origin !== 'equipment-base') {
    issues.push('coordinateSystem must declare meters, Y-up, right-handed, equipment-base.')
  }

  const bounds = manifest.boundsMeters
  if (!bounds) issues.push('boundsMeters is required.')
  else {
    validateFinitePositive(bounds.x, 'boundsMeters.x', issues)
    validateFinitePositive(bounds.y, 'boundsMeters.y', issues)
    validateFinitePositive(bounds.z, 'boundsMeters.z', issues)
  }

  if (!manifest.visual) issues.push('visual is required.')
  else {
    validateFile(manifest.visual.glb, 'visual.glb', issues)
    const lodIds = new Set<string>()
    for (const lod of manifest.visual.lods ?? []) {
      nonEmpty(lod.id, 'visual.lods[].id', issues)
      if (lodIds.has(lod.id)) issues.push(`visual.lods contains duplicate id '${lod.id}'.`)
      lodIds.add(lod.id)
      validateFile(lod.glb, `visual.lods['${lod.id}'].glb`, issues)
      validateFinitePositive(lod.triangleBudget, `visual.lods['${lod.id}'].triangleBudget`, issues)
    }
  }

  const collision = manifest.collision
  if (!collision) issues.push('collision is required.')
  else {
    nonEmpty(collision.id, 'collision.id', issues)
    if (!collisionKinds.has(collision.kind)) issues.push('collision.kind is invalid.')
    if (collision.dimensionsMeters) {
      validateFinitePositive(collision.dimensionsMeters.x, 'collision.dimensionsMeters.x', issues)
      validateFinitePositive(collision.dimensionsMeters.y, 'collision.dimensionsMeters.y', issues)
      validateFinitePositive(collision.dimensionsMeters.z, 'collision.dimensionsMeters.z', issues)
    }
    if (collision.file) validateFile(collision.file, 'collision.file', issues)
  }

  const nodeIds = new Set<string>()
  for (const node of manifest.semanticNodes ?? []) {
    nonEmpty(node.id, 'semanticNodes[].id', issues)
    if (nodeIds.has(node.id)) issues.push(`semanticNodes contains duplicate id '${node.id}'.`)
    nodeIds.add(node.id)
    if (!(node.kind in semanticPrefixes)) issues.push(`semantic node '${node.id}' has an invalid kind.`)
    else if (!node.id.startsWith(semanticPrefixes[node.kind])) {
      issues.push(`semantic node '${node.id}' must use the '${semanticPrefixes[node.kind]}' namespace.`)
    }
  }

  const anchorIds = new Set<string>()
  for (const anchor of manifest.anchors ?? []) {
    nonEmpty(anchor.id, 'anchors[].id', issues)
    if (!anchor.id.startsWith('anchor:')) issues.push(`anchor '${anchor.id}' must use the 'anchor:' namespace.`)
    if (anchorIds.has(anchor.id)) issues.push(`anchors contains duplicate id '${anchor.id}'.`)
    anchorIds.add(anchor.id)
    const position = anchor.transform?.position
    const rotation = anchor.transform?.rotation
    if (!anchor.transform?.frameId?.trim() || !position || !rotation
      || ![position.x, position.y, position.z, rotation.x, rotation.y, rotation.z].every(Number.isFinite)) {
      issues.push(`anchor '${anchor.id}' requires a finite transform.`)
    }
  }

  if (manifest.robotRig) {
    const rig = manifest.robotRig
    const expected = ['joint:j1', 'joint:j2', 'joint:j3', 'joint:j4', 'joint:j5', 'joint:j6']
    if (rig.joints.length !== expected.length) issues.push('robotRig must declare exactly J1 through J6.')
    for (let index = 0; index < expected.length; index += 1) {
      const joint = rig.joints[index]
      if (!joint || joint.id !== expected[index]) issues.push(`robotRig joint ${index + 1} must be '${expected[index]}'.`)
      if (joint && !['x', 'y', 'z'].includes(joint.axis)) issues.push(`robotRig '${joint.id}' has an invalid axis.`)
      if (joint && joint.direction !== 1 && joint.direction !== -1) issues.push(`robotRig '${joint.id}' has an invalid direction.`)
      if (index > 0 && joint?.parentId !== expected[index - 1]) issues.push(`robotRig '${expected[index]}' must be parented to '${expected[index - 1]}'.`)
    }
    for (const node of [rig.baseFrameNode, rig.flangeNode, rig.toolFrameNode]) nonEmpty(node, 'robotRig frame node', issues)
  }

  const materialIds = new Set<string>()
  for (const material of manifest.materials ?? []) {
    nonEmpty(material, 'materials[]', issues)
    if (materialIds.has(material)) issues.push(`materials contains duplicate id '${material}'.`)
    materialIds.add(material)
  }
  if (materialIds.size === 0) issues.push('materials must contain at least one material id.')

  validateFile(manifest.thumbnail, 'thumbnail', issues)
  if (!manifest.license) issues.push('license is required.')
  else nonEmpty(manifest.license.name, 'license.name', issues)
  validateFile(manifest.integrity, 'integrity', issues)

  if (issues.length > 0) throw new EquipmentAssetManifestError(issues)
}

/** Returns all referenced files so importers can verify package completeness. */
export function manifestFiles(manifest: EquipmentAssetManifest): string[] {
  return [
    manifest.visual.glb.path,
    ...manifest.visual.lods.map((lod) => lod.glb.path),
    ...(manifest.collision.file ? [manifest.collision.file.path] : []),
    ...(manifest.thumbnail ? [manifest.thumbnail.path] : []),
    manifest.integrity.path,
  ]
}

/** Validates the manifest and that all of its declared files are present. */
export function validateEquipmentAssetPackage(value: EquipmentAssetPackage): void {
  validateEquipmentAssetManifest(value.manifest)
  const available = new Set(value.files)
  const missing = manifestFiles(value.manifest).filter((path) => !available.has(path))
  if (missing.length > 0) {
    throw new EquipmentAssetManifestError(missing.map((path) => `Package is missing '${path}'.`))
  }
}
