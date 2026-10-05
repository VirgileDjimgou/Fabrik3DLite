import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  DEFAULT_LOCAL_LIGHT_PLACEMENTS,
  INDUSTRIAL_ENVIRONMENT_PRESETS,
  INDUSTRIAL_ENVIRONMENT_SCHEMA_VERSION,
  LOCAL_LIGHT_KINDS,
  MAX_LOCAL_LIGHT_BUDGET,
  SHADOW_CASTING_KEY_LIGHT_COUNT,
  buildIndustrialEnvironmentScene,
  createGradientBackgroundTexture,
  disposeIndustrialEnvironmentScene,
  industrialEnvironmentDefinition,
  validateIndustrialEnvironmentPresets,
} from './industrialEnvironment'

describe('industrial environment presets (S74)', () => {
  it('declares a coherent, bounded configuration for every quality preset', () => {
    expect(validateIndustrialEnvironmentPresets()).toEqual([])
    for (const quality of ['low', 'medium', 'high'] as const) {
      const preset = INDUSTRIAL_ENVIRONMENT_PRESETS[quality]
      expect(preset.localLightBudget).toBeLessThanOrEqual(MAX_LOCAL_LIGHT_BUDGET)
      expect(preset.localLightsCastShadow).toBe(false)
      expect(preset.environmentIntensity).toBeGreaterThan(0)
    }
  })

  it('keeps low quality cheapest and high quality richest', () => {
    expect(INDUSTRIAL_ENVIRONMENT_PRESETS.low.fogDensity).toBe(0)
    expect(INDUSTRIAL_ENVIRONMENT_PRESETS.low.localLightBudget).toBe(0)
    expect(INDUSTRIAL_ENVIRONMENT_PRESETS.medium.fogDensity).toBeGreaterThan(0)
    expect(INDUSTRIAL_ENVIRONMENT_PRESETS.high.localLightBudget).toBeGreaterThan(
      INDUSTRIAL_ENVIRONMENT_PRESETS.medium.localLightBudget,
    )
    expect(INDUSTRIAL_ENVIRONMENT_PRESETS.high.environmentIntensity).toBeGreaterThan(
      INDUSTRIAL_ENVIRONMENT_PRESETS.medium.environmentIntensity,
    )
  })

  it('exposes a versioned definition with exactly one shadow-casting key light', () => {
    const definition = industrialEnvironmentDefinition('medium')
    expect(definition.schemaVersion).toBe(INDUSTRIAL_ENVIRONMENT_SCHEMA_VERSION)
    expect(definition.kind).toBe('framework-industrial-environment')
    expect(definition.shadowCastingLights).toBe(SHADOW_CASTING_KEY_LIGHT_COUNT)
    expect(definition.lightBudget).toBe(INDUSTRIAL_ENVIRONMENT_PRESETS.medium.localLightBudget)
    expect(definition.localLightKinds).toEqual([...LOCAL_LIGHT_KINDS])
    expect(definition.fog.density).toBeGreaterThan(0)
    expect(definition.background.top).not.toBe(definition.background.bottom)
  })

  it('clamps the declared light budget to the hard ceiling', () => {
    const definition = industrialEnvironmentDefinition('high')
    expect(definition.lightBudget).toBeLessThanOrEqual(MAX_LOCAL_LIGHT_BUDGET)
  })
})

describe('industrial environment scene builder (S74)', () => {
  it('builds a deterministic softbox rig with no Math.random or Date.now', () => {
    const first = buildIndustrialEnvironmentScene()
    const second = buildIndustrialEnvironmentScene()
    const names = (scene: THREE.Scene) => {
      const list: string[] = []
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) list.push(child.name)
      })
      return list.sort()
    }
    expect(names(first)).toEqual(names(second))
    expect(names(first)).toContain('env:ceiling-softbox')
    expect(names(first)).toContain('env:softbox-left')
    expect(names(first)).toContain('env:softbox-right')
    disposeIndustrialEnvironmentScene(first)
    disposeIndustrialEnvironmentScene(second)
  })

  it('disposes every geometry and material it owns', () => {
    const scene = buildIndustrialEnvironmentScene()
    const geometries = new Set<THREE.BufferGeometry>()
    const materials = new Set<THREE.Material>()
    scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      geometries.add(child.geometry)
      const list = Array.isArray(child.material) ? child.material : [child.material]
      for (const material of list) materials.add(material)
    })
    const disposedGeometries = new Set<THREE.BufferGeometry>()
    const disposedMaterials = new Set<THREE.Material>()
    for (const geometry of geometries) geometry.addEventListener('dispose', () => disposedGeometries.add(geometry))
    for (const material of materials) material.addEventListener('dispose', () => disposedMaterials.add(material))
    disposeIndustrialEnvironmentScene(scene)
    expect(disposedGeometries.size).toBe(geometries.size)
    expect(disposedMaterials.size).toBe(materials.size)
  })
})

describe('gradient background texture (S74)', () => {
  it('produces a deterministic sRGB gradient with distinct top and bottom rows', () => {
    const texture = createGradientBackgroundTexture(0x1d262e, 0x39434a)
    expect(texture).toBeInstanceOf(THREE.DataTexture)
    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace)
    const image = texture.image as { data: Uint8Array; width: number; height: number }
    const data = image.data
    const width = image.width
    const height = image.height
    const top = [data[0], data[1], data[2]]
    const bottomIndex = (height - 1) * width * 4
    const bottom = [data[bottomIndex], data[bottomIndex + 1], data[bottomIndex + 2]]
    expect(top).not.toEqual(bottom)
    texture.dispose()
  })

  it('is byte-identical for the same inputs', () => {
    const a = createGradientBackgroundTexture(0x1d262e, 0x39434a)
    const b = createGradientBackgroundTexture(0x1d262e, 0x39434a)
    const aData = (a.image as { data: Uint8Array }).data
    const bData = (b.image as { data: Uint8Array }).data
    expect(Array.from(aData)).toEqual(Array.from(bData))
    a.dispose()
    b.dispose()
  })
})

describe('default local light placements (S74)', () => {
  it('stays within the hard budget and uses only declared kinds', () => {
    expect(DEFAULT_LOCAL_LIGHT_PLACEMENTS.length).toBeLessThanOrEqual(MAX_LOCAL_LIGHT_BUDGET)
    for (const placement of DEFAULT_LOCAL_LIGHT_PLACEMENTS) {
      expect(LOCAL_LIGHT_KINDS).toContain(placement.kind)
    }
  })
})
