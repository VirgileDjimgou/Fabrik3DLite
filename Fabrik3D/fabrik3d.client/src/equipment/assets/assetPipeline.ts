import * as THREE from 'three'
import { manifestFiles, type EquipmentAssetManifest } from './types'
import { measureSceneResources, type SceneRenderMetrics } from './sceneMetrics'

/**
 * Renderer-independent validation shared by the generated-asset pipeline tests
 * and the engineering asset tooling. It never imports Node APIs so it stays
 * safe to bundle into the browser; callers inject the SHA-256 implementation.
 */
export type Sha256 = (bytes: Uint8Array) => string | Promise<string>

export interface AssetPackageValidationInput {
  manifest: EquipmentAssetManifest
  /** Parsed GLB scene for the primary visual. */
  root: THREE.Object3D
  /** Actual lowercase SHA-256 per package-relative path. */
  hashes: Readonly<Record<string, string>>
  /** Extra semantic ids that must exist but are not expressible in the manifest. */
  requiredNodeIds?: readonly string[]
  /** Optional declared triangle budget for the primary visual. */
  maxPrimaryTriangles?: number
  /** Allowed overshoot when comparing measured bounds to declared bounds (m). */
  boundsToleranceMeters?: number
  /** Set false for legacy assets whose declared bounds are documentation-only. */
  checkBounds?: boolean
}

export interface AssetPackageValidationResult {
  ok: boolean
  issues: string[]
  metrics: SceneRenderMetrics
  boundsMeters: { x: number; y: number; z: number }
}

function semanticIds(root: THREE.Object3D): Set<string> {
  const ids = new Set<string>()
  root.traverse((node) => {
    if (typeof node.userData?.semanticId === 'string') ids.add(node.userData.semanticId)
    if (node.name) ids.add(node.name)
  })
  return ids
}

export function measureBoundsMeters(root: THREE.Object3D): { x: number; y: number; z: number } {
  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  return { x: size.x, y: size.y, z: size.z }
}

/** Declared + injectable validation for one generated asset package. */
export function validateAssetPackage(input: AssetPackageValidationInput): AssetPackageValidationResult {
  const issues: string[] = []
  const tolerance = input.boundsToleranceMeters ?? 0.06
  const ids = semanticIds(input.root)

  for (const node of input.manifest.semanticNodes) {
    if (!ids.has(node.id)) issues.push(`Missing declared semantic node '${node.id}'.`)
  }
  for (const node of input.requiredNodeIds ?? []) {
    if (!ids.has(node)) issues.push(`Missing required runtime node '${node}'.`)
  }

  for (const path of manifestFiles(input.manifest)) {
    const actual = input.hashes[path]
    if (actual === undefined) {
      issues.push(`No computed hash for declared file '${path}'.`)
      continue
    }
    const declared = declaredHash(input.manifest, path)
    if (declared && declared !== actual) {
      issues.push(`Hash mismatch for '${path}': declared ${declared}, actual ${actual}.`)
    }
  }

  const metrics = measureSceneResources(input.root)
  if (input.maxPrimaryTriangles !== undefined && metrics.triangles > input.maxPrimaryTriangles) {
    issues.push(`Primary visual uses ${metrics.triangles} triangles, above the ${input.maxPrimaryTriangles} budget.`)
  }

  const boundsMeters = measureBoundsMeters(input.root)
  const declared = input.manifest.boundsMeters
  if (input.checkBounds !== false) {
    if (boundsMeters.x > declared.x + tolerance) issues.push(`Measured x bound ${boundsMeters.x.toFixed(3)} exceeds declared ${declared.x}.`)
    if (boundsMeters.y > declared.y + tolerance) issues.push(`Measured y bound ${boundsMeters.y.toFixed(3)} exceeds declared ${declared.y}.`)
    if (boundsMeters.z > declared.z + tolerance) issues.push(`Measured z bound ${boundsMeters.z.toFixed(3)} exceeds declared ${declared.z}.`)
  }

  if (!input.manifest.license.name.trim()) issues.push('License metadata is required.')
  if (issues.length === 0 && input.hashes[input.manifest.integrity.path] !== input.manifest.integrity.sha256) {
    issues.push('Integrity hash does not match the primary visual file.')
  }

  return { ok: issues.length === 0, issues, metrics, boundsMeters }
}

/** Resolves the declared hash for a package-relative file, when known. */
export function declaredHash(manifest: EquipmentAssetManifest, path: string): string | undefined {
  if (manifest.visual.glb.path === path) return manifest.visual.glb.sha256
  const lod = manifest.visual.lods.find((candidate) => candidate.glb.path === path)
  if (lod) return lod.glb.sha256
  if (manifest.collision.file?.path === path) return manifest.collision.file.sha256
  if (manifest.thumbnail?.path === path) return manifest.thumbnail.sha256
  if (manifest.integrity.path === path) return manifest.integrity.sha256
  return undefined
}

/** Computes the actual hash map for every file the manifest references. */
export async function computeManifestHashes(
  manifest: EquipmentAssetManifest,
  read: (path: string) => Promise<Uint8Array>,
  sha256: Sha256,
): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {}
  for (const path of manifestFiles(manifest)) {
    hashes[path] = await sha256(await read(path))
  }
  return hashes
}
