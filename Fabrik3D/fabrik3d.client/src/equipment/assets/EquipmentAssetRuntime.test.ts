import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import {
  EquipmentAssetRegistry,
  EquipmentAssetRuntime,
  REFERENCE_6AXIS_GLB_MANIFEST,
  ThreeGlbAssetLoader,
  assetRuntimeCacheKey,
  candidateLevelOrder,
  measureSceneResources,
  sanitizeAssetDiagnostic,
} from './index'
import type { EquipmentAssetManifest } from './types'

const TEST_ID = 'test-runtime-asset'
const PROCEDURAL_ID = 'test-procedural'
const HASH = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const PRIMARY_URL = '/assets/test/model.glb'
const LOD1_URL = '/assets/test/lod/lod1.glb'

function buildManifest(lodCount: number): EquipmentAssetManifest {
  const base = structuredClone(REFERENCE_6AXIS_GLB_MANIFEST)
  return {
    ...base,
    id: TEST_ID,
    visual: {
      glb: { path: 'model.glb', sha256: HASH },
      lods: Array.from({ length: lodCount }, (_, index) => ({
        id: `lod${index + 1}`,
        glb: { path: `lod/lod${index + 1}.glb`, sha256: HASH },
        triangleBudget: 900 - index * 200,
      })),
    },
  }
}

function buildRegistry(manifest: EquipmentAssetManifest): EquipmentAssetRegistry {
  const registry = new EquipmentAssetRegistry()
  registry.register({ id: PROCEDURAL_ID, source: 'procedural', description: 'Procedural fallback.' })
  registry.register({
    id: manifest.id,
    source: 'glb',
    description: 'Runtime test asset.',
    manifest,
    url: PRIMARY_URL,
    fallbackAssetId: PROCEDURAL_ID,
  })
  return registry
}

function makeTemplate(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'runtime-root'
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial())
  mesh.name = 'visual-mesh'
  const joint = new THREE.Object3D()
  joint.name = 'joint:j1'
  group.add(mesh, joint)
  return group
}

function createLoader(failUrls: Set<string> = new Set()) {
  const calls: string[] = []
  const loadAsync = vi.fn(async (url: string) => {
    calls.push(url)
    if (failUrls.has(url)) throw new Error(`simulated 404 for ${url}`)
    return { scene: makeTemplate() } as GLTF
  })
  return { calls, loadAsync, loader: new ThreeGlbAssetLoader({ loadAsync }) }
}

function firstMesh(root: THREE.Object3D): THREE.Mesh {
  let found: THREE.Mesh | undefined
  root.traverse((child) => { if (!found && child instanceof THREE.Mesh) found = child })
  if (!found) throw new Error('No mesh in instance.')
  return found
}

