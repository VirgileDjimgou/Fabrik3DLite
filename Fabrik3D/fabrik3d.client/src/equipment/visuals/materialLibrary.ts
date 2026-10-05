/**
 * S68 shared PBR material vocabulary.
 *
 * One small, deterministic, license-safe material library used by the procedural
 * equipment visuals and the factory environment. It replaces the per-builder
 * ad-hoc `new THREE.MeshStandardMaterial({...})` calls with a single documented
 * vocabulary so a conveyor frame, a cabinet door and a factory floor cannot drift
 * into unrelated roughness/metalness values.
 *
 * Boundaries:
 * - Materials are **visual-only**. They never become collision, runtime, scenario
 *   or telemetry truth (`Definition ≠ Runtime ≠ Visual ≠ Collision ≠ Telemetry`).
 * - S72 replaces the earlier texture-free policy: relevant materials carry
 *   deterministic, repository-generated procedural `map`/`roughnessMap`/
 *   `normalMap` surfaces from `proceduralSurfaces.ts`. No external texture, atlas
 *   or scanned map is imported and none is committed as a binary. The provenance,
 *   resolution and estimated byte cost of every surface are recorded in
 *   `MATERIAL_TEXTURES`.
 * - `color` is authored as an sRGB hex; three.js color management converts it to
 *   the renderer's working space. `outputColorSpace`/tone mapping stay owned by
 *   `useThreeScene` and are deliberately unchanged.
 */

import * as THREE from 'three'
import {
  SURFACE_SPECS,
  getSurfaceTexture,
  isSurfaceId,
  surfaceEstimatedBytes,
  surfaceSpec,
  type SurfaceId,
} from './proceduralSurfaces'

export const MATERIAL_LIBRARY_SCHEMA_VERSION = '1.0' as const

/** Stable material identifiers of the shared industrial vocabulary. */
export type MaterialId =
  | 'painted-steel'
  | 'bare-steel'
  | 'aluminium'
  | 'rubber'
  | 'industrial-plastic'
  | 'glass'
  | 'safety-yellow'
  | 'safety-yellow-line'
  | 'painted-floor'
  | 'concrete-floor'
  | 'wood-cardboard'
  | 'screen-emissive'
  | 'dark-steel'
  | 'machine-body'
  | 'machine-trim'
  | 'machine-enclosure'
  | 'machine-chamber'
  | 'machine-panel'
  | 'hazard-amber'
  | 'signal-green'
  | 'signal-red'
  | 'signal-amber'
  | 'sensor-glass'
  | 'coolant'
  | 'warning-red'
  | 'white-label'
  | 'pallet-blue'
  | 'structural-steel'
  | 'work-light'
  | 'floor-marking-olive'

export interface MaterialProvenance {
  /** Where the appearance comes from. Always repository-generated data here. */
  source: string
  /** License of the appearance data. */
  license: string
}

/** Which procedural surfaces a material carries. All optional and visual-only. */
export interface MaterialSurfaceBinding {
  map?: SurfaceId
  roughnessMap?: SurfaceId
  normalMap?: SurfaceId
}

export interface MaterialDefinition {
  id: MaterialId
  label: string
  /** sRGB hex color; three.js color management converts it for the renderer. */
  color: number
  metalness: number
  roughness: number
  /** sRGB hex emissive color for self-lit indicators / screens. */
  emissive?: number
  emissiveIntensity?: number
  transparent?: boolean
  opacity?: number
  /** Visual role used only for documentation and tests. */
  usage: string
  provenance: MaterialProvenance
  /** Deterministic procedural surface maps attached by `createMaterial`. */
  surfaces?: MaterialSurfaceBinding
}

/**
 * Procedural texture registry (S72). It records every surface actually bound by a
 * material together with its resolution, estimated RGBA8 bytes, provenance and
 * license. Tests assert the registry matches the bindings and stays within the
 * documented budget; nothing is downloaded and no binary is committed.
 */
