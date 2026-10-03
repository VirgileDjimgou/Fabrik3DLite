import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { measureSceneResources } from './sceneMetrics'
import { parseGlbArrayBuffer } from './ThreeGlbAssetLoader'
import type { EquipmentAssetManifest } from './types'
import {
  SCENARIO_EQUIPMENT_ASSET_IDS,
  SCENARIO_EQUIPMENT_CONTRACT_NODES,
  SCENARIO_EQUIPMENT_MANIFESTS,
  registerScenarioEquipmentAssets,
  scenarioProceduralFallbackId,
} from './scenarioAssets'
import { createIndustrialAssetRegistry } from './industrialAssets'
import { EquipmentAssetRuntime } from './EquipmentAssetRuntime'
import { ThreeGlbAssetLoader } from './ThreeGlbAssetLoader'
import { validateAssetPackage } from './assetPipeline'
import { resolveEquipmentAssetId } from '../visuals/materialFlowVisuals'

/**
 * S65 scenario-specific industrial asset coverage. The packages are regenerated
 * by `npm run assets:generate`; these tests re-read the committed packages from
 * disk so a stale manifest, a renamed animator node, a missing LOD, an
 * over-budget mesh or a lost license is caught before release.
 */

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

async function generatedManifest(assetId: string): Promise<EquipmentAssetManifest> {
  return JSON.parse(await readFile(path.join(packageDirectory(assetId), 'equipment.asset.json'), 'utf8')) as EquipmentAssetManifest
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

async function semanticIds(assetId: string, file: string): Promise<Set<string>> {
  const gltf = await parseGlb(path.join(packageDirectory(assetId), file))
  const ids = new Set<string>()
  gltf.scene.traverse((node) => {
    if (typeof node.userData?.semanticId === 'string') ids.add(node.userData.semanticId)
    if (node.name) ids.add(node.name)
  })
  return ids
}

const ASSET_IDS = Object.values(SCENARIO_EQUIPMENT_ASSET_IDS)

describe('S65 scenario asset pipeline', () => {
  it('covers every scenario equipment class with a generated GLB package', () => {
    expect(ASSET_IDS.length).toBeGreaterThanOrEqual(25)
    for (const definitionId of Object.keys(SCENARIO_EQUIPMENT_ASSET_IDS)) {
      expect(SCENARIO_EQUIPMENT_MANIFESTS[SCENARIO_EQUIPMENT_ASSET_IDS[definitionId]!], definitionId).toBeDefined()
    }
  })

  it('keeps the TypeScript manifests byte-identical to the generated packages', async () => {
    for (const assetId of ASSET_IDS) {
      expect(await generatedManifest(assetId), assetId).toEqual(SCENARIO_EQUIPMENT_MANIFESTS[assetId])
    }
  })

  it('recomputes every declared hash and keeps the primary inside its budget and bounds', async () => {
    for (const assetId of ASSET_IDS) {
      const manifest = SCENARIO_EQUIPMENT_MANIFESTS[assetId]!
      const directory = packageDirectory(assetId)
      for (const file of ['model.glb', 'lod/lod1.glb']) {
        const declared = file === 'model.glb' ? manifest.visual.glb.sha256 : manifest.visual.lods[0]!.glb.sha256
        expect(sha256(await readBytes(path.join(directory, file))), `${assetId}/${file}`).toBe(declared)
      }
      const primary = measureSceneResources((await parseGlb(path.join(directory, 'model.glb'))).scene)
      const lod = measureSceneResources((await parseGlb(path.join(directory, 'lod/lod1.glb'))).scene)
      expect(primary.triangles, assetId).toBeLessThanOrEqual(6000)
      expect(lod.triangles, assetId).toBeLessThanOrEqual(manifest.visual.lods[0]!.triangleBudget)
      expect(lod.triangles, assetId).toBeLessThan(primary.triangles)
      expect(primary.textures, assetId).toBe(0)
    }
  })

  it('preserves every animator semantic node in the primary and the LOD', async () => {
    for (const assetId of ASSET_IDS) {
      const contract = SCENARIO_EQUIPMENT_CONTRACT_NODES[assetId]!
      const primary = await semanticIds(assetId, 'model.glb')
      const lod = await semanticIds(assetId, 'lod/lod1.glb')
      for (const node of contract) {
        expect(primary.has(node), `${assetId} primary missing ${node}`).toBe(true)
        expect(lod.has(node), `${assetId} lod missing ${node}`).toBe(true)
      }
      for (const node of SCENARIO_EQUIPMENT_MANIFESTS[assetId]!.semanticNodes) {
        expect(primary.has(node.id), `${assetId} primary missing declared ${node.id}`).toBe(true)
      }
    }
  })

  it('validates every package with the shared pipeline (hashes, nodes, bounds, license)', async () => {
    for (const assetId of ASSET_IDS) {
      const manifest = SCENARIO_EQUIPMENT_MANIFESTS[assetId]!
      const directory = packageDirectory(assetId)
      const gltf = await parseGlb(path.join(directory, manifest.visual.glb.path))
      const hashes: Record<string, string> = {}
      for (const file of ['model.glb', 'lod/lod1.glb', 'thumbnail.svg']) {
        hashes[file] = sha256(await readBytes(path.join(directory, file)))
      }
      const result = validateAssetPackage({
        manifest,
        root: gltf.scene,
        hashes,
        requiredNodeIds: SCENARIO_EQUIPMENT_CONTRACT_NODES[assetId],
        maxPrimaryTriangles: 6000,
        checkBounds: true,
      })
      expect(result.issues, assetId).toEqual([])
      expect(result.ok, assetId).toBe(true)
    }
  })

  it('declares meters, Y-up, equipment-base origin and a license for every package', () => {
    for (const assetId of ASSET_IDS) {
      const manifest = SCENARIO_EQUIPMENT_MANIFESTS[assetId]!
      expect(manifest.coordinateSystem).toEqual({ units: 'meters', upAxis: 'Y', handedness: 'right', origin: 'equipment-base' })
      expect(manifest.license.name).toContain('Fabrik3D generated')
      expect(manifest.license.name).not.toMatch(/fanuc|abb|kuka|yaskawa|motoman|staubli/i)
      expect(manifest.collision.kind).toBe('box')
      expect(manifest.collision.dimensionsMeters).toBeDefined()
    }
  })

  it('registers every scenario GLB with a procedural fallback', () => {
    const registry = createIndustrialAssetRegistry()
    for (const assetId of ASSET_IDS) {
      const asset = registry.get(assetId)
      expect(asset.source, assetId).toBe('glb')
      if (asset.source === 'glb') {
        expect(asset.fallbackAssetId, assetId).toBe(scenarioProceduralFallbackId(assetId))
        expect(registry.has(asset.fallbackAssetId), assetId).toBe(true)
      }
    }
  })

  it('is idempotent when the scenario assets are registered twice', () => {
    const registry = createIndustrialAssetRegistry()
    expect(() => registerScenarioEquipmentAssets(registry)).not.toThrow()
  })
})

describe('S65 scenario asset runtime resolution', () => {
  function fakeLoader(failUrls: Set<string> = new Set()) {
    const loadAsync = vi.fn(async (url: string) => {
      if (failUrls.has(url)) throw new Error(`simulated 404 for ${url}`)
      const group = new THREE.Group()
      group.name = 'glb-root'
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshStandardMaterial())
      mesh.name = 'glb-mesh'
      group.add(mesh)
      return { scene: group } as GLTF
    })
    return new ThreeGlbAssetLoader({ loadAsync })
  }

  it('prefers the scenario GLB for a scenario equipment class', async () => {
    const runtime = new EquipmentAssetRuntime(createIndustrialAssetRegistry(), fakeLoader())
    const instance = await runtime.acquire(resolveEquipmentAssetId('storage-bin'), {
      proceduralFallback: () => new THREE.Group(),
      distanceMeters: 8,
    })
    expect(instance.source).toBe('glb')
    expect(instance.assetId).toBe('scenario-storage-bin-v1')
    instance.dispose()
  })

  it('prefers the professional robot GLB for the training manipulator', async () => {
    const runtime = new EquipmentAssetRuntime(createIndustrialAssetRegistry(), fakeLoader())
    const instance = await runtime.acquire(resolveEquipmentAssetId('fanuc-like-6axis'), {
      proceduralFallback: () => new THREE.Group(),
      distanceMeters: 8,
    })
    expect(instance.source).toBe('glb')
    expect(instance.assetId).toBe('generic-6axis-compact-v1')
    instance.dispose()
  })

  it('falls back deterministically to the procedural visual when every GLB level is missing', async () => {
    const registry = createIndustrialAssetRegistry()
    const assetId = resolveEquipmentAssetId('storage-bin')
    const asset = registry.get(assetId)
    const url = asset.source === 'glb' ? asset.url! : ''
    // Fail the primary and every LOD so the runtime exhausts the candidate order.
    const loadAsync = vi.fn(async (candidate: string) => {
      if (candidate.includes('scenario-storage-bin-v1')) throw new Error(`simulated 404 for ${candidate}`)
      const group = new THREE.Group()
      group.name = 'glb-root'
      return { scene: group } as GLTF
    })
    const runtime = new EquipmentAssetRuntime(registry, new ThreeGlbAssetLoader({ loadAsync }))
    const fallback = new THREE.Group()
    fallback.name = 'procedural-fallback'
    const instance = await runtime.acquire(assetId, { proceduralFallback: () => fallback, distanceMeters: 8 })
    expect(instance.source).toBe('procedural')
    expect(instance.root.name).toBe('procedural-fallback')
    expect(instance.diagnostic).toContain('All GLB levels failed')
    expect(runtime.diagnostics().fallbacks).toBe(1)
    expect(url).toBeTruthy()
    instance.dispose()
  })

  it('falls back deterministically when the GLB is corrupt', async () => {
    const registry = createIndustrialAssetRegistry()
    const assetId = resolveEquipmentAssetId('interlocked-gate')
    const asset = registry.get(assetId)
    const url = asset.source === 'glb' ? asset.url! : ''
    const loadAsync = vi.fn(async () => { throw new Error('corrupt GLB header') })
    const runtime = new EquipmentAssetRuntime(registry, new ThreeGlbAssetLoader({ loadAsync }))
    const fallback = new THREE.Group()
    fallback.name = 'procedural-fallback'
    const instance = await runtime.acquire(assetId, { proceduralFallback: () => fallback, distanceMeters: 8 })
    expect(instance.source).toBe('procedural')
    expect(instance.diagnostic).toContain('corrupt GLB header')
    expect(url).toBeTruthy()
    instance.dispose()
  })
})
