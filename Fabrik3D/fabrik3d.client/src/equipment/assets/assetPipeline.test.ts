import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { EquipmentAssetManifest } from './types'
import {
  HERO_CELL_DRESSING_ASSET_ID,
  HERO_CELL_DRESSING_MANIFEST,
  HERO_CNC_CONTRACT_NODES,
  HERO_CNC_MACHINE_ASSET_ID,
  HERO_CNC_MACHINE_MANIFEST,
} from './heroAssets'
import { measureSceneResources } from './sceneMetrics'
import { parseGlbArrayBuffer } from './ThreeGlbAssetLoader'
import { computeManifestHashes, validateAssetPackage } from './assetPipeline'
import {
  INDUSTRIAL_CONVEYOR_ASSET_ID,
  INDUSTRIAL_CONVEYOR_MANIFEST,
  INDUSTRIAL_PALLET_STATION_ASSET_ID,
  INDUSTRIAL_PALLET_STATION_MANIFEST,
} from './industrialAssets'
import { PROFESSIONAL_ROBOT_ASSET_IDS, PROFESSIONAL_ROBOT_MANIFESTS } from './robotAssets'

function packageDirectory(assetId: string): string {
  return path.join(process.cwd(), 'public', 'assets', 'equipment', assetId)
}

async function readBytes(file: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(file))
}

async function parseGlb(file: string): Promise<GLTF> {
  const bytes = await readBytes(file)
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return parseGlbArrayBuffer(copy.buffer)
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

async function validatePackage(assetId: string, manifest: EquipmentAssetManifest, options: {
  requiredNodeIds?: readonly string[]
  maxPrimaryTriangles?: number
  checkBounds?: boolean
} = {}) {
  const directory = packageDirectory(assetId)
  const gltf = await parseGlb(path.join(directory, manifest.visual.glb.path))
  const hashes = await computeManifestHashes(
    manifest,
    (relative) => readBytes(path.join(directory, relative)),
    sha256,
  )
  return validateAssetPackage({ manifest, root: gltf.scene, hashes, ...options })
}

describe('generated asset pipeline validation', () => {
  it('recomputes every declared hash for the hero CNC package', async () => {
    const result = await validatePackage(HERO_CNC_MACHINE_ASSET_ID, HERO_CNC_MACHINE_MANIFEST, {
      requiredNodeIds: HERO_CNC_CONTRACT_NODES,
      maxPrimaryTriangles: 16_000,
      checkBounds: true,
    })
    expect(result.issues).toEqual([])
    expect(result.ok).toBe(true)
  })

  it('recomputes every declared hash for the hero cell dressing package', async () => {
    const result = await validatePackage(HERO_CELL_DRESSING_ASSET_ID, HERO_CELL_DRESSING_MANIFEST, {
      maxPrimaryTriangles: 12_000,
      checkBounds: true,
    })
    expect(result.issues).toEqual([])
    expect(result.ok).toBe(true)
  })

  it('keeps the hero CNC GLB node contract aligned with the runtime visual', async () => {
    const gltf = await parseGlb(path.join(packageDirectory(HERO_CNC_MACHINE_ASSET_ID), 'model.glb'))
    const ids = new Set<string>()
    gltf.scene.traverse((node) => {
      if (typeof node.userData?.semanticId === 'string') ids.add(node.userData.semanticId)
      if (node.name) ids.add(node.name)
    })
    for (const node of HERO_CNC_CONTRACT_NODES) expect(ids.has(node), `missing ${node}`).toBe(true)
    // The preserved robot/CNC contract nodes must never be renamed by the pipeline.
    expect(ids.has('door:loading')).toBe(true)
    expect(ids.has('spindle:main')).toBe(true)
    expect(ids.has('fixture:chuck')).toBe(true)
    expect(ids.has('axis:feed')).toBe(true)
    expect(ids.has('signal:stack-light')).toBe(true)
  })

  it('keeps the hero LOD inside its declared triangle budget and preserves the silhouette nodes', async () => {
    const gltf = await parseGlb(path.join(packageDirectory(HERO_CNC_MACHINE_ASSET_ID), 'lod', 'lod1.glb'))
    const metrics = measureSceneResources(gltf.scene)
    expect(metrics.triangles).toBeLessThanOrEqual(HERO_CNC_MACHINE_MANIFEST.visual.lods[0]!.triangleBudget)
    const ids = new Set<string>()
    gltf.scene.traverse((node) => {
      if (typeof node.userData?.semanticId === 'string') ids.add(node.userData.semanticId)
    })
    for (const node of ['door:loading', 'spindle:main', 'fixture:chuck', 'axis:feed', 'signal:stack-light']) {
      expect(ids.has(node), `LOD missing ${node}`).toBe(true)
    }
  })

  it('reports a hash mismatch instead of silently accepting a stale manifest', async () => {
    const directory = packageDirectory(HERO_CNC_MACHINE_ASSET_ID)
    const gltf = await parseGlb(path.join(directory, HERO_CNC_MACHINE_MANIFEST.visual.glb.path))
    const hashes = await computeManifestHashes(
      HERO_CNC_MACHINE_MANIFEST,
      (relative) => readBytes(path.join(directory, relative)),
      sha256,
    )
    const tampered = { ...hashes, [HERO_CNC_MACHINE_MANIFEST.visual.glb.path]: 'f'.repeat(64) }
    const result = validateAssetPackage({ manifest: HERO_CNC_MACHINE_MANIFEST, root: gltf.scene, hashes: tampered })
    expect(result.ok).toBe(false)
    expect(result.issues.some((issue) => issue.includes('Hash mismatch'))).toBe(true)
  })

  it('reports a missing semantic node instead of silently accepting an incomplete GLB', async () => {
    const directory = packageDirectory(HERO_CNC_MACHINE_ASSET_ID)
    const gltf = await parseGlb(path.join(directory, HERO_CNC_MACHINE_MANIFEST.visual.glb.path))
    const hashes = await computeManifestHashes(
      HERO_CNC_MACHINE_MANIFEST,
      (relative) => readBytes(path.join(directory, relative)),
      sha256,
    )
    const result = validateAssetPackage({
      manifest: HERO_CNC_MACHINE_MANIFEST,
      root: gltf.scene,
      hashes,
      requiredNodeIds: ['spindle:does-not-exist'],
    })
    expect(result.ok).toBe(false)
    expect(result.issues.some((issue) => issue.includes('spindle:does-not-exist'))).toBe(true)
  })

  it('validates the pre-existing conveyor, pallet and robot packages with the same rules', async () => {
    const conveyor = await validatePackage(INDUSTRIAL_CONVEYOR_ASSET_ID, INDUSTRIAL_CONVEYOR_MANIFEST, { checkBounds: false })
    expect(conveyor.issues).toEqual([])
    const pallet = await validatePackage(INDUSTRIAL_PALLET_STATION_ASSET_ID, INDUSTRIAL_PALLET_STATION_MANIFEST, { checkBounds: false })
    expect(pallet.issues).toEqual([])
    for (const id of Object.values(PROFESSIONAL_ROBOT_ASSET_IDS)) {
      const manifest = Object.values(PROFESSIONAL_ROBOT_MANIFESTS).find((candidate) => candidate.id === id)!
      const result = await validatePackage(id, manifest, { checkBounds: false })
      expect(result.issues, id).toEqual([])
    }
  })
})
