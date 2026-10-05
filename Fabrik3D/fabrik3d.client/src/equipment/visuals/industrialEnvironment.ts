/**
 * S74 deterministic industrial-hall environment, atmosphere and bounded local lighting.
 *
 * This module replaces the generic neutral `RoomEnvironment` PMREM with a
 * repository-generated industrial-hall environment (a procedural sky/softbox rig
 * rendered into a PMREM cube), a gradient background, a subtle distance fog and a
 * bounded local-lighting vocabulary (work lights, machine-hood spots and emissive
 * fixtures tied to the existing `work-light` / `screen-emissive` materials).
 *
 * Boundaries:
 * - Visual-only. Nothing here becomes collision, runtime, scenario, signal or
 *   telemetry truth (`Definition ≠ Runtime ≠ Visual ≠ Collision ≠ Telemetry`).
 * - Deterministic: the same quality preset always produces the same environment
 *   intensity, fog, background and light budget. No `Math.random`, no `Date.now`,
 *   no downloaded HDRI and no new runtime dependency.
 * - Bounded: every preset declares a hard light budget and a single shadow-casting
 *   key light. The local lights are decorative and never drive state.
 */

import * as THREE from 'three'
import type { SceneQuality } from '../../composables/useThreeScene'
import { ambientBrightnessApplication } from './ambientBrightness'

export const INDUSTRIAL_ENVIRONMENT_SCHEMA_VERSION = '1.0' as const

/** Background/fog/light configuration for one quality preset. */
export interface IndustrialEnvironmentPreset {
  /** PMREM environment intensity applied to `scene.environmentIntensity`. */
  environmentIntensity: number
  /** Horizon (top) color of the gradient background. */
  backgroundTop: number
  /** Ground (bottom) color of the gradient background. */
  backgroundBottom: number
  /** Fog color; kept close to the horizon so distant geometry fades coherently. */
  fogColor: number
  /** Exponential-squared fog density (0 disables fog). */
  fogDensity: number
  /** Hemisphere light intensity (ambient sky/ground bounce). */
  hemisphereIntensity: number
  /** Single shadow-casting key light intensity. */
  keyLightIntensity: number
  /** Non-shadow fill light intensity. */
  fillLightIntensity: number
  /** Maximum number of decorative local lights (work lights + hood spots). */
  localLightBudget: number
  /** Whether the decorative local lights cast shadows (never; only the key light does). */
  localLightsCastShadow: boolean
}

/**
 * Per-quality atmosphere and lighting budget. Low quality keeps the scene cheap
 * (no fog, no local lights, no shadows); medium is the reference; high adds a
 * denser atmosphere and the full local-light budget.
 *
 * Values were raised from the original S74 baseline so the shipped default
 * reads as a lit hall rather than a dark room. The user-adjustable ambient
 * brightness (`ambientBrightness.ts`) multiplies the environment, hemisphere,
 * fill and local-light terms at runtime; the key light and shadow setup stay
 * fixed so contrast and shadows remain readable.
 */
export const INDUSTRIAL_ENVIRONMENT_PRESETS: Record<SceneQuality, IndustrialEnvironmentPreset> = {
  low: {
    environmentIntensity: 0.75,
    backgroundTop: 0x28333c,
    backgroundBottom: 0x3d4850,
    fogColor: 0x333d45,
    fogDensity: 0,
    hemisphereIntensity: 1.45,
    keyLightIntensity: 2.2,
    fillLightIntensity: 0.55,
    localLightBudget: 0,
    localLightsCastShadow: false,
  },
  medium: {
    environmentIntensity: 1.15,
    backgroundTop: 0x2b3740,
    backgroundBottom: 0x4d5961,
    fogColor: 0x39444c,
    fogDensity: 0.012,
    hemisphereIntensity: 1.75,
    keyLightIntensity: 2.6,
    fillLightIntensity: 0.75,
    localLightBudget: 6,
    localLightsCastShadow: false,
  },
  high: {
    environmentIntensity: 1.3,
    backgroundTop: 0x2e3b45,
    backgroundBottom: 0x556169,
    fogColor: 0x3e4952,
    fogDensity: 0.016,
    hemisphereIntensity: 1.95,
    keyLightIntensity: 2.85,
    fillLightIntensity: 0.85,
    localLightBudget: 7,
    localLightsCastShadow: false,
  },
}

/** Hard ceiling on decorative local lights regardless of preset. */
export const MAX_LOCAL_LIGHT_BUDGET = 10

/** The single shadow-casting key light is always exactly one. */
export const SHADOW_CASTING_KEY_LIGHT_COUNT = 1