export interface MaterialTextureReference {
  id: SurfaceId
  kind: 'basecolor' | 'roughness' | 'metalness' | 'normal' | 'detail' | 'label' | 'screen' | 'decal'
  /** e.g. '256' (256 px) or '128x256'. */
  resolution: string
  /** Estimated RGBA8 base-level bytes (`width * height * 4`). */
  estimatedBytes: number
  source: string
  license: string
}

const GENERATED_PROVENANCE: MaterialProvenance = Object.freeze({
  source: 'Fabrik3D procedural PBR parameters (repository-generated, no external texture or mesh)',
  license: 'Fabrik3D generated; educational use',
})

/**
 * S72 procedural surface bindings. Only the materials whose flat look the sprint
 * targets carry surfaces; the rest stay parameter-only. Every surface is a
 * repository-generated, deterministic, license-safe map (see
 * `proceduralSurfaces.ts`).
 */
export const MATERIAL_SURFACE_BINDINGS: Readonly<Partial<Record<MaterialId, MaterialSurfaceBinding>>> = Object.freeze({
  'painted-floor': { map: 'painted-floor', roughnessMap: 'painted-floor-roughness' },
  'concrete-floor': { map: 'concrete-floor' },
  'safety-yellow-line': { map: 'safety-stripes' },
  'floor-marking-olive': { map: 'access-lane-marking' },
  'white-label': { map: 'equipment-signage' },
  'painted-steel': { map: 'painted-steel-wear' },
  'machine-body': { map: 'painted-steel-wear' },
  'machine-trim': { map: 'painted-steel-wear' },
  'bare-steel': { map: 'brushed-metal' },
  aluminium: { map: 'brushed-metal' },
  'wood-cardboard': { map: 'wood-cardboard-grain' },
  'screen-emissive': { map: 'hmi-screen' },
  'machine-panel': { map: 'hmi-screen' },
})

function resolveTextureKind(surfaceId: SurfaceId, binding: MaterialSurfaceBinding): MaterialTextureReference['kind'] {
  const spec = surfaceSpec(surfaceId)
  if (binding.roughnessMap === surfaceId) return 'roughness'
  if (binding.normalMap === surfaceId) return 'normal'
  if (spec.kind === 'label') return 'label'
  if (spec.kind === 'screen') return 'screen'
  if (spec.kind === 'decal') return 'decal'
  return 'basecolor'
}

function buildMaterialTextures(): MaterialTextureReference[] {
  const references = new Map<SurfaceId, MaterialTextureReference>()
  for (const binding of Object.values(MATERIAL_SURFACE_BINDINGS)) {
    if (!binding) continue
    for (const surfaceId of [binding.map, binding.roughnessMap, binding.normalMap]) {
      if (!surfaceId || references.has(surfaceId)) continue
      const spec = SURFACE_SPECS[surfaceId]
      references.set(surfaceId, {
        id: surfaceId,
        kind: resolveTextureKind(surfaceId, binding),
        resolution: `${spec.width}x${spec.height}`,
        estimatedBytes: surfaceEstimatedBytes(surfaceId),
        source: spec.provenance.source,
        license: spec.provenance.license,
      })
    }
  }
  return [...references.values()].sort((a, b) => a.id.localeCompare(b.id))
}

export const MATERIAL_TEXTURES: readonly MaterialTextureReference[] = Object.freeze(buildMaterialTextures())

