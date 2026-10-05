/**
 * S72 deterministic procedural surface textures.
 *
 * The library generates small RGBA surface maps from pure, seeded inputs so the
 * factory floor, safety markings, signage and equipment no longer read as flat
 * untextured primitives. Every surface is produced at runtime from a seeded PRNG
 * (the same mulberry32 pattern used by `faults/overlays.ts`); no image, HDRI or
 * KTX2 file is downloaded or committed, and no npm runtime dependency is added.
 *
 * Boundaries:
 * - Visual-only. A surface map is never collision geometry, telemetry truth,
 *   scenario state or runtime authority (`Definition != Runtime != Visual !=
 *   Collision != Telemetry`). The procedural fallback path is unchanged: a
 *   surface that cannot be generated simply leaves the material untextured.
 * - Deterministic. The same surface id and seed always produce byte-identical
 *   RGBA data; there is no `Math.random`, `Date.now` or wall-clock input.
 * - Bounded. All maps respect {@link SURFACE_TEXTURE_BUDGET} (resolution, count,
 *   estimated RGBA8 bytes). Textures are cached and shared by material, so a
 *   scene reuses one GPU texture per surface.
 * - Label/screen faces prefer a `CanvasTexture` with real text when a 2D canvas
 *   is available (browser); otherwise they fall back to the deterministic
 *   `DataTexture` bitmap so tests and headless hosts stay GPU-free.
 */

import * as THREE from 'three'

export const PROCEDURAL_SURFACES_SCHEMA_VERSION = '1.0' as const

/** Stable identifiers of the procedural surface vocabulary. */
export type SurfaceId =
  | 'concrete-floor'
  | 'painted-floor'
  | 'painted-floor-roughness'
  | 'safety-stripes'
  | 'access-lane-marking'
  | 'diamond-plate'
  | 'perforated-mesh'
  | 'painted-steel-wear'
  | 'brushed-metal'
  | 'wood-cardboard-grain'
  | 'warning-label'
  | 'equipment-signage'
  | 'hmi-screen'
  | 'contact-shadow'

export type SurfaceKind = 'floor' | 'marking' | 'metal' | 'wood' | 'label' | 'screen' | 'decal'

export interface SurfaceProvenance {
  source: string
  license: string
}

export interface SurfaceSpec {
  id: SurfaceId
  /** Base-colour / decal maps are sRGB; roughness/emboss maps stay linear. */
  colorSpace: 'srgb' | 'linear'
  kind: SurfaceKind
  width: number
  height: number
  /** Deterministic text drawn by the canvas path for label/screen surfaces. */
  text?: string
  provenance: SurfaceProvenance
}

const SURFACE_PROVENANCE: SurfaceProvenance = Object.freeze({
  source: 'Fabrik3D procedural surface generator (repository-generated seeded RGBA, no external texture or download)',
  license: 'Fabrik3D generated; educational use',
})

export const DEFAULT_SURFACE_SEED = 0x5eed_7211

/**
 * One deterministic surface specification. Resolutions are powers of two and
 * never exceed the documented budget.
 */
export const SURFACE_SPECS: Readonly<Record<SurfaceId, SurfaceSpec>> = Object.freeze({
  'concrete-floor': spec('concrete-floor', 'linear', 'floor', 256, 256),
  'painted-floor': spec('painted-floor', 'srgb', 'floor', 256, 256),
  'painted-floor-roughness': spec('painted-floor-roughness', 'linear', 'floor', 256, 256),
  'safety-stripes': spec('safety-stripes', 'srgb', 'marking', 256, 128),
  'access-lane-marking': spec('access-lane-marking', 'srgb', 'marking', 128, 128),
  'diamond-plate': spec('diamond-plate', 'srgb', 'metal', 128, 128),
  'perforated-mesh': spec('perforated-mesh', 'srgb', 'metal', 64, 64),
  'painted-steel-wear': spec('painted-steel-wear', 'srgb', 'metal', 256, 256),
  'brushed-metal': spec('brushed-metal', 'srgb', 'metal', 256, 256),
  'wood-cardboard-grain': spec('wood-cardboard-grain', 'srgb', 'wood', 128, 128),
  'warning-label': spec('warning-label', 'srgb', 'label', 256, 128, 'WARNING'),
  'equipment-signage': spec('equipment-signage', 'srgb', 'label', 256, 128, 'FABRIK3D'),
  'hmi-screen': spec('hmi-screen', 'srgb', 'screen', 256, 192, 'RUN'),
  'contact-shadow': spec('contact-shadow', 'linear', 'decal', 128, 128),
})

