/**
 * S74 optional, quality-gated post-processing.
 *
 * The composer path is deliberately optional and fail-closed: it is only built
 * for the `medium`/`high` quality presets on a hardware-accelerated WebGL2
 * renderer. `low` quality, a software rasterizer (headless CI) and any
 * unsupported environment fall back to the existing direct
 * `renderer.render(scene, camera)` path, so the simulator can never be left
 * without a working renderer.
 *
 * Passes (quality-gated):
 * - `medium`: cheap depth AO + selective bloom + FXAA.
 * - `high`:   cheap depth AO + selective bloom + FXAA (stronger AO).
 * - `low`:    none — direct render.
 *
 * The AO is a *cheap depth AO*: it reuses the depth buffer produced by the scene
 * beauty pass and applies a small screen-space occlusion term, so it never
 * re-renders the scene (unlike `SSAOPass`, which doubles the scene draw calls and
 * measured below the 60 FPS reference target on the reference integrated GPU).
 * The AO and bloom targets run at a reduced internal resolution (`renderScale`)
 * while the scene beauty pass and the final anti-aliasing stay at full
 * resolution, so the scene stays sharp.
 *
 * Boundaries:
 * - Visual-only. Post-processing never changes simulation timing, determinism,
 *   state, signals, safety or collision.
 * - Bloom is selective and bounded so status colors stay readable: the threshold
 *   is high enough that only emissive screens/signals bloom, and the strength is
 *   kept low.
 * - No new runtime dependency: only the `three/examples/jsm` modules already
 *   shipped with the pinned `three` package are used.
 */

import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import type { SceneQuality } from '../../composables/useThreeScene'
import { classifyAcceleration, readRendererIdentity, type AccelerationClass } from '../../observability/acceleration'

export const POST_PROCESSING_SCHEMA_VERSION = '1.0' as const

export type PostProcessingPassId = 'depth-ao' | 'bloom' | 'fxaa'

export interface PostProcessingPreset {
  /** Whether the composer path is enabled for this quality preset. */
  enabled: boolean
  /** Ordered pass ids applied when enabled. */
  passes: PostProcessingPassId[]
  /** Depth-AO sample radius in UV units (higher = wider occlusion). */
  aoRadius: number
  /** Depth-AO intensity. */
  aoIntensity: number
  /** Depth-AO depth bias; larger values ignore small depth differences. */
  aoBias: number
  /** Bloom strength (kept low so status colors stay readable). */
  bloomStrength: number
  /** Bloom radius. */
  bloomRadius: number
  /** Luminance threshold above which a pixel contributes to bloom. */
  bloomThreshold: number
  /**
   * Fraction of the full resolution used for the AO and bloom internal targets.
   * The scene beauty pass and the final anti-aliasing stay at full resolution.
   */
  renderScale: number
}

/**
 * Per-quality post-processing configuration. `low` is intentionally disabled so
 * the cheapest preset always uses the direct render path.
 */
export const POST_PROCESSING_PRESETS: Record<SceneQuality, PostProcessingPreset> = {
  low: {
    enabled: false,
    passes: [],
    aoRadius: 0,
    aoIntensity: 0,
    aoBias: 0,
    bloomStrength: 0,
    bloomRadius: 0,
    bloomThreshold: 1,
    renderScale: 1,
  },
  medium: {
    enabled: true,
    passes: ['depth-ao', 'bloom', 'fxaa'],
    aoRadius: 0.0025,
    aoIntensity: 0.85,
    aoBias: 0.0006,
    bloomStrength: 0.35,
    bloomRadius: 0.4,
    bloomThreshold: 0.85,
    renderScale: 0.45,
  },
  high: {
    enabled: true,
    passes: ['depth-ao', 'bloom', 'fxaa'],
    aoRadius: 0.0035,
    aoIntensity: 1.1,
    aoBias: 0.0004,
    bloomStrength: 0.45,
    bloomRadius: 0.5,
    bloomThreshold: 0.8,
    renderScale: 0.45,
  },
}

export interface PostProcessingCapabilities {
  /** Whether the renderer exposes a WebGL2 context. */
  webgl2: boolean
  /** Whether the renderer context is available at all. */
  hasContext: boolean
  /**
   * Honest acceleration classification of the renderer. Post-processing is only
   * enabled on a `hardware` renderer: a software rasterizer (headless CI) or an
   * unidentified renderer falls back to the direct render path, which keeps the
   * simulator usable and the visual baselines deterministic.
   */
  acceleration: AccelerationClass
}

export interface PostProcessingDecision {
  enabled: boolean
  passes: PostProcessingPassId[]
  /** Human-readable reason, always populated (used by diagnostics/tests). */
  reason: string
}

/**
 * Pure fallback decision. It is the single source of truth for whether the
 * composer path is used, so the render loop and the tests agree.
 */