const MATERIAL_BASE_DEFINITIONS: Readonly<Record<MaterialId, Omit<MaterialDefinition, 'surfaces'>>> = Object.freeze({
  'painted-steel': { id: 'painted-steel', label: 'Painted steel', color: 0x5d6b73, metalness: 0.65, roughness: 0.45, usage: 'Conveyor frames, guards and structural steel.', provenance: GENERATED_PROVENANCE },
  'bare-steel': { id: 'bare-steel', label: 'Bare steel', color: 0xaeb6bc, metalness: 0.85, roughness: 0.22, usage: 'Machined steel surfaces and exposed tooling.', provenance: GENERATED_PROVENANCE },
  aluminium: { id: 'aluminium', label: 'Aluminium', color: 0xc3c9cd, metalness: 0.72, roughness: 0.38, usage: 'Cable trays, profiles and light machine parts.', provenance: GENERATED_PROVENANCE },
  rubber: { id: 'rubber', label: 'Rubber', color: 0x1c2124, metalness: 0.05, roughness: 0.95, usage: 'Belt, seals, mats and cable sheathing.', provenance: GENERATED_PROVENANCE },
  'industrial-plastic': { id: 'industrial-plastic', label: 'Industrial plastic', color: 0x2b6f8f, metalness: 0.1, roughness: 0.8, usage: 'Sensor bodies, bins and machine covers.', provenance: GENERATED_PROVENANCE },
  glass: { id: 'glass', label: 'Glass', color: 0x2a3a44, metalness: 0.72, roughness: 0.12, transparent: true, opacity: 0.42, usage: 'Machine viewing windows and guard glazing.', provenance: GENERATED_PROVENANCE },
  'safety-yellow': { id: 'safety-yellow', label: 'Safety yellow', color: 0xd8a51f, metalness: 0.25, roughness: 0.6, usage: 'Guarding, pallets, jigs and hazard parts.', provenance: GENERATED_PROVENANCE },
  'safety-yellow-line': { id: 'safety-yellow-line', label: 'Safety yellow floor paint', color: 0xccaa00, metalness: 0.05, roughness: 0.72, emissive: 0x2b2200, emissiveIntensity: 0.35, usage: 'Floor safety-zone and walkway markings.', provenance: GENERATED_PROVENANCE },
  'painted-floor': { id: 'painted-floor', label: 'Painted industrial floor', color: 0x596064, metalness: 0.03, roughness: 0.94, usage: 'Epoxy factory floor.', provenance: GENERATED_PROVENANCE },
  'concrete-floor': { id: 'concrete-floor', label: 'Concrete floor', color: 0x3a3a4a, metalness: 0.05, roughness: 0.95, usage: 'Training-lab concrete floor.', provenance: GENERATED_PROVENANCE },
  'wood-cardboard': { id: 'wood-cardboard', label: 'Wood / cardboard', color: 0xc2a878, metalness: 0.02, roughness: 0.9, usage: 'Cartons and wooden packing / pallet stock.', provenance: GENERATED_PROVENANCE },
  'screen-emissive': { id: 'screen-emissive', label: 'Screen / emissive', color: 0x002211, metalness: 0.05, roughness: 0.35, emissive: 0x002211, emissiveIntensity: 0.5, usage: 'HMI and machine panel screens.', provenance: GENERATED_PROVENANCE },
  'dark-steel': { id: 'dark-steel', label: 'Dark steel', color: 0x2f3a40, metalness: 0.7, roughness: 0.5, usage: 'Legs, posts, frames and joints.', provenance: GENERATED_PROVENANCE },
  'machine-body': { id: 'machine-body', label: 'Machine body paint', color: 0xe8e9ea, metalness: 0.18, roughness: 0.44, usage: 'CNC / cabinet painted enclosure.', provenance: GENERATED_PROVENANCE },
  'machine-trim': { id: 'machine-trim', label: 'Machine trim', color: 0x333a3e, metalness: 0.62, roughness: 0.34, usage: 'Machine trim, handles and edge housings.', provenance: GENERATED_PROVENANCE },
  'machine-enclosure': { id: 'machine-enclosure', label: 'Light machine enclosure', color: 0xb9c2c8, metalness: 0.35, roughness: 0.55, usage: 'Cabinets, panels and light enclosures.', provenance: GENERATED_PROVENANCE },
  'machine-chamber': { id: 'machine-chamber', label: 'Machine working chamber', color: 0x181b1d, metalness: 0.22, roughness: 0.82, usage: 'Dark machine interior / chamber.', provenance: GENERATED_PROVENANCE },
  'machine-panel': { id: 'machine-panel', label: 'Machine control panel', color: 0x2a2f33, metalness: 0.34, roughness: 0.5, usage: 'Control panels and operator consoles.', provenance: GENERATED_PROVENANCE },
  'hazard-amber': { id: 'hazard-amber', label: 'Hazard amber', color: 0xd6a400, metalness: 0.2, roughness: 0.6, usage: 'Warning stripes and hazard markings.', provenance: GENERATED_PROVENANCE },
  'signal-green': { id: 'signal-green', label: 'Signal green', color: 0x2fa864, metalness: 0.1, roughness: 0.7, usage: 'State-bearing green indicators.', provenance: GENERATED_PROVENANCE },
  'signal-red': { id: 'signal-red', label: 'Signal red', color: 0xc0392b, metalness: 0.1, roughness: 0.7, usage: 'State-bearing red indicators.', provenance: GENERATED_PROVENANCE },
  'signal-amber': { id: 'signal-amber', label: 'Signal amber', color: 0xd8a51f, metalness: 0.1, roughness: 0.7, usage: 'State-bearing amber indicators.', provenance: GENERATED_PROVENANCE },
  'sensor-glass': { id: 'sensor-glass', label: 'Sensor glass', color: 0x9fe3ff, metalness: 0.1, roughness: 0.2, usage: 'Sensor lenses and light-curtain fields.', provenance: GENERATED_PROVENANCE },
  coolant: { id: 'coolant', label: 'Coolant fluid', color: 0x2f6f8f, metalness: 0.3, roughness: 0.4, emissive: 0x0b2533, emissiveIntensity: 0.35, usage: 'Coolant tank and nozzle.', provenance: GENERATED_PROVENANCE },
  'warning-red': { id: 'warning-red', label: 'Warning red', color: 0xd64040, metalness: 0.2, roughness: 0.5, emissive: 0x3a0a0a, emissiveIntensity: 0.5, usage: 'E-stop controls and stop buttons.', provenance: GENERATED_PROVENANCE },
  'white-label': { id: 'white-label', label: 'White label', color: 0xf4f6f7, metalness: 0.1, roughness: 0.7, usage: 'Identification and warning label plates.', provenance: GENERATED_PROVENANCE },
  'pallet-blue': { id: 'pallet-blue', label: 'Rack blue', color: 0x27557a, metalness: 0.42, roughness: 0.46, usage: 'Racks and pallet structures.', provenance: GENERATED_PROVENANCE },
  'structural-steel': { id: 'structural-steel', label: 'Structural steel', color: 0x39424b, metalness: 0.78, roughness: 0.33, usage: 'Racks, posts and structural steelwork.', provenance: GENERATED_PROVENANCE },
  'work-light': { id: 'work-light', label: 'Work light', color: 0xf6f3e6, metalness: 0.1, roughness: 0.4, emissive: 0xf6f3e6, emissiveIntensity: 0.85, usage: 'Machine work lights and luminaires.', provenance: GENERATED_PROVENANCE },
  'floor-marking-olive': { id: 'floor-marking-olive', label: 'Floor clear-zone paint', color: 0x556644, metalness: 0.05, roughness: 0.72, emissive: 0x121809, emissiveIntensity: 0.3, usage: 'Clearance / keep-clear floor markings.', provenance: GENERATED_PROVENANCE },
})

