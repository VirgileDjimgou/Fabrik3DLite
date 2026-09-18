import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import {
  EquipmentAssetRegistry,
  EquipmentVisualProvider,
  REFERENCE_6AXIS_GLB_MANIFEST,
  ThreeGlbAssetLoader,
  parseGlbArrayBuffer,
  referenceGlbArrayBuffer,
} from './index'

function testManifest(path = 'reference.glb') {
  return {
    ...structuredClone(REFERENCE_6AXIS_GLB_MANIFEST),
    visual: { ...structuredClone(REFERENCE_6AXIS_GLB_MANIFEST.visual), glb: { ...REFERENCE_6AXIS_GLB_MANIFEST.visual.glb, path } },
  }
}

describe('ThreeGlbAssetLoader', () => {
  it('caches one template, gives independent instances, and disposes unused resources', async () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const material = new THREE.MeshStandardMaterial()
    const template = new THREE.Group()
    template.add(new THREE.Mesh(geometry, material))
    const loadAsync = vi.fn(async () => ({ scene: template }) as GLTF)
    const loader = new ThreeGlbAssetLoader({ loadAsync })
    const asset = testManifest()

    const first = await loader.load(asset)
    const second = await loader.load(asset)
    expect(loadAsync).toHaveBeenCalledTimes(1)
    expect(first.root).not.toBe(second.root)

    const host = new THREE.Group()
    host.add(first.root)
    first.dispose()
    expect(host.children).toHaveLength(0)

    const disposeGeometry = vi.spyOn(geometry, 'dispose')
    second.dispose()
    await loader.disposeUnused()
    expect(disposeGeometry).toHaveBeenCalledTimes(1)
    expect(loader.cacheSize()).toBe(0)
  })

  it('falls back to the supplied procedural visual with a useful diagnostic', async () => {
    const registry = new EquipmentAssetRegistry()
    registry.register({ id: 'procedural', source: 'procedural', description: 'Fallback robot.' })
    registry.register({
      id: REFERENCE_6AXIS_GLB_MANIFEST.id,
      source: 'glb',
      description: 'Failing GLB.',
      manifest: testManifest('missing.glb'),
      fallbackAssetId: 'procedural',
    })
    const provider = new EquipmentVisualProvider(
      registry,
      new ThreeGlbAssetLoader({ loadAsync: async () => { throw new Error('404 not found') } }),
    )
    const result = await provider.load(REFERENCE_6AXIS_GLB_MANIFEST.id, () => new THREE.Group())
    expect(result.source).toBe('procedural-fallback')
    expect(result.diagnostic).toContain('404 not found')
  })

  it('requires every manifest-backed visual to name a registered fallback', () => {
    const registry = new EquipmentAssetRegistry()
    expect(() => registry.register({
      id: REFERENCE_6AXIS_GLB_MANIFEST.id,
      source: 'glb',
      description: 'Missing fallback.',
      manifest: testManifest(),
      fallbackAssetId: 'not-registered',
    })).toThrow("requires registered fallback 'not-registered'")
  })

  it('parses the tiny reference GLB without a WebGL renderer', async () => {
    const gltf = await parseGlbArrayBuffer(referenceGlbArrayBuffer())
    expect(gltf.scene).toBeInstanceOf(THREE.Object3D)
  })
})