export interface IndustrialEnvironmentDefinition {
  schemaVersion: typeof INDUSTRIAL_ENVIRONMENT_SCHEMA_VERSION
  kind: 'framework-industrial-environment'
  quality: SceneQuality
  environmentIntensity: number
  background: { top: number; bottom: number }
  fog: { color: number; density: number }
  lightBudget: number
  shadowCastingLights: number
  /** Stable ids of the local light fixtures the builder may place. */
  localLightKinds: string[]
}

/** Declared local-light vocabulary; each entry is a bounded decorative fixture. */
export const LOCAL_LIGHT_KINDS = Object.freeze([
  'work-light',
  'machine-hood-spot',
  'emissive-fixture',
] as const)

export type LocalLightKind = (typeof LOCAL_LIGHT_KINDS)[number]

/** Reads the declared definition for a quality preset (pure, testable). */
export function industrialEnvironmentDefinition(quality: SceneQuality): IndustrialEnvironmentDefinition {
  const preset = INDUSTRIAL_ENVIRONMENT_PRESETS[quality]
  return {
    schemaVersion: INDUSTRIAL_ENVIRONMENT_SCHEMA_VERSION,
    kind: 'framework-industrial-environment',
    quality,
    environmentIntensity: preset.environmentIntensity,
    background: { top: preset.backgroundTop, bottom: preset.backgroundBottom },
    fog: { color: preset.fogColor, density: preset.fogDensity },
    lightBudget: Math.min(preset.localLightBudget, MAX_LOCAL_LIGHT_BUDGET),
    shadowCastingLights: SHADOW_CASTING_KEY_LIGHT_COUNT,
    localLightKinds: [...LOCAL_LIGHT_KINDS],
  }
}

/**
 * Builds the procedural industrial-hall environment scene used for the PMREM
 * capture. It is a deterministic softbox rig: a large emissive ceiling panel,
 * two side softboxes and a dark floor, which produces a coherent hall-like
 * reflection without any downloaded HDRI.
 */
export function buildIndustrialEnvironmentScene(): THREE.Scene {
  const scene = new THREE.Scene()
  scene.name = 'industrial-hall-environment'

  const box = new THREE.BoxGeometry(1, 1, 1)
  box.deleteAttribute('uv')

  const addPanel = (
    name: string,
    color: number,
    intensity: number,
    position: [number, number, number],
    scale: [number, number, number],
  ): THREE.Mesh => {
    const material = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide })
    material.color.multiplyScalar(intensity)
    const mesh = new THREE.Mesh(box, material)
    mesh.name = name
    mesh.position.set(...position)
    mesh.scale.set(...scale)
    scene.add(mesh)
    return mesh
  }

  // Dark hall shell.
  addPanel('env:shell', 0x1a2026, 1, [0, 0, 0], [20, 12, 20])
  // Bright ceiling softbox (the dominant key reflection).
  addPanel('env:ceiling-softbox', 0xf2f6ff, 3.2, [0, 5.6, 0], [12, 0.2, 12])
  // Two side softboxes for a soft, directional wrap.
  addPanel('env:softbox-left', 0xdfeaf2, 1.6, [-8, 2.5, 0], [0.2, 6, 10])
  addPanel('env:softbox-right', 0xdfeaf2, 1.6, [8, 2.5, 0], [0.2, 6, 10])
  // Warm work-light strip near the floor line.
  addPanel('env:work-strip', 0xfff4df, 1.1, [0, 1.2, -8], [14, 0.2, 0.2])

  return scene
}

/** Disposes every geometry/material owned by the environment scene. */
export function disposeIndustrialEnvironmentScene(scene: THREE.Scene): void {
  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.geometry.dispose()
    const material = child.material
    if (Array.isArray(material)) material.forEach((item) => item.dispose())
    else material.dispose()
  })
}

export interface IndustrialEnvironmentHandle {
  /** PMREM environment texture assigned to `scene.environment`. */
  environmentTexture: THREE.Texture
  /** Gradient background texture assigned to `scene.background`. */
  backgroundTexture: THREE.Texture
  /** The single shadow-casting key light. */
  keyLight: THREE.DirectionalLight
  /** Decorative local lights actually placed (bounded by the preset budget). */
  localLights: THREE.Light[]
  /** Declared definition for diagnostics/tests. */
  definition: IndustrialEnvironmentDefinition
  /** Current ambient brightness multiplier (1 = the preset baseline). */
  ambientBrightness: number
  /**
   * Applies a clamped ambient brightness multiplier live. It scales the
   * environment, hemisphere, fill and local-light terms and the background
   * intensity; the key light, shadows and post-processing are untouched.
   * Visual-only: never state, signal, safety, collision or telemetry truth.
   */
  setAmbientBrightness(multiplier: number): void
  dispose(): void
}