/**
 * The public library: every base definition merged with its optional S72 surface
 * binding. Keeping the merge here means a new material automatically exposes its
 * surfaces through `materialDefinition()`.
 */
export const MATERIAL_DEFINITIONS: Readonly<Record<MaterialId, MaterialDefinition>> = Object.freeze(
  Object.fromEntries(
    (Object.entries(MATERIAL_BASE_DEFINITIONS) as [MaterialId, Omit<MaterialDefinition, 'surfaces'>][])
      .map(([id, definition]) => {
        const surfaces = MATERIAL_SURFACE_BINDINGS[id]
        return [id, surfaces ? { ...definition, surfaces } : definition]
      }),
  ) as Record<MaterialId, MaterialDefinition>,
)

export const MATERIAL_IDS: readonly MaterialId[] = Object.freeze(
  Object.keys(MATERIAL_DEFINITIONS) as MaterialId[],
)

export function isMaterialId(value: string): value is MaterialId {
  return Object.prototype.hasOwnProperty.call(MATERIAL_DEFINITIONS, value)
}

/** Throws for an unknown id so a typo never silently renders a default material. */
export function materialDefinition(id: MaterialId): MaterialDefinition {
  const definition = MATERIAL_DEFINITIONS[id]
  if (!definition) throw new Error(`Unknown material id '${String(id)}'.`)
  return definition
}

