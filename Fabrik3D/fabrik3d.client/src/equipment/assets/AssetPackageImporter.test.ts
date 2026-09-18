import { describe, expect, it } from 'vitest'
import { AssetPackageImporter } from './AssetPackageImporter'
import { INDUSTRIAL_CONVEYOR_MANIFEST } from './industrialAssets'

const bytes = new TextEncoder().encode('not-a-real-glb')
function input(overrides: Record<string, unknown> = {}) {
  const manifest = structuredClone(INDUSTRIAL_CONVEYOR_MANIFEST)
  manifest.visual.glb.sha256 = '0'.repeat(64); manifest.integrity.sha256 = '0'.repeat(64)
  return { manifest: { ...manifest, ...overrides }, files: { 'model.glb': bytes, 'lod/lod1.glb': bytes, 'thumbnail.svg': bytes } }
}
describe('trusted asset package importer', () => {
  it('isolates corrupt assets with an actionable integrity diagnostic', async () => {
    await expect(new AssetPackageImporter().import(input())).rejects.toThrow("Integrity check failed for 'model.glb'")
  })
  it('rejects traversal before a package can be installed', async () => {
    await expect(new AssetPackageImporter().import(input({ visual: { ...INDUSTRIAL_CONVEYOR_MANIFEST.visual, glb: { path: '../model.glb', sha256: '0'.repeat(64) } } }))).rejects.toThrow('safe package-relative')
  })
  it('rejects a missing package member', async () => {
    const value = input(); const { ['thumbnail.svg']: _removed, ...files } = value.files
    await expect(new AssetPackageImporter().import({ ...value, files })).rejects.toThrow("Package is missing 'thumbnail.svg'")
  })
})