describe('S54 EquipmentAssetRuntime', () => {
  it('physically loads once, coalesces concurrent requests and returns independent instances', async () => {
    const manifest = buildManifest(0)
    const { calls, loader } = createLoader()
    const runtime = new EquipmentAssetRuntime(buildRegistry(manifest), loader)

    const [first, second] = await Promise.all([
      runtime.acquire(TEST_ID, { proceduralFallback: () => new THREE.Group() }),
      runtime.acquire(TEST_ID, { proceduralFallback: () => new THREE.Group() }),
    ])
    expect(calls).toEqual([PRIMARY_URL])
    expect(first.root).not.toBe(second.root)
    expect(first.root.getObjectByName('joint:j1')).toBeTruthy()
    expect(second.root.getObjectByName('joint:j1')).toBeTruthy()

    const diagnostics = runtime.diagnostics()
    expect(diagnostics.physicalLoads).toBe(1)
    expect(diagnostics.cacheMisses).toBe(1)
    expect(diagnostics.cacheHits).toBeGreaterThanOrEqual(1)
    expect(diagnostics.liveInstances).toBe(2)
    expect(diagnostics.entries[0]?.refCount).toBe(2)

    first.dispose()
    second.dispose()
    expect(runtime.diagnostics().liveInstances).toBe(0)
  })

  it('isolates instance materials while sharing immutable geometry', async () => {
    const manifest = buildManifest(0)
    const { loader } = createLoader()
    const runtime = new EquipmentAssetRuntime(buildRegistry(manifest), loader)

    const first = await runtime.acquire(TEST_ID, { proceduralFallback: () => new THREE.Group() })
    const second = await runtime.acquire(TEST_ID, { proceduralFallback: () => new THREE.Group() })
    const firstMaterial = firstMesh(first.root).material as THREE.MeshStandardMaterial
    const secondMaterial = firstMesh(second.root).material as THREE.MeshStandardMaterial

    expect(firstMesh(first.root).geometry).toBe(firstMesh(second.root).geometry)
    expect(firstMaterial).not.toBe(secondMaterial)
    firstMaterial.color.setHex(0xff0000)
    expect(secondMaterial.color.getHex()).not.toBe(0xff0000)

    const disposeSpy = vi.spyOn(firstMaterial, 'dispose')
    first.dispose()
    expect(disposeSpy).toHaveBeenCalledTimes(1)
    second.dispose()
  })

  it('disposes cached GPU resources only after the last owner releases', async () => {
    const manifest = buildManifest(0)
    const { loader } = createLoader()
    const runtime = new EquipmentAssetRuntime(buildRegistry(manifest), loader)

    const first = await runtime.acquire(TEST_ID, { proceduralFallback: () => new THREE.Group() })
    const second = await runtime.acquire(TEST_ID, { proceduralFallback: () => new THREE.Group() })
    const geometry = firstMesh(first.root).geometry
    const disposeSpy = vi.spyOn(geometry, 'dispose')

    first.dispose()
    await runtime.disposeUnused()
    expect(disposeSpy).not.toHaveBeenCalled()
    expect(runtime.diagnostics().cacheEntries).toBe(1)

    second.dispose()
    await runtime.disposeUnused()
    expect(disposeSpy).toHaveBeenCalledTimes(1)
    expect(runtime.diagnostics().cacheEntries).toBe(0)
  })

  it('selects LOD levels through the centralized profile policy', async () => {
    const manifest = buildManifest(3)
    const { loader } = createLoader()
    const runtime = new EquipmentAssetRuntime(buildRegistry(manifest), loader)

    runtime.setQualityProfile('performance')
    expect(runtime.selectLod(TEST_ID, 1000)?.level).toBe(1)
    runtime.setQualityProfile('balanced')
    expect(runtime.selectLod(TEST_ID, 1000)?.level).toBe(2)
    runtime.setQualityProfile('quality')
    expect(runtime.selectLod(TEST_ID, 1000)?.level).toBe(3)
    expect(runtime.selectLod(TEST_ID, 1)?.level).toBe(0)
  })

  it('progressively falls back to the next valid level when a LOD is missing', async () => {
    const manifest = buildManifest(3)
    const { loader } = createLoader(new Set([LOD1_URL]))
    const runtime = new EquipmentAssetRuntime(buildRegistry(manifest), loader)

    const instance = await runtime.acquire(TEST_ID, { targetLevel: 1, proceduralFallback: () => new THREE.Group() })
    expect(instance.source).toBe('glb')
    expect(instance.level).toBe(2)
    expect(instance.lodId).toBe('lod2')
    expect(runtime.diagnostics().loadFailures).toBe(1)
    instance.dispose()
  })

  it('falls back to the procedural representation with a diagnostic when every GLB level fails', async () => {
    const manifest = buildManifest(3)
    const { loader } = createLoader(new Set([PRIMARY_URL, LOD1_URL, '/assets/test/lod/lod2.glb', '/assets/test/lod/lod3.glb']))
    const runtime = new EquipmentAssetRuntime(buildRegistry(manifest), loader)

    const instance = await runtime.acquire(TEST_ID, { targetLevel: 2, proceduralFallback: () => makeTemplate() })
    expect(instance.source).toBe('procedural')
    expect(instance.level).toBe(-1)
    expect(instance.diagnostic).toContain('All GLB levels failed')
    expect(runtime.diagnostics().fallbacks).toBe(1)
    instance.dispose()
  })

  it('keeps the working instance when a higher-quality upgrade fails, then succeeds when available', async () => {
    const manifest = buildManifest(3)
    const failing = new Set<string>([PRIMARY_URL])
    const { loader } = createLoader(failing)
    const runtime = new EquipmentAssetRuntime(buildRegistry(manifest), loader)

    const low = await runtime.acquire(TEST_ID, { targetLevel: 1, proceduralFallback: () => new THREE.Group() })
    expect(low.level).toBe(1)

    const failed = await runtime.upgrade(low, { targetLevel: 0 })
    expect(failed.upgraded).toBe(false)
    expect(failed.instance).toBe(low)
    expect(failed.diagnostic).toBeTruthy()
    expect(low.dispose).toBeTypeOf('function')

    failing.clear()
    const upgraded = await runtime.upgrade(low, { targetLevel: 0 })
    expect(upgraded.upgraded).toBe(true)
    expect(upgraded.instance.level).toBe(0)
    low.dispose()
    upgraded.instance.dispose()
  })

  it('progressively upgrades a procedural proxy to the primary GLB', async () => {
    const manifest = buildManifest(1)
    const failing = new Set<string>([PRIMARY_URL, LOD1_URL])
    const { loader } = createLoader(failing)
    const runtime = new EquipmentAssetRuntime(buildRegistry(manifest), loader)

    const proxy = await runtime.acquire(TEST_ID, { proceduralFallback: () => makeTemplate() })
    expect(proxy.source).toBe('procedural')

    failing.clear()
    const upgraded = await runtime.upgrade(proxy)
    expect(upgraded.upgraded).toBe(true)
    expect(upgraded.instance.source).toBe('glb')
    proxy.dispose()
    upgraded.instance.dispose()
  })

  it('returns a procedural asset directly without invoking the loader', async () => {
    const { loadAsync } = createLoader()
    const runtime = new EquipmentAssetRuntime(buildRegistry(buildManifest(0)), new ThreeGlbAssetLoader({ loadAsync }))
    const instance = await runtime.acquire(PROCEDURAL_ID, { proceduralFallback: () => makeTemplate() })
    expect(instance.source).toBe('procedural')
    expect(loadAsync).not.toHaveBeenCalled()
    expect(runtime.diagnostics().proceduralRequests).toBe(1)
    instance.dispose()
  })

  it('does not regress scene resources across repeated load/release cycles', async () => {
    const manifest = buildManifest(0)
    const { loadAsync, loader } = createLoader()
    const runtime = new EquipmentAssetRuntime(buildRegistry(manifest), loader)

    let baseline: ReturnType<typeof measureSceneResources> | undefined
    for (let cycle = 0; cycle < 25; cycle += 1) {
      const instance = await runtime.acquire(TEST_ID, { proceduralFallback: () => new THREE.Group() })
      const measured = measureSceneResources(instance.root)
      baseline ??= measured
      expect(measured).toEqual(baseline)
      instance.dispose()
    }
    expect(loadAsync).toHaveBeenCalledTimes(1)
    expect(runtime.diagnostics().physicalLoads).toBe(1)
    await runtime.disposeUnused()
    expect(runtime.diagnostics().cacheEntries).toBe(0)
  })

  it('builds stable cache keys and fallback order, and sanitizes diagnostics', () => {
    const manifest = buildManifest(2)
    const level = { id: 'lod1', level: 1, file: manifest.visual.lods[0]!.glb, url: LOD1_URL, triangleBudget: 900 }
    const key = assetRuntimeCacheKey(manifest, level)
    expect(key).toContain(TEST_ID)
    expect(key).toContain(manifest.version)
    expect(key).toContain('lod1')
    expect(key).toContain('decoder=none')

    expect(candidateLevelOrder(1, 3)).toEqual([1, 2, 0])
    expect(candidateLevelOrder(0, 3)).toEqual([0, 1, 2])

    const sanitized = sanitizeAssetDiagnostic('load failed https://example.test/secret.glb at C:\\Users\\dev\\model.glb')
    expect(sanitized).not.toContain('https://')
    expect(sanitized).not.toContain('example.test')
    expect(sanitized).not.toContain('C:\\Users')
    expect(sanitized).not.toContain('.glb')
  })
})
