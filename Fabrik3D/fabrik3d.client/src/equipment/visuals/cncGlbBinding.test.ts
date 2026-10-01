import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { parseGlbArrayBuffer, ThreeGlbAssetLoader } from '../assets/ThreeGlbAssetLoader'
import { EquipmentAssetRuntime } from '../assets/EquipmentAssetRuntime'
import { createIndustrialAssetRegistry } from '../assets/industrialAssets'
import { HERO_CNC_MACHINE_ASSET_ID } from '../assets/heroAssets'
import { bindCncGlbVisual, cncGlbVisual } from './cncGlbBinding'
import { buildCncMachineVisual, type CncMachineVisualState } from './cncMachineVisual'

const IDLE: CncMachineVisualState = {
  doorPosition: 0,
  fixtureClamped: false,
  spindleSpeed: 0,
  spindleAtSpeed: false,
  feedActive: false,
  coolantOn: false,
  coarseState: 'IDLE',
  online: true,
}

async function loadHeroCnc(): Promise<THREE.Group> {
  const file = path.join(process.cwd(), 'public', 'assets', 'equipment', 'hero-cnc-machine-v1', 'model.glb')
  const bytes = await readFile(file)
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const gltf = await parseGlbArrayBuffer(copy.buffer)
  return gltf.scene as THREE.Group
}

describe('bindCncGlbVisual', () => {
  it('binds every required semantic node from the generated hero CNC GLB', async () => {
    const binding = bindCncGlbVisual(await loadHeroCnc())
    expect(binding.missingNodes).toEqual([])
    // GLTFLoader sanitizes node names (colons removed) but preserves the
    // semantic id in userData, which is the stable binding contract.
    expect(binding.nodes.door.userData.semanticId).toBe('door:loading')
    expect(binding.nodes.spindle.userData.semanticId).toBe('spindle:main')
    expect(binding.nodes.chuck.userData.semanticId).toBe('fixture:chuck')
    expect(binding.nodes.feedTable.userData.semanticId).toBe('axis:feed')
    expect(binding.nodes.stackLightGreen.userData.semanticId).toBe('signal:stack-light')
    binding.dispose()
  })

  it('drives door, jaws, feed and lamps from the authoritative state', async () => {
    const binding = bindCncGlbVisual(await loadHeroCnc())
    const restY = binding.nodes.door.position.y
    binding.apply({ ...IDLE, doorPosition: 1 })
    expect(binding.nodes.door.position.y).toBeGreaterThan(restY)
    binding.apply({ ...IDLE, doorPosition: 0 })
    expect(binding.nodes.door.position.y).toBeCloseTo(restY, 6)

    binding.apply({ ...IDLE, fixtureClamped: true })
    expect(Math.abs(binding.nodes.jawLeft.position.x)).toBeCloseTo(0.05, 6)
    binding.apply({ ...IDLE, fixtureClamped: false })
    expect(Math.abs(binding.nodes.jawLeft.position.x)).toBeGreaterThan(0.05)

    const restZ = binding.nodes.feedTable.position.z
    binding.apply({ ...IDLE, feedActive: true })
    expect(binding.nodes.feedTable.position.z).toBeGreaterThan(restZ)

    binding.apply({ ...IDLE, spindleSpeed: 8_000 })
    expect(binding.nodes.spindle.rotation.z).toBeGreaterThan(0)
    binding.dispose()
  })

  it('reports missing nodes instead of throwing when the GLB contract is incomplete', () => {
    const binding = bindCncGlbVisual(new THREE.Group())
    expect(binding.missingNodes).toContain('door:loading')
    expect(binding.missingNodes).toContain('spindle:main')
    // Applying to an incomplete binding must not throw.
    expect(() => binding.apply(IDLE)).not.toThrow()
    binding.dispose()
  })

  it('exposes the same interface as the procedural visual', async () => {
    const binding = bindCncGlbVisual(await loadHeroCnc())
    const visual = cncGlbVisual(binding)
    expect(visual.group).toBe(binding.group)
    expect(typeof visual.apply).toBe('function')
    expect(typeof visual.dispose).toBe('function')
    visual.dispose()
  })

  it('keeps the procedural fallback available and independent', () => {
    const procedural = buildCncMachineVisual()
    expect(procedural.group.getObjectByName('door:loading')).toBeTruthy()
    procedural.dispose()
  })

  it('acquires the hero CNC through the shared runtime and binds it to runtime state', async () => {
    const loadAsync = vi.fn(async (url: string) => {
      const file = path.join(process.cwd(), 'public', url.replace(/^\//, ''))
      const bytes = await readFile(file)
      const copy = new Uint8Array(bytes.byteLength)
      copy.set(bytes)
      return parseGlbArrayBuffer(copy.buffer) as Promise<GLTF>
    })
    const runtime = new EquipmentAssetRuntime(createIndustrialAssetRegistry(), new ThreeGlbAssetLoader({ loadAsync }))
    const instance = await runtime.acquire(HERO_CNC_MACHINE_ASSET_ID, {
      proceduralFallback: () => buildCncMachineVisual().group,
      targetLevel: 0,
    })
    expect(instance.source).toBe('glb')
    const binding = bindCncGlbVisual(instance.root)
    expect(binding.missingNodes).toEqual([])
    binding.apply({ ...IDLE, doorPosition: 1, fixtureClamped: true, feedActive: true, spindleSpeed: 8_000 })
    expect(binding.nodes.door.position.y).toBeGreaterThan(0)
    expect(Math.abs(binding.nodes.jawLeft.position.x)).toBeCloseTo(0.05, 6)
    expect(binding.nodes.spindle.rotation.z).toBeGreaterThan(0)
    instance.dispose()
    await runtime.disposeAll()
    expect(runtime.diagnostics().liveInstances).toBe(0)
  })

  it('falls back to the procedural visual when the hero GLB cannot load', async () => {
    const loadAsync = vi.fn(async () => { throw new Error('simulated 404') })
    const runtime = new EquipmentAssetRuntime(createIndustrialAssetRegistry(), new ThreeGlbAssetLoader({ loadAsync }))
    const instance = await runtime.acquire(HERO_CNC_MACHINE_ASSET_ID, {
      proceduralFallback: () => buildCncMachineVisual().group,
    })
    expect(instance.source).toBe('procedural')
    expect(instance.diagnostic).toBeTruthy()
    expect(runtime.diagnostics().fallbacks).toBe(1)
    instance.dispose()
    await runtime.disposeAll()
  })
})
