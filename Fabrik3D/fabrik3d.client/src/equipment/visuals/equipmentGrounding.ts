/**
 * S72 equipment grounding helpers.
 *
 * Two visual-only concerns are centralized here so every renderer path behaves
 * the same:
 *
 * 1. **Shadow flags.** `applyEquipmentShadowFlags` marks loaded GLB instances and
 *    procedural fallbacks as shadow casters/receivers. Before S72 only the legacy
 *    robot component set these flags, so most GLB equipment neither cast nor
 *    received shadows. The loader/runtime call this helper, and components may
 *    call it explicitly after acquiring an instance.
 * 2. **Contact shadows.** `createContactShadow` is a cheap deterministic radial
 *    gradient decal on a transparent plane, placed just above the floor under an
 *    equipment root to anchor it visually.
 *
 * A third helper, `applyEquipmentSurfaceTextures`, attaches the S72 procedural
 * surface maps to generated label / signage / HMI-screen nodes of a loaded GLB so
 * those generated nodes also stop reading as flat primitives.
 *
 * Everything here is render-only: it never becomes collision geometry, runtime
 * state, scenario truth or telemetry.
 */

import * as THREE from 'three'
import { getContactShadowTexture, getSurfaceTexture, type SurfaceId } from './proceduralSurfaces'

export const EQUIPMENT_GROUNDING_SCHEMA_VERSION = '1.0' as const

export interface EquipmentShadowOptions {
  cast?: boolean
  receive?: boolean
}

/**
 * Sets `castShadow`/`receiveShadow` on every mesh under a root. Idempotent, so a
 * component can safely re-apply it after the runtime already did.
 */
export function applyEquipmentShadowFlags(root: THREE.Object3D, options: EquipmentShadowOptions = {}): THREE.Object3D {
  const cast = options.cast ?? true
  const receive = options.receive ?? true
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.castShadow = cast
    child.receiveShadow = receive
  })
  return root
}

export interface ContactShadowOptions {
  /** Decal radius in metres (the plane is `2 * radius` wide). */
  radius?: number
  opacity?: number
  /** Local Y offset above the floor; small enough to avoid z-fighting. */
  elevation?: number
  name?: string
}

export const DEFAULT_CONTACT_SHADOW_RADIUS_METERS = 0.7
export const DEFAULT_CONTACT_SHADOW_OPACITY = 0.34

/**
 * Builds a deterministic contact-shadow decal. It owns its geometry and material
 * (dispose with {@link disposeContactShadow}) but shares the cached procedural
 * decal texture, so many decals cost one texture.
 */
export function createContactShadow(options: ContactShadowOptions = {}): THREE.Mesh {
  const radius = options.radius ?? DEFAULT_CONTACT_SHADOW_RADIUS_METERS
  const geometry = new THREE.PlaneGeometry(radius * 2, radius * 2)
  const material = new THREE.MeshBasicMaterial({
    map: getContactShadowTexture(),
    transparent: true,
    opacity: options.opacity ?? DEFAULT_CONTACT_SHADOW_OPACITY,
    depthWrite: false,
    toneMapped: false,
    color: 0x000000,
  })
  const name = options.name ?? 'grounding:contact-shadow'
  material.name = name
  material.userData.visualOnly = true
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = name
  mesh.userData.semanticId = name
  mesh.userData.visualOnly = true
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(0, options.elevation ?? 0.012, 0)
  mesh.castShadow = false
  mesh.receiveShadow = false
  // Behind opaque floor markings but above the floor plane.
  mesh.renderOrder = 1
  return mesh
}

/** Adds a contact-shadow decal as a child of a parent so it follows its transform. */
export function attachContactShadow(parent: THREE.Object3D, options: ContactShadowOptions = {}): THREE.Mesh {
  const mesh = createContactShadow(options)
  parent.add(mesh)
  return mesh
}

/** Disposes the decal's own geometry/material. The shared texture is not disposed. */
export function disposeContactShadow(mesh: THREE.Object3D): void {
  mesh.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.geometry.dispose()
    const material = child.material
    if (Array.isArray(material)) material.forEach((item) => item.dispose())
    else material.dispose()
  })
}

/** Surface assigned to a generated semantic node, or null when it carries no surface. */
export function surfaceForSemanticNode(name: string): SurfaceId | null {
  const normalized = name.toLowerCase()
  if (normalized.includes('label') || normalized.includes('signage') || normalized.includes('plaque')) {
    return normalized.includes('warning') ? 'warning-label' : 'equipment-signage'
  }
  if (normalized.includes('screen') || normalized.includes('hmi') || normalized.includes('display')) {
    return 'hmi-screen'
  }
  return null
}

/**
 * Attaches the procedural surface maps to generated label/signage/HMI nodes of an
 * already-cloned GLB instance. Shared materials are only configured once and a
 * material that already carries a map (for example a future authored atlas) is
 * left untouched. Returns the number of distinct materials it textured.
 */
export function applyEquipmentSurfaceTextures(root: THREE.Object3D): number {
  const seen = new Set<THREE.Material>()
  let textured = 0
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const name = typeof child.userData?.semanticId === 'string' ? child.userData.semanticId : child.name
    const surfaceId = surfaceForSemanticNode(name)
    if (!surfaceId) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    for (const material of materials) {
      if (seen.has(material)) continue
      seen.add(material)
      if (!(material instanceof THREE.MeshStandardMaterial) || material.map) continue
      material.map = getSurfaceTexture(surfaceId)
      material.needsUpdate = true
      material.userData.surfaceId = surfaceId
      material.userData.visualOnly = true
      textured += 1
    }
  })
  return textured
}