export function resolvePostProcessingDecision(
  quality: SceneQuality,
  capabilities: PostProcessingCapabilities,
): PostProcessingDecision {
  const preset = POST_PROCESSING_PRESETS[quality]
  if (!preset.enabled) {
    return { enabled: false, passes: [], reason: `quality '${quality}' uses the direct render path` }
  }
  if (!capabilities.hasContext) {
    return { enabled: false, passes: [], reason: 'no WebGL context available' }
  }
  if (!capabilities.webgl2) {
    return { enabled: false, passes: [], reason: 'post-processing requires a WebGL2 context' }
  }
  if (capabilities.acceleration !== 'hardware') {
    return {
      enabled: false,
      passes: [],
      reason: `post-processing requires a hardware-accelerated renderer (observed '${capabilities.acceleration}')`,
    }
  }
  return { enabled: true, passes: [...preset.passes], reason: `quality '${quality}' enables ${preset.passes.join('+')}` }
}

/** Reads the capabilities of a live renderer. */
export function readPostProcessingCapabilities(renderer: THREE.WebGLRenderer): PostProcessingCapabilities {
  const context = renderer.getContext()
  return {
    hasContext: Boolean(context),
    webgl2: typeof WebGL2RenderingContext !== 'undefined' && context instanceof WebGL2RenderingContext,
    acceleration: classifyAcceleration(readRendererIdentity(context)),
  }
}

/**
 * Cheap depth-based ambient occlusion shader. It samples the scene depth texture
 * at the current pixel and four neighbours and darkens pixels whose neighbours
 * are closer to the camera, producing a bounded contact-shadow-like term without
 * a second scene render.
 */
export const DepthAOVertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const DepthAOFragmentShader = /* glsl */ `
#include <common>
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform vec2 resolution;
uniform float cameraNear;
uniform float cameraFar;
uniform float aoRadius;
uniform float aoIntensity;
uniform float aoBias;
varying vec2 vUv;

float linearDepth(float depth) {
  float z = depth * 2.0 - 1.0;
  return (2.0 * cameraNear * cameraFar) / (cameraFar + cameraNear - z * (cameraFar - cameraNear));
}

void main() {
  vec4 color = texture2D(tDiffuse, vUv);
  float centerDepth = linearDepth(texture2D(tDepth, vUv).x);
  vec2 texel = aoRadius / resolution;
  float occlusion = 0.0;
  occlusion += step(centerDepth - aoBias, linearDepth(texture2D(tDepth, vUv + vec2(texel.x, 0.0)).x));
  occlusion += step(centerDepth - aoBias, linearDepth(texture2D(tDepth, vUv - vec2(texel.x, 0.0)).x));
  occlusion += step(centerDepth - aoBias, linearDepth(texture2D(tDepth, vUv + vec2(0.0, texel.y)).x));
  occlusion += step(centerDepth - aoBias, linearDepth(texture2D(tDepth, vUv - vec2(0.0, texel.y)).x));
  float ao = 1.0 - (occlusion / 4.0) * aoIntensity;
  gl_FragColor = vec4(color.rgb * clamp(ao, 0.0, 1.0), color.a);
}
`

export interface PostProcessingHandle {
  composer: EffectComposer
  passes: PostProcessingPassId[]
  /** Renders one frame through the composer. */
  render(): void
  /** Re-applies the renderer pixel ratio and resizes every pass. */
  setSize(width: number, height: number, pixelRatio: number): void
  /**
   * Draw calls and triangles issued by the scene beauty pass (the `RenderPass`),
   * not the trailing fullscreen post passes. This keeps the frame metrics and the
   * GPU benchmark honest when the composer is active.
   */
  sceneRenderStats(): { drawCalls: number; triangles: number }
  dispose(): void
}

export interface PostProcessingOptions {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  quality: SceneQuality
  width: number
  height: number
  pixelRatio: number
}

/**
 * Builds the composer for a quality preset. Returns `null` when the fallback
 * decision disables post-processing, so the caller keeps the direct render path.
 */
