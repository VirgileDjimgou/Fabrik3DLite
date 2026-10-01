import type * as THREE from 'three'
import type { GlbEquipmentVisual } from './registry'
import { EquipmentAssetRegistry } from './registry'
import { createIndustrialAssetRegistry } from './industrialAssets'
import { ThreeGlbAssetLoader, type LoadedEquipmentVisual } from './ThreeGlbAssetLoader'
import { measureSceneResources, type SceneRenderMetrics } from './sceneMetrics'
import type { AssetFileReference, EquipmentAssetManifest } from './types'
import {
  isAssetQualityProfile,
  selectLodLevel,
  type AssetQualityProfile,
} from './lodPolicy'

/** A renderable level of a GLB asset: level 0 is the primary, 1..n are manifest LODs. */
export interface AssetRuntimeLevel {
  id: string
  level: number
  file: AssetFileReference
  url: string
  triangleBudget: number | null
}

/** One independent, ref-counted visual instance owned by a caller. */
export interface AssetRuntimeInstance {
  assetId: string
  level: number
  lodId: string | null
  source: 'glb' | 'procedural'
  root: THREE.Object3D
  diagnostic?: string
  dispose(): void
}

export interface AssetAcquireOptions {
  /** Builds the procedural representation used when no GLB level can load. */
  proceduralFallback: () => THREE.Object3D
  /** Camera distance in meters; drives centralized LOD selection. */
  distanceMeters?: number
  /** Explicit level override; primarily for tests and deterministic tooling. */
  targetLevel?: number
}

export interface AssetUpgradeOptions {
  distanceMeters?: number
  targetLevel?: number
}

export interface AssetRuntimeUpgradeResult {
  instance: AssetRuntimeInstance
  upgraded: boolean
  diagnostic?: string
}

export interface AssetRuntimeCacheDiagnostic {
  key: string
  assetId: string
  lodId: string
  level: number
  refCount: number
  physicalLoads: number
  resources?: SceneRenderMetrics
}

export interface AssetRuntimeDiagnostics {
  profile: AssetQualityProfile
  disposed: boolean
  cacheEntries: number
  cacheHits: number
  cacheMisses: number
  coalescedRequests: number
  physicalLoads: number
  liveInstances: number
  releases: number
  proceduralRequests: number
  fallbacks: number
  loadFailures: number
  entries: AssetRuntimeCacheDiagnostic[]
  errors: string[]
}

interface RuntimeCacheEntry {
  key: string
  assetId: string
  lodId: string
  level: number
  url: string
  ready: Promise<void>
  settled: boolean
  refCount: number
  physicalLoads: number
  resources?: SceneRenderMetrics
}

const MAX_RECORDED_ERRORS = 25

/** Stable cache identity: asset + version + level + decoder identity. */
export function assetRuntimeCacheKey(manifest: EquipmentAssetManifest, level: AssetRuntimeLevel): string {
  return [
    manifest.id,
    manifest.version,
    level.id,
    `lvl=${level.level}`,
    `sha=${level.file.sha256}`,
    'decoder=none',
  ].join('@')
}

/** Ordered levels for a GLB asset: primary first, then manifest LODs by budget. */
export function listAssetRuntimeLevels(asset: GlbEquipmentVisual): AssetRuntimeLevel[] {
  const primary: AssetRuntimeLevel = {
    id: 'primary',
    level: 0,
    file: asset.manifest.visual.glb,
    url: asset.url ?? asset.manifest.visual.glb.path,
    triangleBudget: null,
  }
  const lods = [...asset.manifest.visual.lods].sort((a, b) => b.triangleBudget - a.triangleBudget)
  const levels = lods.map((lod, index) => ({
    id: lod.id,
    level: index + 1,
    file: lod.glb,
    url: resolveLevelUrl(asset.url, asset.manifest.visual.glb.path, lod.glb.path),
    triangleBudget: lod.triangleBudget,
  }))
  return [primary, ...levels]
}