export interface CreateMaterialOverrides {
  color?: number
  emissive?: number
  emissiveIntensity?: number
  transparent?: boolean
  opacity?: number
  metalness?: number
  roughness?: number
  side?: THREE.Side
  /** Set to false for an explicitly untextured variant (defaults to true). */
  textures?: boolean
}

/**
 * Creates one independent material from the shared definition. Every visual owns
 * its materials so a status-color change on one instance can never leak into
 * another (or into a later scene), and disposal stays deterministic.
 *
 * S72: when the definition declares procedural surfaces, the shared cached
 * `map`/`roughnessMap`/`normalMap` textures are attached. The textures are owned
 * by the surface cache (one GPU texture per surface), not by the material, so
 * `material.dispose()` is unchanged.
 */
export function createMaterial(id: MaterialId, overrides: CreateMaterialOverrides = {}): THREE.MeshStandardMaterial {
  const definition = materialDefinition(id)
  const material = new THREE.MeshStandardMaterial({
    color: overrides.color ?? definition.color,
    metalness: overrides.metalness ?? definition.metalness,
    roughness: overrides.roughness ?? definition.roughness,
    emissive: overrides.emissive ?? definition.emissive ?? 0x000000,
    emissiveIntensity: overrides.emissiveIntensity ?? definition.emissiveIntensity ?? 1,
    transparent: overrides.transparent ?? definition.transparent ?? false,
    opacity: overrides.opacity ?? definition.opacity ?? 1,
    side: overrides.side ?? THREE.FrontSide,
  })
  material.name = id
  material.userData.materialId = id
  material.userData.visualOnly = true
  if ((overrides.textures ?? true) && definition.surfaces) {
    applyMaterialSurfaces(material, definition.surfaces)
  }
  return material
}

/** Attaches the shared cached procedural surfaces declared by a binding. */
function applyMaterialSurfaces(material: THREE.MeshStandardMaterial, binding: MaterialSurfaceBinding): void {
  const surfaceIds: SurfaceId[] = []
  if (binding.map) {
    material.map = getSurfaceTexture(binding.map)
    material.map.wrapS = material.map.wrapT = THREE.RepeatWrapping
    surfaceIds.push(binding.map)
  }
  if (binding.roughnessMap) {
    material.roughnessMap = getSurfaceTexture(binding.roughnessMap)
    material.roughnessMap.wrapS = material.roughnessMap.wrapT = THREE.RepeatWrapping
    surfaceIds.push(binding.roughnessMap)
  }
  if (binding.normalMap) {
    material.normalMap = getSurfaceTexture(binding.normalMap)
    material.normalMap.wrapS = material.normalMap.wrapT = THREE.RepeatWrapping
    surfaceIds.push(binding.normalMap)
  }
  material.userData.surfaceIds = surfaceIds
  material.needsUpdate = true
}

/**
 * Per-visual material cache. One instance per id is returned, so every mesh of
 * the same role in one visual shares a material while distinct visuals stay
 * independent. This is the documented reuse mechanism that keeps material
 * allocation (and therefore GPU program/material memory) bounded.
 */
export interface MaterialPack {
  get(id: MaterialId): THREE.MeshStandardMaterial
  has(id: MaterialId): boolean
  readonly ids: readonly MaterialId[]
  readonly size: number
  dispose(): void
}

export function createMaterialPack(): MaterialPack {
  const cache = new Map<MaterialId, THREE.MeshStandardMaterial>()
  let disposed = false
  return {
    get(id) {
      if (disposed) throw new Error('Material pack is disposed.')
      let material = cache.get(id)
      if (!material) {
        material = createMaterial(id)
        cache.set(id, material)
      }
      return material
    },
    has: (id) => cache.has(id),
    get ids() { return [...cache.keys()] },
    get size() { return cache.size },
    dispose() {
      for (const material of cache.values()) material.dispose()
      cache.clear()
      disposed = true
    },
  }
}

