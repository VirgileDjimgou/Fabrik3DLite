import { describe, expect, it } from 'vitest'
import {
  EquipmentAssetManifestError,
  REFERENCE_6AXIS_GLB_MANIFEST,
  manifestFiles,
  validateEquipmentAssetManifest,
  validateEquipmentAssetPackage,
} from './index'
import type { EquipmentAssetManifest } from './types'

function manifest(overrides: Partial<EquipmentAssetManifest> = {}): EquipmentAssetManifest {
  return {
    ...structuredClone(REFERENCE_6AXIS_GLB_MANIFEST),
    ...overrides,
  }
}

function completeFiles(value: EquipmentAssetManifest): string[] {
  return manifestFiles(value)
}

describe('EquipmentAssetManifest validation', () => {
  it('accepts the reference package with every declared file', () => {
    const value = manifest()
    expect(() => validateEquipmentAssetManifest(value)).not.toThrow()
    expect(() => validateEquipmentAssetPackage({ manifest: value, files: completeFiles(value) })).not.toThrow()
  })

  it('rejects unsupported versions, coordinate systems, bounds, and hashes', () => {
    expect(() => validateEquipmentAssetManifest(manifest({ schemaVersion: '9.0' as '1.0' }))).toThrow("schemaVersion must be '1.0'")
    expect(() => validateEquipmentAssetManifest(manifest({
      coordinateSystem: { units: 'meters', upAxis: 'Z', handedness: 'right', origin: 'equipment-base' } as unknown as EquipmentAssetManifest['coordinateSystem'],
    }))).toThrow('coordinateSystem')
    expect(() => validateEquipmentAssetManifest(manifest({ boundsMeters: { x: 0, y: 1, z: 1 } }))).toThrow('boundsMeters.x')
    expect(() => validateEquipmentAssetManifest(manifest({
      visual: { glb: { path: 'model.glb', sha256: 'short' }, lods: [] },
    }))).toThrow('visual.glb.sha256')
  })

  it('rejects duplicate or incorrectly namespaced semantic nodes', () => {
    const duplicate = manifest({ semanticNodes: [
      { id: 'joint:j1', kind: 'joint' },
      { id: 'joint:j1', kind: 'joint' },
    ] })
    expect(() => validateEquipmentAssetManifest(duplicate)).toThrow("duplicate id 'joint:j1'")
    expect(() => validateEquipmentAssetManifest(manifest({ semanticNodes: [{ id: 'door:load', kind: 'joint' }] })))
      .toThrow("must use the 'joint:' namespace")
  })

  it('rejects unsafe package references and missing package files', () => {
    expect(() => validateEquipmentAssetManifest(manifest({
      visual: { glb: { path: '../escape.glb', sha256: REFERENCE_6AXIS_GLB_MANIFEST.visual.glb.sha256 }, lods: [] },
    }))).toThrow('safe package-relative path')

    const value = manifest()
    expect(() => validateEquipmentAssetPackage({ manifest: value, files: ['thumbnail.webp', 'manifest.sha256'] }))
      .toThrow(EquipmentAssetManifestError)
    expect(() => validateEquipmentAssetPackage({ manifest: value, files: ['thumbnail.webp', 'manifest.sha256'] }))
      .toThrow("Package is missing 'model.glb'")
  })
})