export function createPostProcessing(options: PostProcessingOptions): PostProcessingHandle | null {
  const decision = resolvePostProcessingDecision(options.quality, readPostProcessingCapabilities(options.renderer))
  if (!decision.enabled) return null

  const preset = POST_PROCESSING_PRESETS[options.quality]
  const pixelWidth = Math.max(1, Math.round(options.width * options.pixelRatio))
  const pixelHeight = Math.max(1, Math.round(options.height * options.pixelRatio))

  // The composer render target carries a depth texture so the cheap AO pass can
  // reuse the scene depth instead of re-rendering the scene.
  const depthTexture = new THREE.DepthTexture(pixelWidth, pixelHeight)
  depthTexture.name = 'S74.composer.depth'
  const renderTarget = new THREE.WebGLRenderTarget(pixelWidth, pixelHeight, {
    type: THREE.HalfFloatType,
    depthTexture,
  })
  renderTarget.texture.name = 'S74.composer'

  const composer = new EffectComposer(options.renderer, renderTarget)
  composer.setPixelRatio(options.pixelRatio)
  composer.setSize(options.width, options.height)

  // Reduced internal resolution for the AO and bloom targets. The scene beauty
  // pass and the final anti-aliasing stay at full resolution.
  const scaledWidth = Math.max(1, Math.round(pixelWidth * preset.renderScale))
  const scaledHeight = Math.max(1, Math.round(pixelHeight * preset.renderScale))

  // Capture the scene beauty-pass stats before the trailing fullscreen passes
  // overwrite `renderer.info.render`. Without this the frame metrics would report
  // the last fullscreen quad (1 draw call) instead of the real scene cost.
  let sceneDrawCalls = 0
  let sceneTriangles = 0
  const renderPass = new RenderPass(options.scene, options.camera)
  const originalRenderPassRender = renderPass.render.bind(renderPass)
  renderPass.render = (renderer, writeBuffer, readBuffer, deltaTime, maskActive) => {
    originalRenderPassRender(renderer, writeBuffer, readBuffer, deltaTime, maskActive)
    sceneDrawCalls = renderer.info.render.calls
    sceneTriangles = renderer.info.render.triangles
  }
  composer.addPass(renderPass)

  let aoPass: ShaderPass | null = null
  if (decision.passes.includes('depth-ao')) {
    aoPass = new ShaderPass({
      name: 'DepthAOPass',
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: depthTexture },
        resolution: { value: new THREE.Vector2(scaledWidth, scaledHeight) },
        cameraNear: { value: options.camera.near },
        cameraFar: { value: options.camera.far },
        aoRadius: { value: preset.aoRadius },
        aoIntensity: { value: preset.aoIntensity },
        aoBias: { value: preset.aoBias },
      },
      vertexShader: DepthAOVertexShader,
      fragmentShader: DepthAOFragmentShader,
    })
    composer.addPass(aoPass)
  }

  let bloomPass: UnrealBloomPass | null = null
  if (decision.passes.includes('bloom')) {
    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(scaledWidth, scaledHeight),
      preset.bloomStrength,
      preset.bloomRadius,
      preset.bloomThreshold,
    )
    composer.addPass(bloomPass)
    // `EffectComposer.addPass` resizes every pass back to the full drawing
    // buffer, so re-apply the reduced internal bloom size *after* adding it.
    // This is what actually keeps the bloom mip chain at `renderScale`.
    bloomPass.setSize(scaledWidth, scaledHeight)
  }

  if (decision.passes.includes('fxaa')) {
    composer.addPass(new FXAAPass())
  }

  // OutputPass applies tone mapping + color space conversion at the end of the
  // chain; without it the composer output would not match the direct path.
  composer.addPass(new OutputPass())

  return {
    composer,
    passes: [...decision.passes],
    render: () => composer.render(),
    setSize: (width, height, pixelRatio) => {
      composer.setPixelRatio(pixelRatio)
      composer.setSize(width, height)
      const nextPixelWidth = Math.max(1, Math.round(width * pixelRatio))
      const nextPixelHeight = Math.max(1, Math.round(height * pixelRatio))
      const nextScaledWidth = Math.max(1, Math.round(nextPixelWidth * preset.renderScale))
      const nextScaledHeight = Math.max(1, Math.round(nextPixelHeight * preset.renderScale))
      if (aoPass) aoPass.uniforms.resolution!.value.set(nextScaledWidth, nextScaledHeight)
      bloomPass?.setSize(nextScaledWidth, nextScaledHeight)
    },
    sceneRenderStats: () => ({ drawCalls: sceneDrawCalls, triangles: sceneTriangles }),
    dispose: () => {
      composer.dispose()
      depthTexture.dispose()
    },
  }
}

/** Structural validation of the post-processing presets; returns problems. */
export function validatePostProcessingPresets(): string[] {
  const problems: string[] = []
  for (const quality of ['low', 'medium', 'high'] as const) {
    const preset = POST_PROCESSING_PRESETS[quality]
    if (preset.enabled && preset.passes.length === 0) {
      problems.push(`${quality}: enabled preset must declare at least one pass`)
    }
    if (!preset.enabled && preset.passes.length > 0) {
      problems.push(`${quality}: disabled preset must not declare passes`)
    }
    if (!(preset.bloomStrength >= 0 && preset.bloomStrength <= 1)) {
      problems.push(`${quality}: bloomStrength out of range (${preset.bloomStrength})`)
    }
    if (!(preset.bloomThreshold >= 0 && preset.bloomThreshold <= 1)) {
      problems.push(`${quality}: bloomThreshold out of range (${preset.bloomThreshold})`)
    }
    if (preset.enabled && preset.bloomThreshold < 0.5) {
      problems.push(`${quality}: bloomThreshold too low; status colors would wash out (${preset.bloomThreshold})`)
    }
    if (!(preset.renderScale > 0 && preset.renderScale <= 1)) {
      problems.push(`${quality}: renderScale out of range (${preset.renderScale})`)
    }
    if (preset.enabled && !(preset.aoIntensity > 0 && preset.aoIntensity <= 2)) {
      problems.push(`${quality}: aoIntensity out of range (${preset.aoIntensity})`)
    }
  }
  return problems
}