/** Resolves a package-relative LOD path against the resolved primary URL. */
export function resolveLevelUrl(primaryUrl: string | undefined, primaryPath: string, levelPath: string): string {
  if (!primaryUrl) return levelPath
  if (primaryUrl.endsWith(primaryPath)) return `${primaryUrl.slice(0, -primaryPath.length)}${levelPath}`
  const separator = primaryUrl.lastIndexOf('/')
  return separator === -1 ? levelPath : `${primaryUrl.slice(0, separator + 1)}${levelPath}`
}

/** Strips URLs and local paths from diagnostics so they cannot leak. */
export function sanitizeAssetDiagnostic(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value)
  return message
    .replace(/(?:https?:)?\/\/[^\s)'"]+/gi, '<url>')
    .replace(/[A-Za-z]:\\[^\s)'"]+/g, '<path>')
    .replace(/[^\s)'"]*\.glb/gi, '<asset>')
    .slice(0, 300)
}

function levelManifest(manifest: EquipmentAssetManifest, level: AssetRuntimeLevel): EquipmentAssetManifest {
  if (level.level === 0) return manifest
  return { ...manifest, visual: { ...manifest.visual, glb: level.file } }
}

function clampLevel(index: number, levelCount: number): number {
  if (!Number.isFinite(index)) return 0
  return Math.max(0, Math.min(levelCount - 1, Math.floor(index)))
}

/**
 * Candidate fallback order for a desired level: the request itself first, then
 * progressively cheaper levels, then the more detailed levels as a last resort.
 * This keeps a working visual available when a specific LOD is missing/corrupt.
 */
export function candidateLevelOrder(desired: number, levelCount: number): number[] {
  const start = clampLevel(desired, levelCount)
  const order: number[] = []
  for (let index = start; index < levelCount; index += 1) order.push(index)
  for (let index = start - 1; index >= 0; index -= 1) order.push(index)
  return order
}

/**
 * Scene/application-scoped owner of the visual asset registry, loader, cache,
 * reference counting, LOD selection and engineering diagnostics.
 *
 * It is intentionally separate from simulation, collision and telemetry: an
 * asset failure only ever degrades the visual to a procedural representation.
 */
export class EquipmentAssetRuntime {
  private readonly entries = new Map<string, RuntimeCacheEntry>()
  private readonly errors: string[] = []
  private currentProfile: AssetQualityProfile
  private disposed = false

  cacheHits = 0
  cacheMisses = 0
  coalescedRequests = 0
  physicalLoads = 0
  liveInstances = 0
  releases = 0
  proceduralRequests = 0
  fallbacks = 0
  loadFailures = 0

  constructor(
    private readonly registry: EquipmentAssetRegistry,
    private readonly loader: ThreeGlbAssetLoader,
    profile: AssetQualityProfile = 'balanced',
  ) {
    this.currentProfile = profile
  }

  get qualityProfile(): AssetQualityProfile { return this.currentProfile }

  setQualityProfile(profile: AssetQualityProfile): void {
    if (!isAssetQualityProfile(profile)) throw new Error(`Unknown asset quality profile '${String(profile)}'.`)
    this.currentProfile = profile
  }

  getRegistry(): EquipmentAssetRegistry { return this.registry }

  /** Centralized LOD selection for an asset at a camera distance. */
  selectLod(assetId: string, distanceMeters: number, currentLevel?: number): AssetRuntimeLevel | null {
    const asset = this.registry.get(assetId)
    if (asset.source !== 'glb') return null
    const levels = listAssetRuntimeLevels(asset)
    const index = selectLodLevel({
      distanceMeters,
      boundsMeters: asset.manifest.boundsMeters,
      levelCount: levels.length,
      profile: this.currentProfile,
      currentLevel,
    })
    return levels[index] ?? levels[0]!
  }

  /**
   * Acquires an independent, reference-counted visual. A single physical load is
   * shared by every concurrent/cached request for the same level.
   */
  async acquire(assetId: string, options: AssetAcquireOptions): Promise<AssetRuntimeInstance> {
    if (this.disposed) throw new Error('Equipment asset runtime is disposed.')
    const asset = this.registry.get(assetId)
    if (asset.source === 'procedural') {
      this.proceduralRequests += 1
      return this.createProceduralInstance(assetId, options.proceduralFallback(), 'Asset is procedural; a procedural visual was returned.')
    }
    const levels = listAssetRuntimeLevels(asset)
    const desired = options.targetLevel !== undefined
      ? clampLevel(options.targetLevel, levels.length)
      : selectLodLevel({
        distanceMeters: options.distanceMeters ?? 0,
        boundsMeters: asset.manifest.boundsMeters,
        levelCount: levels.length,
        profile: this.currentProfile,
      })
    let lastError: string | undefined
    for (const index of candidateLevelOrder(desired, levels.length)) {
      const level = levels[index]!
      try {
        return await this.acquireLevel(asset, level)
      } catch (error) {
        lastError = sanitizeAssetDiagnostic(error)
        this.loadFailures += 1
        this.recordError(asset.id, level.id, lastError)
      }
    }
    this.fallbacks += 1
    const diagnostic = lastError
      ? `All GLB levels failed for '${assetId}': ${lastError}`
      : `No GLB level available for '${assetId}'.`
    return this.createProceduralInstance(assetId, options.proceduralFallback(), diagnostic)
  }

  /**
   * Attempts a progressive upgrade (proxy -> primary GLB, or a higher-detail
   * LOD) while never discarding the working instance on failure.
   */
  async upgrade(instance: AssetRuntimeInstance, options: AssetUpgradeOptions = {}): Promise<AssetRuntimeUpgradeResult> {
    if (this.disposed) return { instance, upgraded: false, diagnostic: 'Equipment asset runtime is disposed.' }
    const asset = this.registry.get(instance.assetId)
    if (asset.source === 'procedural') {
      return { instance, upgraded: false, diagnostic: 'Asset is procedural; no GLB upgrade is available.' }
    }
    if (instance.level < 0) {
      // A procedural proxy for a GLB asset: attempt the progressive upgrade.
      try {
        const levels = listAssetRuntimeLevels(asset)
        const index = options.targetLevel !== undefined
          ? clampLevel(options.targetLevel, levels.length)
          : selectLodLevel({
            distanceMeters: options.distanceMeters ?? 0,
            boundsMeters: asset.manifest.boundsMeters,
            levelCount: levels.length,
            profile: this.currentProfile,
          })
        return { instance: await this.acquireLevel(asset, levels[index]!), upgraded: true }
      } catch (error) {
        const diagnostic = sanitizeAssetDiagnostic(error)
        this.loadFailures += 1
        this.recordError(asset.id, 'primary', diagnostic)
        return { instance, upgraded: false, diagnostic }
      }
    }
    if (instance.level <= 0) return { instance, upgraded: false }
    const levels = listAssetRuntimeLevels(asset)
    const desired = options.targetLevel !== undefined
      ? clampLevel(options.targetLevel, levels.length)
      : selectLodLevel({
        distanceMeters: options.distanceMeters ?? 0,
        boundsMeters: asset.manifest.boundsMeters,
        levelCount: levels.length,
        profile: this.currentProfile,
        currentLevel: instance.level,
      })
    if (desired >= instance.level) return { instance, upgraded: false }
    const level = levels[desired]!
    try {
      return { instance: await this.acquireLevel(asset, level), upgraded: true }
    } catch (error) {
      const diagnostic = sanitizeAssetDiagnostic(error)
      this.loadFailures += 1
      this.recordError(asset.id, level.id, diagnostic)
      return { instance, upgraded: false, diagnostic }
    }
  }

  /** Engineering diagnostics; never contains URLs, paths or tenant data. */
  diagnostics(): AssetRuntimeDiagnostics {
    return {
      profile: this.currentProfile,
      disposed: this.disposed,
      cacheEntries: this.entries.size,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      coalescedRequests: this.coalescedRequests,
      physicalLoads: this.physicalLoads,
      liveInstances: this.liveInstances,
      releases: this.releases,
      proceduralRequests: this.proceduralRequests,
      fallbacks: this.fallbacks,
      loadFailures: this.loadFailures,
      entries: [...this.entries.values()].map((entry) => ({
        key: entry.key,
        assetId: entry.assetId,
        lodId: entry.lodId,
        level: entry.level,
        refCount: entry.refCount,
        physicalLoads: entry.physicalLoads,
        resources: entry.resources,
      })),
      errors: [...this.errors],
    }
  }

  /** Frees GPU resources for cached templates that no live instance references. */
  async disposeUnused(): Promise<void> {
    for (const [key, entry] of this.entries) {
      if (entry.refCount === 0) this.entries.delete(key)
    }
    await this.loader.disposeUnused()
  }

  /** Drops all cache state. Callers must have released live instances first. */
  async disposeAll(): Promise<void> {
    this.entries.clear()
    await this.loader.disposeUnused()
    this.disposed = true
  }

  private async acquireLevel(asset: GlbEquipmentVisual, level: AssetRuntimeLevel): Promise<AssetRuntimeInstance> {
    const key = assetRuntimeCacheKey(asset.manifest, level)
    let entry = this.entries.get(key)
    if (!entry) {
      this.cacheMisses += 1
      this.physicalLoads += 1
      const created: RuntimeCacheEntry = {
        key,
        assetId: asset.id,
        lodId: level.id,
        level: level.level,
        url: level.url,
        ready: Promise.resolve(),
        settled: false,
        refCount: 0,
        physicalLoads: 1,
      }
      created.ready = this.loader.preload(levelManifest(asset.manifest, level), level.url)
        .then(() => { created.settled = true })
        .catch((error: unknown) => {
          if (this.entries.get(key) === created) this.entries.delete(key)
          throw error
        })
      this.entries.set(key, created)
      entry = created
    } else {
      this.cacheHits += 1
      if (!entry.settled) this.coalescedRequests += 1
    }
    await entry.ready
    const loaded = await this.loader.load(levelManifest(asset.manifest, level), level.url, { isolateMaterials: true })
    if (!entry.resources) entry.resources = measureSceneResources(loaded.root)
    entry.refCount += 1
    this.liveInstances += 1
    return this.createGlbInstance(asset.id, level, loaded, entry)
  }

  private createGlbInstance(
    assetId: string,
    level: AssetRuntimeLevel,
    loaded: LoadedEquipmentVisual,
    entry: RuntimeCacheEntry,
  ): AssetRuntimeInstance {
    let disposed = false
    return {
      assetId,
      level: level.level,
      lodId: level.id,
      source: 'glb',
      root: loaded.root,
      dispose: () => {
        if (disposed) return
        disposed = true
        loaded.dispose()
        entry.refCount = Math.max(0, entry.refCount - 1)
        this.liveInstances = Math.max(0, this.liveInstances - 1)
        this.releases += 1
      },
    }
  }

  private createProceduralInstance(assetId: string, root: THREE.Object3D, diagnostic: string): AssetRuntimeInstance {
    let disposed = false
    return {
      assetId,
      level: -1,
      lodId: null,
      source: 'procedural',
      root,
      diagnostic,
      dispose: () => {
        if (disposed) return
        disposed = true
        root.removeFromParent()
        this.releases += 1
      },
    }
  }

  private recordError(assetId: string, lodId: string, message: string): void {
    if (this.errors.length >= MAX_RECORDED_ERRORS) this.errors.shift()
    this.errors.push(`'${assetId}' level '${lodId}': ${message}`)
  }
}

/** Builds the default scene/application runtime used by `ThreeScene`. */
export function createDefaultEquipmentAssetRuntime(profile: AssetQualityProfile = 'balanced'): EquipmentAssetRuntime {
  return new EquipmentAssetRuntime(createIndustrialAssetRegistry(), new ThreeGlbAssetLoader(), profile)
}

/** Maps the scene renderer quality to the asset quality profile. */
export function sceneQualityToAssetProfile(quality: 'low' | 'medium' | 'high'): AssetQualityProfile {
  return quality === 'low' ? 'performance' : quality === 'high' ? 'quality' : 'balanced'
}