function spec(
  id: SurfaceId,
  colorSpace: 'srgb' | 'linear',
  kind: SurfaceKind,
  width: number,
  height: number,
  text?: string,
): SurfaceSpec {
  return Object.freeze({ id, colorSpace, kind, width, height, text, provenance: SURFACE_PROVENANCE })
}

export const SURFACE_IDS: readonly SurfaceId[] = Object.freeze(Object.keys(SURFACE_SPECS) as SurfaceId[])

export function isSurfaceId(value: string): value is SurfaceId {
  return Object.prototype.hasOwnProperty.call(SURFACE_SPECS, value)
}

export function surfaceSpec(id: SurfaceId): SurfaceSpec {
  const found = SURFACE_SPECS[id]
  if (!found) throw new Error(`Unknown procedural surface id '${String(id)}'.`)
  return found
}

/**
 * Documented texture budget, enforced by `validateSurfaceBudget`. Every map is
 * at most 256 px on a side, the library ships at most 14 maps, and the estimated
 * RGBA8 base-level footprint stays under 4 MiB. WebGL does not expose real
 * texture memory, so the byte figure is an explicit estimate (`width * height * 4`).
 */
export const SURFACE_TEXTURE_BUDGET = Object.freeze({
  maxResolution: 256,
  maxTextureCount: 14,
  maxEstimatedBytes: 4 * 1024 * 1024,
})

/** Estimated RGBA8 base-level bytes of a single declared surface. */
export function surfaceEstimatedBytes(id: SurfaceId): number {
  const s = surfaceSpec(id)
  return s.width * s.height * 4
}

/** Estimated bytes for a set of surfaces, defaulting to the whole library. */
export function estimateSurfaceLibraryBytes(ids: readonly SurfaceId[] = SURFACE_IDS): number {
  return ids.reduce((total, id) => total + surfaceEstimatedBytes(id), 0)
}

export interface SurfacePixels {
  id: SurfaceId
  width: number
  height: number
  /** RGBA8 rows, top-to-bottom, `width * height * 4` bytes. */
  data: Uint8Array
}

/**
 * Deterministic PRNG (mulberry32), the same algorithm as `faults/overlays.ts`.
 * Local to the visual layer so surface generation never depends on fault
 * injection; the sequence is a pure function of the 32-bit seed.
 */
function createSurfaceRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashSurfaceString(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function surfaceSeed(id: SurfaceId, seed: number): number {
  return (hashSurfaceString(id) ^ (seed >>> 0)) >>> 0
}

interface Rgb { r: number; g: number; b: number }

function rgb(r: number, g: number, b: number): Rgb {
  return { r, g, b }
}

function writePixel(data: Uint8Array, offset: number, color: Rgb, alpha = 255): void {
  data[offset] = clampByte(color.r)
  data[offset + 1] = clampByte(color.g)
  data[offset + 2] = clampByte(color.b)
  data[offset + 3] = clampByte(alpha)
}

function clampByte(value: number): number {
  if (value <= 0) return 0
  if (value >= 255) return 255
  return Math.round(value)
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const k = t <= 0 ? 0 : t >= 1 ? 1 : t
  return rgb(a.r + (b.r - a.r) * k, a.g + (b.g - a.g) * k, a.b + (b.b - a.b) * k)
}

function shade(color: Rgb, amount: number): Rgb {
  return rgb(color.r * amount, color.g * amount, color.b * amount)
}

/** Low-frequency value-noise field evaluated with a deterministic per-surface PRNG. */
interface NoiseField {
  cols: number
  rows: number
  values: Float32Array
}

function makeNoiseField(random: () => number, cols: number, rows: number): NoiseField {
  const values = new Float32Array(cols * rows)
  for (let index = 0; index < values.length; index += 1) values[index] = random()
  return { cols, rows, values }
}

function sampleNoise(field: NoiseField, u: number, v: number): number {
  const x = Math.min(field.cols - 1, Math.max(0, u * (field.cols - 1)))
  const y = Math.min(field.rows - 1, Math.max(0, v * (field.rows - 1)))
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(field.cols - 1, x0 + 1)
  const y1 = Math.min(field.rows - 1, y0 + 1)
  const tx = x - x0
  const ty = y - y0
  const top = field.values[y0 * field.cols + x0]! * (1 - tx) + field.values[y0 * field.cols + x1]! * tx
  const bottom = field.values[y1 * field.cols + x0]! * (1 - tx) + field.values[y1 * field.cols + x1]! * tx
  return top * (1 - ty) + bottom * ty
}

/**
 * Small deterministic dither table sampled by `(x + 7 * y) & mask`. Using a
 * precomputed table avoids a PRNG call per pixel, which keeps large-surface
 * generation fast and still fully deterministic.
 */
function makeDither(random: () => number, size = 1024): Float32Array {
  const values = new Float32Array(size)
  for (let index = 0; index < size; index += 1) values[index] = random()
  return values
}

function ditherAt(values: Float32Array, x: number, y: number): number {
  return values[(x + y * 7) & (values.length - 1)]!
}

const CONCRETE_BASE = rgb(96, 98, 104)
const CONCRETE_DARK = rgb(64, 66, 72)
const CONCRETE_LIGHT = rgb(132, 134, 140)
const PAINTED_BASE = rgb(150, 154, 158)
const PAINTED_DARK = rgb(120, 124, 128)
const STEEL_BASE = rgb(166, 172, 178)
const STEEL_DARK = rgb(118, 124, 130)
const BRUSH_BASE = rgb(196, 201, 205)
const WOOD_BASE = rgb(200, 172, 122)
const WOOD_DARK = rgb(154, 126, 82)
const STRIPE_YELLOW = rgb(216, 165, 31)
const STRIPE_DARK = rgb(32, 34, 36)
const HMI_BASE = rgb(8, 26, 22)
const HMI_LINE = rgb(46, 196, 128)

/**
 * Renders one surface to a deterministic RGBA8 buffer. This is the single source
 * of truth: the `DataTexture` fallback uploads this buffer verbatim and the
 * canvas path draws the same base pattern before adding crisp text.
 */
export function renderSurfacePixels(id: SurfaceId, seed = DEFAULT_SURFACE_SEED): SurfacePixels {
  const s = surfaceSpec(id)
  const random = createSurfaceRandom(surfaceSeed(id, seed))
  const data = new Uint8Array(s.width * s.height * 4)
  switch (id) {
    case 'concrete-floor': renderConcrete(data, s, random, false); break
    case 'painted-floor': renderPaintedFloor(data, s, random, false); break
    case 'painted-floor-roughness': renderPaintedFloor(data, s, random, true); break
    case 'safety-stripes': renderSafetyStripes(data, s, random); break
    case 'access-lane-marking': renderAccessLane(data, s, random); break
    case 'diamond-plate': renderDiamondPlate(data, s); break
    case 'perforated-mesh': renderPerforatedMesh(data, s); break
    case 'painted-steel-wear': renderPaintedSteel(data, s, random); break
    case 'brushed-metal': renderBrushedMetal(data, s, random); break
    case 'wood-cardboard-grain': renderWoodGrain(data, s, random); break
    case 'warning-label': renderWarningLabel(data, s); break
    case 'equipment-signage': renderSignage(data, s); break
    case 'hmi-screen': renderHmiScreen(data, s); break
    case 'contact-shadow': renderContactShadow(data, s); break
  }
  return { id, width: s.width, height: s.height, data }
}

function renderConcrete(data: Uint8Array, s: SurfaceSpec, random: () => number, roughnessOnly: boolean): void {
  const field = makeNoiseField(random, 24, 24)
  const speckle = makeNoiseField(random, 96, 96)
  for (let y = 0; y < s.height; y += 1) {
    for (let x = 0; x < s.width; x += 1) {
      const u = x / s.width
      const v = y / s.height
      const coarse = sampleNoise(field, u, v)
      const fine = sampleNoise(speckle, u, v)
      const tone = mix(CONCRETE_DARK, CONCRETE_LIGHT, coarse * 0.7 + fine * 0.3)
      const color = roughnessOnly
        ? rgb(200 + (fine - 0.5) * 40, 200 + (fine - 0.5) * 40, 200 + (fine - 0.5) * 40)
        : tone
      writePixel(data, (y * s.width + x) * 4, color)
    }
  }
  // A handful of deterministic hairline cracks keeps the floor from reading as uniform.
  for (let index = 0; index < 5; index += 1) {
    let cx = Math.floor(random() * s.width)
    let cy = Math.floor(random() * s.height)
    for (let step = 0; step < 40; step += 1) {
      cx = Math.min(s.width - 1, Math.max(0, cx + Math.round((random() - 0.5) * 4)))
      cy = Math.min(s.height - 1, Math.max(0, cy + 1))
      writePixel(data, (cy * s.width + cx) * 4, roughnessOnly ? rgb(150, 150, 150) : CONCRETE_DARK)
    }
  }
}

function renderPaintedFloor(data: Uint8Array, s: SurfaceSpec, random: () => number, roughnessOnly: boolean): void {
  const field = makeNoiseField(random, 16, 16)
  for (let y = 0; y < s.height; y += 1) {
    for (let x = 0; x < s.width; x += 1) {
      const u = x / s.width
      const v = y / s.height
      const mottle = sampleNoise(field, u, v)
      const scuff = Math.max(0, mottle - 0.72) * 2.2
      const color = roughnessOnly
        ? rgb(210 + (mottle - 0.5) * 30, 210 + (mottle - 0.5) * 30, 210 + (mottle - 0.5) * 30)
        : mix(mix(PAINTED_BASE, PAINTED_DARK, mottle * 0.55), PAINTED_DARK, scuff * 0.4)
      writePixel(data, (y * s.width + x) * 4, color)
    }
  }
}

function renderSafetyStripes(data: Uint8Array, s: SurfaceSpec, random: () => number): void {
  const period = 32
  const dither = makeDither(random)
  for (let y = 0; y < s.height; y += 1) {
    for (let x = 0; x < s.width; x += 1) {
      const band = ((x + y) % period + period) % period
      const stripe = band < period / 2 ? STRIPE_YELLOW : STRIPE_DARK
      const wear = 0.86 + ditherAt(dither, x, y) * 0.14
      writePixel(data, (y * s.width + x) * 4, shade(stripe, wear))
    }
  }
}

function renderAccessLane(data: Uint8Array, s: SurfaceSpec, random: () => number): void {
  const dashWidth = s.width * 0.18
  const dither = makeDither(random)
  for (let y = 0; y < s.height; y += 1) {
    for (let x = 0; x < s.width; x += 1) {
      const inDash = (x % Math.round(dashWidth * 2)) < dashWidth
      const color = inDash ? STRIPE_DARK : STRIPE_YELLOW
      writePixel(data, (y * s.width + x) * 4, shade(color, 0.9 + ditherAt(dither, x, y) * 0.1))
    }
  }
}

function renderDiamondPlate(data: Uint8Array, s: SurfaceSpec): void {
  const tile = 16
  for (let y = 0; y < s.height; y += 1) {
    for (let x = 0; x < s.width; x += 1) {
      const px = x % tile
      const py = y % tile
      const diagonal = Math.abs(px - py)
      const anti = Math.abs(px - (tile - 1 - py))
      const ridge = Math.min(diagonal, anti) < 2.5
      writePixel(data, (y * s.width + x) * 4, ridge ? STEEL_BASE : STEEL_DARK)
    }
  }
}

function renderPerforatedMesh(data: Uint8Array, s: SurfaceSpec): void {
  const spacing = 16
  const radius = 4.5
  for (let y = 0; y < s.height; y += 1) {
    for (let x = 0; x < s.width; x += 1) {
      const cx = (x % spacing) - spacing / 2
      const cy = (y % spacing) - spacing / 2
      const hole = cx * cx + cy * cy < radius * radius
      writePixel(data, (y * s.width + x) * 4, hole ? shade(STEEL_DARK, 0.35) : STEEL_BASE)
    }
  }
}

function renderPaintedSteel(data: Uint8Array, s: SurfaceSpec, random: () => number): void {
  const field = makeNoiseField(random, 20, 20)
  const base = rgb(93, 107, 115)
  for (let y = 0; y < s.height; y += 1) {
    for (let x = 0; x < s.width; x += 1) {
      const mottle = sampleNoise(field, x / s.width, y / s.height)
      writePixel(data, (y * s.width + x) * 4, shade(base, 0.9 + mottle * 0.2))
    }
  }
  for (let index = 0; index < 12; index += 1) {
    const y = Math.floor(random() * s.height)
    const length = 12 + Math.floor(random() * 60)
    const x = Math.floor(random() * s.width)
    for (let step = 0; step < length; step += 1) {
      const px = (x + step) % s.width
      writePixel(data, (y * s.width + px) * 4, shade(base, 1.28))
    }
  }
}

function renderBrushedMetal(data: Uint8Array, s: SurfaceSpec, random: () => number): void {
  const rowJitter = new Float32Array(s.height)
  for (let y = 0; y < s.height; y += 1) rowJitter[y] = random()
  const columnStreak = new Float32Array(s.width)
  for (let x = 0; x < s.width; x += 1) columnStreak[x] = (random() - 0.5) * 0.12
  for (let y = 0; y < s.height; y += 1) {
    const row = rowJitter[y]!
    for (let x = 0; x < s.width; x += 1) {
      const streak = Math.sin(x * 0.35) * 0.04 + columnStreak[x]!
      writePixel(data, (y * s.width + x) * 4, shade(BRUSH_BASE, 0.92 + row * 0.08 + streak))
    }
  }
}

function renderWoodGrain(data: Uint8Array, s: SurfaceSpec, random: () => number): void {
  const field = makeNoiseField(random, 8, 8)
  for (let y = 0; y < s.height; y += 1) {
    for (let x = 0; x < s.width; x += 1) {
      const grain = Math.sin((x + sampleNoise(field, x / s.width, y / s.height) * 12) * 0.6)
      const t = 0.5 + grain * 0.25
      writePixel(data, (y * s.width + x) * 4, mix(WOOD_DARK, WOOD_BASE, t))
    }
  }
}

function renderWarningLabel(data: Uint8Array, s: SurfaceSpec): void {
  const border = 6
  for (let y = 0; y < s.height; y += 1) {
    for (let x = 0; x < s.width; x += 1) {
      const onBorder = x < border || y < border || x >= s.width - border || y >= s.height - border
      const midBand = y > s.height * 0.36 && y < s.height * 0.64
      const color = onBorder ? rgb(200, 40, 40) : midBand ? rgb(200, 40, 40) : rgb(242, 244, 246)
      writePixel(data, (y * s.width + x) * 4, color)
    }
  }
}

function renderSignage(data: Uint8Array, s: SurfaceSpec): void {
  for (let y = 0; y < s.height; y += 1) {
    for (let x = 0; x < s.width; x += 1) {
      const onBorder = x < 4 || y < 4 || x >= s.width - 4 || y >= s.height - 4
      const textRow = y > s.height * 0.3 && y < s.height * 0.7
      const color = onBorder ? rgb(40, 52, 66) : textRow ? rgb(60, 74, 90) : rgb(244, 246, 247)
      writePixel(data, (y * s.width + x) * 4, color)
    }
  }
}

function renderHmiScreen(data: Uint8Array, s: SurfaceSpec): void {
  for (let y = 0; y < s.height; y += 1) {
    for (let x = 0; x < s.width; x += 1) {
      const header = y < s.height * 0.18
      const row = y > s.height * 0.32 && y < s.height * 0.9 && x > s.width * 0.08
      const bar = row && (x % 48) < 26
      const color = header ? shade(HMI_LINE, 0.5) : bar ? HMI_LINE : HMI_BASE
      writePixel(data, (y * s.width + x) * 4, color)
    }
  }
}

function renderContactShadow(data: Uint8Array, s: SurfaceSpec): void {
  const cx = (s.width - 1) / 2
  const cy = (s.height - 1) / 2
  const maxRadius = Math.min(cx, cy)
  for (let y = 0; y < s.height; y += 1) {
    for (let x = 0; x < s.width; x += 1) {
      const dx = x - cx
      const dy = y - cy
      const distance = Math.sqrt(dx * dx + dy * dy) / maxRadius
      // Soft radial falloff: opaque core, quadratic fade to the transparent rim.
      const alpha = distance >= 1 ? 0 : Math.round((1 - distance * distance) ** 2 * 255)
      writePixel(data, (y * s.width + x) * 4, rgb(0, 0, 0), alpha)
    }
  }
}

/** Creates a deterministic, API-stable `DataTexture` for a surface. */
export function createDataTexture(id: SurfaceId, seed = DEFAULT_SURFACE_SEED): THREE.DataTexture {
  const pixels = renderSurfacePixels(id, seed)
  const texture = new THREE.DataTexture(pixels.data, pixels.width, pixels.height, THREE.RGBAFormat)
  texture.name = `surface:${id}`
  texture.colorSpace = surfaceSpec(id).colorSpace === 'srgb' ? THREE.SRGBColorSpace : THREE.NoColorSpace
  texture.generateMipmaps = true
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.needsUpdate = true
  texture.userData.surfaceId = id
  texture.userData.seed = seed
  texture.userData.procedural = true
  return texture
}

let canvas2dSupport: boolean | null = null

/** True when the host can provide a real 2D canvas context (browser, not headless jsdom). */
export function canUseCanvas2d(): boolean {
  if (canvas2dSupport !== null) return canvas2dSupport
  canvas2dSupport = detectCanvas2d()
  return canvas2dSupport
}

function detectCanvas2d(): boolean {
  if (typeof document === 'undefined') return false
  // jsdom ships a canvas element whose 2D context is not implemented and logs a
  // noisy "Not implemented" error on every probe. Detect it explicitly and use
  // the deterministic DataTexture path instead.
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return false
  try {
    const canvas = document.createElement('canvas')
    return canvas.getContext('2d') !== null
  } catch {
    return false
  }
}

/** Test seam: resets the cached canvas capability probe. */
export function resetCanvas2dSupportProbe(): void {
  canvas2dSupport = null
}

/**
 * Creates a `CanvasTexture` for a label/screen surface with real text, using the
 * deterministic pixel buffer as the base so the non-text content stays identical
 * to the `DataTexture` path. Returns `null` when no 2D canvas is available.
 */
export function createCanvasSurfaceTexture(id: SurfaceId, text?: string, seed = DEFAULT_SURFACE_SEED): THREE.CanvasTexture | null {
  if (!canUseCanvas2d()) return null
  const s = surfaceSpec(id)
  const canvas = document.createElement('canvas')
  canvas.width = s.width
  canvas.height = s.height
  const context = canvas.getContext('2d')
  if (!context) return null
  const pixels = renderSurfacePixels(id, seed)
  context.putImageData(new ImageData(new Uint8ClampedArray(pixels.data), s.width, s.height), 0, 0)
  const label = text ?? s.text ?? ''
  if (label) {
    const fontSize = Math.floor(s.height * (id === 'equipment-signage' ? 0.28 : 0.34))
    context.font = `700 ${fontSize}px sans-serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillStyle = id === 'warning-label' ? '#1a1a1a' : '#1b2530'
    context.fillText(label, s.width / 2, id === 'warning-label' ? s.height * 0.5 : s.height * 0.52)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.name = `surface:${id}`
  texture.colorSpace = s.colorSpace === 'srgb' ? THREE.SRGBColorSpace : THREE.NoColorSpace
  texture.userData.surfaceId = id
  texture.userData.seed = seed
  texture.userData.procedural = true
  return texture
}

export interface CreateSurfaceTextureOptions {
  seed?: number
  /** Preferred text for label/screen surfaces; defaults to the spec text. */
  text?: string
  /** Force the GPU-free `DataTexture` path (tests, diagnostics). */
  forceData?: boolean
}

/**
 * Creates a surface texture. Label and screen surfaces use a canvas with real
 * text when a 2D context is available, otherwise every surface degrades to the
 * deterministic `DataTexture` — never to a missing texture.
 */
export function createSurfaceTexture(id: SurfaceId, options: CreateSurfaceTextureOptions = {}): THREE.Texture {
  const seed = options.seed ?? DEFAULT_SURFACE_SEED
  const s = surfaceSpec(id)
  if (!options.forceData && (s.kind === 'label' || s.kind === 'screen')) {
    const canvasTexture = createCanvasSurfaceTexture(id, options.text, seed)
    if (canvasTexture) return canvasTexture
  }
  return createDataTexture(id, seed)
}

const surfaceCache = new Map<string, THREE.Texture>()

function cacheKey(id: SurfaceId, options: CreateSurfaceTextureOptions): string {
  return `${id}:${options.seed ?? DEFAULT_SURFACE_SEED}:${options.text ?? ''}:${options.forceData ? 'data' : 'auto'}`
}

/**
 * Returns one cached, shared texture per surface/seed/text. Material definitions
 * reuse these instances so GPU texture memory stays bounded; callers other than
 * the material library should prefer this over creating their own textures.
 */
export function getSurfaceTexture(id: SurfaceId, options: CreateSurfaceTextureOptions = {}): THREE.Texture {
  const key = cacheKey(id, options)
  let texture = surfaceCache.get(key)
  if (!texture) {
    texture = createSurfaceTexture(id, options)
    surfaceCache.set(key, texture)
  }
  return texture
}

/** Shared deterministic contact-shadow decal texture. */
export function getContactShadowTexture(): THREE.Texture {
  return getSurfaceTexture('contact-shadow', { forceData: true })
}

/** Number of distinct surface textures currently cached. */
export function surfaceTextureCacheSize(): number {
  return surfaceCache.size
}

/** Estimated RGBA8 bytes of the currently cached surface textures. */
export function estimateCachedSurfaceTextureBytes(): number {
  let total = 0
  for (const texture of surfaceCache.values()) {
    const image = texture.image as { width?: number; height?: number } | undefined
    if (image && typeof image.width === 'number' && typeof image.height === 'number') {
      total += image.width * image.height * 4
    }
  }
  return total
}

/** Disposes and clears the shared cache. Used by scene teardown and tests. */
export function clearSurfaceTextureCache(): void {
  for (const texture of surfaceCache.values()) texture.dispose()
  surfaceCache.clear()
}

export interface SurfaceBudgetProblem {
  id: string
  message: string
}

/** Structural + budget validation of the whole surface library. */
export function validateSurfaceLibrary(): SurfaceBudgetProblem[] {
  const problems: SurfaceBudgetProblem[] = []
  const ids = Object.keys(SURFACE_SPECS) as SurfaceId[]
  if (ids.length > SURFACE_TEXTURE_BUDGET.maxTextureCount) {
    problems.push({ id: 'library', message: `surface count ${ids.length} exceeds budget ${SURFACE_TEXTURE_BUDGET.maxTextureCount}` })
  }
  for (const id of ids) {
    const s = SURFACE_SPECS[id]
    if (s.id !== id) problems.push({ id, message: `id mismatch: ${s.id}` })
    if (!Number.isInteger(s.width) || s.width <= 0) problems.push({ id, message: `invalid width ${s.width}` })
    if (!Number.isInteger(s.height) || s.height <= 0) problems.push({ id, message: `invalid height ${s.height}` })
    if (s.width > SURFACE_TEXTURE_BUDGET.maxResolution || s.height > SURFACE_TEXTURE_BUDGET.maxResolution) {
      problems.push({ id, message: `resolution ${s.width}x${s.height} exceeds budget ${SURFACE_TEXTURE_BUDGET.maxResolution}` })
    }
    if (s.colorSpace !== 'srgb' && s.colorSpace !== 'linear') problems.push({ id, message: `invalid colorSpace ${String(s.colorSpace)}` })
    if (!s.provenance.source.trim()) problems.push({ id, message: 'provenance.source is empty' })
    if (!s.provenance.license.trim()) problems.push({ id, message: 'provenance.license is empty' })
  }
  const bytes = estimateSurfaceLibraryBytes(ids)
  if (bytes > SURFACE_TEXTURE_BUDGET.maxEstimatedBytes) {
    problems.push({ id: 'library', message: `estimated bytes ${bytes} exceed budget ${SURFACE_TEXTURE_BUDGET.maxEstimatedBytes}` })
  }
  return problems
}
