import { manifestFiles, type EquipmentAssetManifest, validateEquipmentAssetManifest } from './types'

export interface AssetPackageInput {
  manifest: unknown
  /** Package-relative filenames and their exact bytes; no URLs or directories are accepted. */
  files: Readonly<Record<string, Uint8Array>>
}
export interface ImportedAssetPackage {
  manifest: EquipmentAssetManifest
  /** Import is visual-only until a separate registered runtime adapter is assigned. */
  simulationReady: false
}
export class AssetPackageImportError extends Error {
  constructor(readonly diagnostics: readonly string[]) { super(diagnostics.join(' ')); this.name = 'AssetPackageImportError' }
}

/** Trusted, in-memory importer. Server persistence remains the catalog authority. */
export class AssetPackageImporter {
  private readonly installed = new Map<string, ImportedAssetPackage>()

  async import(input: AssetPackageInput): Promise<ImportedAssetPackage> {
    const diagnostics: string[] = []
    try { validateEquipmentAssetManifest(input.manifest) } catch (error) {
      throw new AssetPackageImportError(error instanceof Error ? [error.message] : [String(error)])
    }
    const manifest = input.manifest
    const key = `${manifest.id}@${manifest.version}`
    if (this.installed.has(key)) diagnostics.push(`Asset version '${key}' is already installed.`)
    for (const path of manifestFiles(manifest)) {
      const bytes = input.files[path]
      if (!bytes) { diagnostics.push(`Package is missing '${path}'.`); continue }
      const expected = expectedHash(manifest, path)
      if (expected && await sha256(bytes) !== expected) diagnostics.push(`Integrity check failed for '${path}'.`)
    }
    if (diagnostics.length) throw new AssetPackageImportError(diagnostics)
    const imported: ImportedAssetPackage = { manifest, simulationReady: false }
    this.installed.set(key, imported)
    return imported
  }

  list(): readonly ImportedAssetPackage[] { return [...this.installed.values()] }
}

function expectedHash(manifest: EquipmentAssetManifest, path: string): string | undefined {
  if (manifest.visual.glb.path === path) return manifest.visual.glb.sha256
  if (manifest.integrity.path === path) return manifest.integrity.sha256
  if (manifest.thumbnail?.path === path) return manifest.thumbnail.sha256
  const lod = manifest.visual.lods.find((candidate) => candidate.glb.path === path)?.glb.sha256
  if (lod) return lod
  return manifest.collision.file?.path === path ? manifest.collision.file.sha256 : undefined
}
async function sha256(bytes: Uint8Array): Promise<string> {
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('')
}
