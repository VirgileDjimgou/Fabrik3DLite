import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  INDUSTRIAL_CONVEYOR_ASSET_ID,
  INDUSTRIAL_CONVEYOR_MANIFEST,
  INDUSTRIAL_PALLET_STATION_ASSET_ID,
  INDUSTRIAL_PALLET_STATION_MANIFEST,
  PROFESSIONAL_ROBOT_ASSET_IDS,
  PROFESSIONAL_ROBOT_MANIFESTS,
  createIndustrialAssetRegistry,
  parseGlbArrayBuffer,
  measureSceneResources,
  validateEquipmentAssetPackage,
} from './index'
import { SINGLE_CELL_CONVEYOR } from '../../simulation/SingleConveyorCellLayout'

function packageDirectory(assetId: string): string {
  return path.join(process.cwd(), 'public', 'assets', 'equipment', assetId)
}

async function arrayBuffer(file: string): Promise<ArrayBuffer> {
  const bytes = await readFile(file)
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

async function glbNames(assetId: string, file = 'model.glb'): Promise<string[]> {
  const gltf = await parseGlbArrayBuffer(await arrayBuffer(path.join(packageDirectory(assetId), file)))
  const names: string[] = []
  gltf.scene.traverse((child) => names.push(typeof child.userData.semanticId === 'string' ? child.userData.semanticId : child.name))
  return names
}

async function glbMetrics(assetId: string, file: string) {
  const gltf = await parseGlbArrayBuffer(await arrayBuffer(path.join(packageDirectory(assetId), file)))
  return measureSceneResources(gltf.scene)
}

describe('generated industrial equipment assets', () => {
  it('packages validated conveyor and pallet assets with LODs and safe relative files', () => {
    for (const manifest of [INDUSTRIAL_CONVEYOR_MANIFEST, INDUSTRIAL_PALLET_STATION_MANIFEST]) {
      const files = [manifest.visual.glb.path, ...manifest.visual.lods.map((lod) => lod.glb.path), manifest.thumbnail!.path]
      validateEquipmentAssetPackage({ manifest, files })
      expect(manifest.visual.lods).toHaveLength(1)
      expect(manifest.collision.dimensionsMeters).toBeDefined()
    }
  })

  it('keeps conveyor visual dimensions and deterministic collision proxy aligned to the cell layout', () => {
    expect(INDUSTRIAL_CONVEYOR_MANIFEST.boundsMeters.x).toBe(SINGLE_CELL_CONVEYOR.length)
    expect(INDUSTRIAL_CONVEYOR_MANIFEST.collision.dimensionsMeters).toEqual({ x: 6, y: SINGLE_CELL_CONVEYOR.surfaceY, z: 0.72 })
    expect(INDUSTRIAL_CONVEYOR_MANIFEST.anchors.map((anchor) => anchor.id)).toEqual(['anchor:material.in', 'anchor:material.out'])
  })

  it('contains generated GLB semantic nodes for conveyor animation and pallet handling', async () => {
    const conveyor = await glbNames(INDUSTRIAL_CONVEYOR_ASSET_ID)
    expect(conveyor).toEqual(expect.arrayContaining(['motor:main', 'sensor:station', 'belt:segments', 'anchor:material.in', 'anchor:material.out']))
    expect(conveyor.filter((name) => name.startsWith('roller:')).length).toBeGreaterThan(10)

    const pallet = await glbNames(INDUSTRIAL_PALLET_STATION_ASSET_ID)
    expect(pallet).toEqual(expect.arrayContaining(['fixture:locator:1', 'fixture:clamp:1', 'sensor:presence', 'anchor:robot.grasp']))
  })

  it('registers both GLBs with procedural fallbacks', () => {
    const registry = createIndustrialAssetRegistry()
    expect(registry.get(INDUSTRIAL_CONVEYOR_ASSET_ID)).toMatchObject({ source: 'glb', fallbackAssetId: 'procedural-belt-conveyor' })
    expect(registry.get(INDUSTRIAL_PALLET_STATION_ASSET_ID)).toMatchObject({ source: 'glb', fallbackAssetId: 'procedural-pallet-station' })
  })

  it('ships six semantic pivots for every professional robot profile', async () => {
    const registry = createIndustrialAssetRegistry()
    for (const id of Object.values(PROFESSIONAL_ROBOT_ASSET_IDS)) {
      expect(registry.get(id)).toMatchObject({ source: 'glb', fallbackAssetId: 'procedural-6axis' })
      const nodes = await glbNames(id)
      expect(nodes).toEqual(expect.arrayContaining(['joint:j1', 'joint:j2', 'joint:j3', 'joint:j4', 'joint:j5', 'joint:j6', 'tool:flange', 'tool:tcp']))
      const manifest = Object.values(PROFESSIONAL_ROBOT_MANIFESTS).find((candidate) => candidate.id === id)!
      validateEquipmentAssetPackage({ manifest, files: [manifest.visual.glb.path, ...manifest.visual.lods.map((lod) => lod.glb.path), manifest.thumbnail!.path] })
      expect(manifest.robotRig?.joints.map((joint) => joint.axis)).toEqual(['y', 'z', 'z', 'x', 'z', 'x'])
    }
  })

  it('keeps the generated LOD assets inside documented static budgets', async () => {
    const conveyor = await glbMetrics(INDUSTRIAL_CONVEYOR_ASSET_ID, 'model.glb')
    const conveyorLod = await glbMetrics(INDUSTRIAL_CONVEYOR_ASSET_ID, 'lod/lod1.glb')
    const pallet = await glbMetrics(INDUSTRIAL_PALLET_STATION_ASSET_ID, 'model.glb')
    const palletLod = await glbMetrics(INDUSTRIAL_PALLET_STATION_ASSET_ID, 'lod/lod1.glb')
    expect(conveyor.triangles).toBeLessThanOrEqual(8000)
    expect(conveyorLod.triangles).toBeLessThanOrEqual(INDUSTRIAL_CONVEYOR_MANIFEST.visual.lods[0]!.triangleBudget)
    expect(pallet.triangles).toBeLessThanOrEqual(2500)
    expect(palletLod.triangles).toBeLessThanOrEqual(INDUSTRIAL_PALLET_STATION_MANIFEST.visual.lods[0]!.triangleBudget)
    expect(conveyor.drawCalls).toBeLessThanOrEqual(160)
    expect(pallet.textures).toBe(0)
  })
})
