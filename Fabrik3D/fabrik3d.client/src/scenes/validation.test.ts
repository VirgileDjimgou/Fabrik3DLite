import { describe, expect, it } from 'vitest'
import { BUILT_IN_SCENE_PRESETS } from './catalog'
import { SCENARIO_CATALOG } from '../scenarios/catalog'
import { validateScenePreset } from './validation'
import type { ScenePreset } from './types'

const knownScenarios = new Set(SCENARIO_CATALOG.map(scenario => scenario.id))
const copy = (index = 0): ScenePreset => structuredClone(BUILT_IN_SCENE_PRESETS[index]!)

describe('validateScenePreset', () => {
  it('accepts the built-in executable presets', () => {
    expect(BUILT_IN_SCENE_PRESETS.flatMap(preset => validateScenePreset(preset, knownScenarios))).toEqual([])
  })

  it('rejects an unknown compatible scenario', () => {
    const preset = copy()
    preset.compatibleScenarioIds.push('missing-scenario')
    expect(validateScenePreset(preset, knownScenarios)).toContainEqual(expect.objectContaining({ code: 'unknown_scenario' }))
  })

  it('rejects a default scenario outside the compatible list', () => {
    const preset = copy()
    preset.defaultScenarioId = 'robot-axes'
    preset.compatibleScenarioIds = ['pallet-processing']
    expect(validateScenePreset(preset, knownScenarios)).toContainEqual(expect.objectContaining({ code: 'invalid_default_scenario' }))
  })

  it('rejects runtime declarations on a layout-only preset', () => {
    const preset = copy()
    preset.capability = 'layout-only'
    preset.runtimeProfile = 'single-conveyor-machining'
    expect(validateScenePreset(preset, knownScenarios)).toContainEqual(expect.objectContaining({ code: 'layout_runtime_mismatch' }))
  })

  it('rejects non-finite equipment transforms', () => {
    const preset = copy()
    preset.cell.equipment[0]!.transform.position.x = Number.NaN
    expect(validateScenePreset(preset, knownScenarios)).toContainEqual(expect.objectContaining({ code: 'invalid_transform' }))
  })
})