export interface MaterialLibraryProblem {
  id: string
  message: string
}

/**
 * Structural validation of the whole library. Returns human-readable problems
 * instead of throwing so a test / diagnostic surface can report every issue at
 * once. It checks identity, physical ranges, texture-free policy, provenance and
 * the required vocabulary named by the S68 brief.
 */
export function validateMaterialLibrary(): MaterialLibraryProblem[] {
  const problems: MaterialLibraryProblem[] = []
  for (const id of MATERIAL_IDS) {
    const definition = MATERIAL_DEFINITIONS[id]
    if (!definition) {
      problems.push({ id, message: 'definition is missing' })
      continue
    }
    if (definition.id !== id) problems.push({ id, message: `id mismatch: ${definition.id}` })
    if (!Number.isInteger(definition.color) || definition.color < 0 || definition.color > 0xffffff) {
      problems.push({ id, message: `color must be a 24-bit sRGB hex, got ${String(definition.color)}` })
    }
    if (!(definition.metalness >= 0 && definition.metalness <= 1)) problems.push({ id, message: `metalness out of range: ${definition.metalness}` })
    if (!(definition.roughness >= 0 && definition.roughness <= 1)) problems.push({ id, message: `roughness out of range: ${definition.roughness}` })
    if (definition.emissiveIntensity !== undefined && !(definition.emissiveIntensity >= 0 && definition.emissiveIntensity <= 10)) {
      problems.push({ id, message: `emissiveIntensity out of range: ${definition.emissiveIntensity}` })
    }
    if (definition.opacity !== undefined && !(definition.opacity > 0 && definition.opacity <= 1)) {
      problems.push({ id, message: `opacity out of range: ${definition.opacity}` })
    }
    if (definition.transparent && definition.opacity === undefined) {
      problems.push({ id, message: 'transparent material must declare an opacity' })
    }
    if (!definition.provenance.source.trim()) problems.push({ id, message: 'provenance.source is empty' })
    if (!definition.provenance.license.trim()) problems.push({ id, message: 'provenance.license is empty' })
    if (definition.surfaces) {
      for (const [slot, surfaceId] of Object.entries(definition.surfaces)) {
        if (!isSurfaceId(surfaceId)) problems.push({ id, message: `surface ${slot} references unknown surface '${String(surfaceId)}'` })
      }
    }
  }
  for (const texture of MATERIAL_TEXTURES) {
    if (!texture.resolution) problems.push({ id: texture.id, message: 'texture resolution is empty' })
    if (!texture.source.trim()) problems.push({ id: texture.id, message: 'texture source is empty' })
    if (!texture.license.trim()) problems.push({ id: texture.id, message: 'texture license is empty' })
    if (!(texture.estimatedBytes > 0)) problems.push({ id: texture.id, message: `texture estimatedBytes invalid: ${texture.estimatedBytes}` })
  }
  return problems
}

/** Material ids required by the S68 brief's material vocabulary. */
export const REQUIRED_MATERIAL_VOCABULARY: readonly MaterialId[] = Object.freeze([
  'painted-steel',
  'bare-steel',
  'aluminium',
  'rubber',
  'industrial-plastic',
  'glass',
  'safety-yellow',
  'painted-floor',
  'wood-cardboard',
  'screen-emissive',
])

/**
 * Returns the material ids used by an object tree (from `userData.materialId`,
 * which `createMaterial` always sets). Useful for asserting that a visual is
 * built from the shared vocabulary and for measuring reuse.
 */
export function collectMaterialIds(root: THREE.Object3D): MaterialId[] {
  const ids = new Set<MaterialId>()
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    for (const material of materials) {
      const id = material.userData?.materialId
      if (typeof id === 'string' && isMaterialId(id)) ids.add(id)
    }
  })
  return [...ids].sort()
}