export interface IndustrialEnvironmentOptions {
  quality: SceneQuality
  /** Renderer used for the PMREM capture. */
  renderer: THREE.WebGLRenderer
  /** Scene the environment is applied to. */
  scene: THREE.Scene
  /** Optional deterministic local-light placements; defaults to a bounded rig. */
  localLightPlacements?: readonly LocalLightPlacement[]
}

export interface LocalLightPlacement {
  kind: LocalLightKind
  position: [number, number, number]
  color?: number
  intensity?: number
  distance?: number
}

/** Default bounded local-light rig: work lights over the cell and hood spots. */
export const DEFAULT_LOCAL_LIGHT_PLACEMENTS: readonly LocalLightPlacement[] = Object.freeze([
  { kind: 'work-light', position: [0, 3.4, 0], color: 0xfff4df, intensity: 1.1, distance: 9 },
  { kind: 'work-light', position: [-3.2, 3.2, 2.4], color: 0xfff4df, intensity: 0.8, distance: 7 },
  { kind: 'work-light', position: [3.2, 3.2, -2.4], color: 0xfff4df, intensity: 0.8, distance: 7 },
  { kind: 'machine-hood-spot', position: [2.4, 2.6, 1.2], color: 0xdfeaf2, intensity: 0.9, distance: 6 },
  { kind: 'machine-hood-spot', position: [-2.4, 2.6, -1.2], color: 0xdfeaf2, intensity: 0.9, distance: 6 },
  { kind: 'emissive-fixture', position: [0, 2.2, 3.6], color: 0x9fe3ff, intensity: 0.5, distance: 5 },
  { kind: 'work-light', position: [0, 3.4, -3.6], color: 0xfff4df, intensity: 0.7, distance: 7 },
  { kind: 'machine-hood-spot', position: [3.6, 2.4, 0], color: 0xdfeaf2, intensity: 0.7, distance: 6 },
  { kind: 'emissive-fixture', position: [-3.6, 2.2, 0], color: 0x9fe3ff, intensity: 0.45, distance: 5 },
  { kind: 'work-light', position: [0, 3.0, 3.6], color: 0xfff4df, intensity: 0.6, distance: 6 },
])

/**
 * Applies the industrial environment, gradient background, fog and bounded local
 * lighting to a scene. The caller owns the returned handle and must dispose it.
 */
export function applyIndustrialEnvironment(options: IndustrialEnvironmentOptions): IndustrialEnvironmentHandle {
  const { quality, renderer, scene } = options
  const preset = INDUSTRIAL_ENVIRONMENT_PRESETS[quality]
  const definition = industrialEnvironmentDefinition(quality)

  // ── PMREM environment ────────────────────────────────────────────
  const pmrem = new THREE.PMREMGenerator(renderer)
  const environmentScene = buildIndustrialEnvironmentScene()
  const environmentTarget = pmrem.fromScene(environmentScene, 0.04)
  disposeIndustrialEnvironmentScene(environmentScene)
  pmrem.dispose()
  scene.environment = environmentTarget.texture
  scene.environmentIntensity = preset.environmentIntensity

  // ── Gradient background ──────────────────────────────────────────
  const backgroundTexture = createGradientBackgroundTexture(preset.backgroundTop, preset.backgroundBottom)
  scene.background = backgroundTexture

  // ── Subtle distance fog ──────────────────────────────────────────
  if (preset.fogDensity > 0) {
    scene.fog = new THREE.FogExp2(preset.fogColor, preset.fogDensity)
  } else {
    scene.fog = null
  }

  // ── Bounded local lighting ───────────────────────────────────────
  const hemisphere = new THREE.HemisphereLight(0xdfeaf2, 0x2a3130, preset.hemisphereIntensity)
  hemisphere.name = 'env:hemisphere'
  scene.add(hemisphere)

  const keyLight = new THREE.DirectionalLight(0xfff4df, preset.keyLightIntensity)
  keyLight.name = 'env:key-light'
  keyLight.position.set(5, 8, 4)
  keyLight.castShadow = true
  scene.add(keyLight)

  const fillLight = new THREE.DirectionalLight(0x9bc8e8, preset.fillLightIntensity)
  fillLight.name = 'env:fill-light'
  fillLight.position.set(-3, 4, -2)
  scene.add(fillLight)

  const placements = options.localLightPlacements ?? DEFAULT_LOCAL_LIGHT_PLACEMENTS
  const localLights: THREE.Light[] = []
  // A `SpotLight` resolves its direction from `target.matrixWorld`, so the target
  // must be part of the scene graph (otherwise the spot would aim at the world
  // origin). Track them so disposal removes exactly what was added.
  const localLightTargets: THREE.Object3D[] = []
  for (const placement of placements) {
    if (localLights.length >= definition.lightBudget) break
    const { light, target } = createLocalLight(placement)
    scene.add(light)
    if (target) {
      scene.add(target)
      localLightTargets.push(target)
    }
    localLights.push(light)
  }
  // Base intensities so the ambient brightness multiplier scales rather than drifts.
  const baseLocalIntensities = localLights.map((light) => light.intensity)

  const applyAmbientBrightness = (multiplier: number): number => {
    const application = ambientBrightnessApplication(preset, multiplier)
    scene.environmentIntensity = application.environmentIntensity
    scene.backgroundIntensity = application.backgroundIntensity
    hemisphere.intensity = application.hemisphereIntensity
    fillLight.intensity = application.fillLightIntensity
    localLights.forEach((light, index) => {
      light.intensity = (baseLocalIntensities[index] ?? light.intensity) * application.localLightScale
    })
    return application.multiplier
  }

  const handle: IndustrialEnvironmentHandle = {
    environmentTexture: environmentTarget.texture,
    backgroundTexture,
    keyLight,
    localLights,
    definition,
    ambientBrightness: 1,
    setAmbientBrightness: (multiplier) => {
      handle.ambientBrightness = applyAmbientBrightness(multiplier)
    },
    dispose: () => {
      scene.remove(hemisphere)
      scene.remove(keyLight)
      scene.remove(fillLight)
      for (const light of localLights) scene.remove(light)
      for (const target of localLightTargets) scene.remove(target)
      environmentTarget.dispose()
      backgroundTexture.dispose()
      if (scene.environment === environmentTarget.texture) scene.environment = null
      if (scene.background === backgroundTexture) scene.background = null
      scene.fog = null
    },
  }

  return handle
}

