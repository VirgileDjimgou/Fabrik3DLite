import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import {
  DEFAULT_SURFACE_SEED,
  SURFACE_IDS,
  SURFACE_SPECS,
  SURFACE_TEXTURE_BUDGET,
  canUseCanvas2d,
  clearSurfaceTextureCache,
  createDataTexture,
  createSurfaceTexture,
  estimateCachedSurfaceTextureBytes,
  estimateSurfaceLibraryBytes,
  getContactShadowTexture,
  getSurfaceTexture,
  isSurfaceId,
  renderSurfacePixels,
  surfaceEstimatedBytes,
  surfaceTextureCacheSize,
  validateSurfaceLibrary,
} from './proceduralSurfaces'

describe('S72 procedural surfaces', () => {
  it('declares a structurally valid library inside the documented budget', () => {
    expect(validateSurfaceLibrary()).toEqual([])
    expect(SURFACE_IDS.length).toBeGreaterThanOrEqual(10)
    expect(new Set(SURFACE_IDS).size).toBe(SURFACE_IDS.length)
    expect(estimateSurfaceLibraryBytes()).toBeLessThanOrEqual(SURFACE_TEXTURE_BUDGET.maxEstimatedBytes)
  })

  it('generates byte-identical RGBA for the same surface and seed', () => {
    for (const id of SURFACE_IDS) {
      const first = renderSurfacePixels(id, DEFAULT_SURFACE_SEED)
      const second = renderSurfacePixels(id, DEFAULT_SURFACE_SEED)
      const spec = SURFACE_SPECS[id]
      expect(first.width, id).toBe(spec.width)
      expect(first.height, id).toBe(spec.height)
      expect(first.data.length, id).toBe(spec.width * spec.height * 4)
      expect(second.data, id).toEqual(first.data)
    }
  }, 20_000)

  it('produces different output for different seeds on textured surfaces', () => {
    const differences = SURFACE_IDS.filter((id) => {
      const a = renderSurfacePixels(id, 1)
      const b = renderSurfacePixels(id, 2)
      return a.data.some((value, index) => value !== b.data[index])
    })
    expect(differences.length).toBeGreaterThan(0)
  })

  it('never uses Math.random or Date.now in the generator', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/equipment/visuals/proceduralSurfaces.ts'), 'utf8')
    expect(source).not.toMatch(/Math\.random\s*\(/)
    expect(source).not.toMatch(/Date\.now\s*\(/)
  })

  it('creates declared DataTextures with the right dimensions and color space', () => {
    for (const id of SURFACE_IDS) {
      const texture = createDataTexture(id)
      const spec = SURFACE_SPECS[id]
      expect(texture, id).toBeInstanceOf(THREE.DataTexture)
      expect(texture.image.width, id).toBe(spec.width)
      expect(texture.image.height, id).toBe(spec.height)
      const expectedColorSpace = spec.colorSpace === 'srgb' ? THREE.SRGBColorSpace : THREE.NoColorSpace
      expect(texture.colorSpace, id).toBe(expectedColorSpace)
      expect(texture.userData.surfaceId).toBe(id)
      texture.dispose()
    }
  })

  it('falls back to a deterministic DataTexture when no 2D canvas exists', () => {
    // jsdom in this repository has no canvas package, so the browser-only path is
    // exercised through its deterministic fallback.
    if (!canUseCanvas2d()) {
      const texture = createSurfaceTexture('warning-label')
      expect(texture).toBeInstanceOf(THREE.DataTexture)
    }
    const forced = createSurfaceTexture('hmi-screen', { forceData: true })
    expect(forced).toBeInstanceOf(THREE.DataTexture)
    forced.dispose()
  })

  it('caches shared textures and stays inside the byte budget', () => {
    clearSurfaceTextureCache()
    const first = getSurfaceTexture('painted-floor')
    const second = getSurfaceTexture('painted-floor')
    expect(first).toBe(second)
    getSurfaceTexture('safety-stripes')
    expect(surfaceTextureCacheSize()).toBe(2)
    expect(estimateCachedSurfaceTextureBytes()).toBe(
      surfaceEstimatedBytes('painted-floor') + surfaceEstimatedBytes('safety-stripes'),
    )
    clearSurfaceTextureCache()
    expect(surfaceTextureCacheSize()).toBe(0)
  })

  it('disposes cached textures on clear', () => {
    clearSurfaceTextureCache()
    const texture = getSurfaceTexture('brushed-metal')
    const dispose = vi.spyOn(texture, 'dispose')
    clearSurfaceTextureCache()
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('builds a radial contact-shadow decal with an opaque core and transparent rim', () => {
    const pixels = renderSurfacePixels('contact-shadow')
    const center = (Math.floor(pixels.height / 2) * pixels.width + Math.floor(pixels.width / 2)) * 4
    const corner = 0
    expect(pixels.data[center + 3]).toBeGreaterThan(200)
    expect(pixels.data[corner + 3]).toBe(0)
    const texture = getContactShadowTexture()
    expect(texture).toBeInstanceOf(THREE.DataTexture)
    clearSurfaceTextureCache()
  })

  it('rejects unknown surface ids instead of silently defaulting', () => {
    expect(isSurfaceId('not-a-surface')).toBe(false)
    expect(() => renderSurfacePixels('not-a-surface' as never)).toThrow()
  })
})
