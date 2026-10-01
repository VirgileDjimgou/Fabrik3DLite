/**
 * Hardware-acceleration classification (S56).
 *
 * Performance evidence is only meaningful when the renderer identity is recorded and the run is
 * labelled honestly. This module reads the WebGL renderer identity when the browser exposes it and
 * classifies it as `hardware`, `software` (headless/software rasterizer) or `unknown`. It never
 * guesses: an unrecognised or unavailable renderer string is `unknown`, not `hardware`.
 */

export type AccelerationClass = 'hardware' | 'software' | 'unknown'

export interface RendererIdentity {
  /** `gl.VENDOR` (may be masked by the browser). */
  vendor: string
  /** `gl.RENDERER` (may be masked by the browser). */
  renderer: string
  /** `WEBGL_debug_renderer_info.UNMASKED_VENDOR_WEBGL` when the extension is available. */
  unmaskedVendor: string
  /** `WEBGL_debug_renderer_info.UNMASKED_RENDERER_WEBGL` when the extension is available. */
  unmaskedRenderer: string
}

export const UNKNOWN_RENDERER_IDENTITY: RendererIdentity = {
  vendor: '',
  renderer: '',
  unmaskedVendor: '',
  unmaskedRenderer: '',
}

const GL_VENDOR = 0x1f00
const GL_RENDERER = 0x1f01

interface DebugRendererInfo {
  UNMASKED_VENDOR_WEBGL: number
  UNMASKED_RENDERER_WEBGL: number
}

type WebGLDebugInfoContext = {
  getParameter(name: number): unknown
  getExtension(name: string): unknown
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * Reads the renderer identity from a WebGL context. Returns the empty identity when the context is
 * missing; never throws on a locked-down or partially available browser.
 */
export function readRendererIdentity(gl: WebGLDebugInfoContext | null | undefined): RendererIdentity {
  if (!gl) return { ...UNKNOWN_RENDERER_IDENTITY }

  let vendor = ''
  let renderer = ''
  let unmaskedVendor = ''
  let unmaskedRenderer = ''

  try {
    vendor = asString(gl.getParameter(GL_VENDOR))
    renderer = asString(gl.getParameter(GL_RENDERER))
    const debug = gl.getExtension('WEBGL_debug_renderer_info') as DebugRendererInfo | null
    if (debug) {
      unmaskedVendor = asString(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL))
      unmaskedRenderer = asString(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL))
    }
  } catch {
    return { ...UNKNOWN_RENDERER_IDENTITY }
  }

  return { vendor, renderer, unmaskedVendor, unmaskedRenderer }
}

/** True when the identity carries any renderer/vendor string at all. */
export function hasRendererIdentity(identity: RendererIdentity | null | undefined): boolean {
  if (!identity) return false
  return [identity.vendor, identity.renderer, identity.unmaskedVendor, identity.unmaskedRenderer].some(
    (value) => value.trim().length > 0,
  )
}

/**
 * Software rasterizer markers. Checked before hardware markers because ANGLE also emits hardware
 * strings on top of e.g. SwiftShader ("ANGLE (Google, Vulkan ... SwiftShader device)").
 */
const SOFTWARE_MARKERS = [
  'swiftshader',
  'llvmpipe',
  'softpipe',
  'lavapipe',
  'software rasterizer',
  'software adapter',
  'microsoft basic render',
  'mesa offscreen',
  'null renderer',
]

/** Hardware renderer/vendor markers (GPU vendors and hardware graphics APIs). */
const HARDWARE_MARKERS = [
  'nvidia',
  'geforce',
  'quadro',
  'rtx ',
  'gtx ',
  'radeon',
  'advanced micro devices',
  ' amd ',
  'intel',
  'iris',
  'uhd graphics',
  'hd graphics',
  'arc graphics',
  'apple m',
  'apple gpu',
  'adreno',
  'mali',
  'videocore',
  'direct3d11',
  'direct3d12',
  'd3d11',
  'd3d12',
  'opengl',
  'metal',
  'vulkan',
]

/** Classifies a renderer identity without over-claiming: unknown strings stay `unknown`. */
export function classifyAcceleration(identity: RendererIdentity | null | undefined): AccelerationClass {
  if (!hasRendererIdentity(identity)) return 'unknown'

  const haystack = [
    identity!.unmaskedVendor,
    identity!.unmaskedRenderer,
    identity!.vendor,
    identity!.renderer,
  ]
    .join(' ')
    .toLowerCase()

  if (SOFTWARE_MARKERS.some((marker) => haystack.includes(marker))) return 'software'
  if (HARDWARE_MARKERS.some((marker) => haystack.includes(marker))) return 'hardware'
  return 'unknown'
}

/** Short human-readable label for a run result, never stronger than the classification. */
export function describeAcceleration(acceleration: AccelerationClass): string {
  switch (acceleration) {
    case 'hardware':
      return 'hardware-accelerated'
    case 'software':
      return 'software rendering (not a GPU result)'
    default:
      return 'acceleration not verified'
  }
}