function createLocalLight(placement: LocalLightPlacement): { light: THREE.Light; target: THREE.Object3D | null } {
  const color = placement.color ?? 0xfff4df
  const intensity = placement.intensity ?? 0.8
  const distance = placement.distance ?? 7
  if (placement.kind === 'machine-hood-spot') {
    const spot = new THREE.SpotLight(color, intensity, distance, Math.PI / 5, 0.4, 1.2)
    spot.name = `env:local:${placement.kind}`
    spot.position.set(...placement.position)
    spot.castShadow = false
    spot.target.name = `env:local-target:${placement.kind}`
    spot.target.position.set(placement.position[0], 0, placement.position[2])
    return { light: spot, target: spot.target }
  }
  const point = new THREE.PointLight(color, intensity, distance, 1.6)
  point.name = `env:local:${placement.kind}`
  point.position.set(...placement.position)
  point.castShadow = false
  return { light: point, target: null }
}

/**
 * Builds a deterministic vertical gradient background texture. It is generated
 * from a small canvas when available and falls back to a `DataTexture` in
 * headless hosts, so the background is never a missing texture.
 */
export function createGradientBackgroundTexture(top: number, bottom: number): THREE.Texture {
  const topColor = new THREE.Color(top)
  const bottomColor = new THREE.Color(bottom)
  const height = 64
  const width = 2
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    const t = y / (height - 1)
    const r = Math.round((topColor.r * (1 - t) + bottomColor.r * t) * 255)
    const g = Math.round((topColor.g * (1 - t) + bottomColor.g * t) * 255)
    const b = Math.round((topColor.b * (1 - t) + bottomColor.b * t) * 255)
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4
      data[index] = r
      data[index + 1] = g
      data[index + 2] = b
      data[index + 3] = 255
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat)
  texture.name = 'env:gradient-background'
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

/** Structural validation of the environment presets; returns human-readable problems. */
export function validateIndustrialEnvironmentPresets(): string[] {
  const problems: string[] = []
  for (const quality of ['low', 'medium', 'high'] as const) {
    const preset = INDUSTRIAL_ENVIRONMENT_PRESETS[quality]
    if (!(preset.environmentIntensity >= 0 && preset.environmentIntensity <= 4)) {
      problems.push(`${quality}: environmentIntensity out of range (${preset.environmentIntensity})`)
    }
    if (!(preset.fogDensity >= 0 && preset.fogDensity <= 0.1)) {
      problems.push(`${quality}: fogDensity out of range (${preset.fogDensity})`)
    }
    if (!(preset.localLightBudget >= 0 && preset.localLightBudget <= MAX_LOCAL_LIGHT_BUDGET)) {
      problems.push(`${quality}: localLightBudget out of range (${preset.localLightBudget})`)
    }
    if (preset.localLightsCastShadow) {
      problems.push(`${quality}: decorative local lights must never cast shadows`)
    }
    for (const key of ['backgroundTop', 'backgroundBottom', 'fogColor'] as const) {
      const value = preset[key]
      if (!Number.isInteger(value) || value < 0 || value > 0xffffff) {
        problems.push(`${quality}: ${key} must be a 24-bit sRGB hex (${value})`)
      }
    }
  }
  return problems
}
