import { describe, expect, it } from 'vitest'
import { BUILT_IN_SCENE_PRESETS, ScenePresetCatalog, createDefaultScenePresetCatalog } from '../scenes'
import { SCENARIO_CATALOG } from './catalog'
import { hasBindingErrors, resolveScenarioSceneBinding } from './sceneBinding'
import { SCENARIO_VISUAL_PROFILES } from './visualProfile'

describe('S58 scenario to scene binding', () => {
  const catalog = createDefaultScenePresetCatalog()

  it('resolves every simulation-ready scenario to a populated real cell without errors', () => {
    for (const preset of catalog.list().filter(candidate => candidate.capability === 'simulation-ready')) {
      for (const scenarioId of preset.compatibleScenarioIds) {
        const binding = resolveScenarioSceneBinding(scenarioId, catalog)
        expect(hasBindingErrors(binding), `${scenarioId}: ${JSON.stringify(binding.diagnostics)}`).toBe(false)
        expect(binding.cell.equipment.length, scenarioId).toBeGreaterThan(0)
        expect(binding.presetId).toBe(preset.id)
      }
    }
  })

  it('routes each declared material-flow profile to its preset and expected equipment classes', () => {
    expect(SCENARIO_VISUAL_PROFILES.length).toBe(6)
    for (const profile of SCENARIO_VISUAL_PROFILES) {
      const binding = resolveScenarioSceneBinding(profile.scenarioId, catalog)
      expect(binding.presetId, profile.scenarioId).toBe(profile.scenePresetId)
      expect(binding.visualProfile.equipmentClasses).toEqual(profile.equipmentClasses)
      const definitions = new Set(binding.cell.equipment.map(equipment => equipment.definitionId))
      for (const equipmentClass of profile.equipmentClasses) {
        expect(definitions.has(equipmentClass), `${profile.scenarioId} -> ${equipmentClass}`).toBe(true)
      }
      expect(binding.diagnostics.some(diagnostic => diagnostic.code === 'missing_equipment_class')).toBe(false)
      expect(binding.camera).toEqual(binding.scenePreset.camera)
    }
  })

  it('derives a fallback profile for a scenario without a declared one', () => {
    const binding = resolveScenarioSceneBinding('pallet-processing', catalog)
    expect(binding.presetId).toBe('cnc-machine-tending')
    expect(binding.visualProfile.equipmentClasses).toEqual([...new Set(binding.cell.equipment.map(equipment => equipment.definitionId))])
    expect(binding.diagnostics).toContainEqual(expect.objectContaining({ code: 'profile_fallback' }))
  })

  it('falls back to the default preset for an unknown scenario without throwing', () => {
    const binding = resolveScenarioSceneBinding('missing-scenario', catalog)
    expect(binding.presetId).toBe('cnc-machine-tending')
    expect(binding.scenario).toBeNull()
    expect(binding.fallbackUsed).toBe(true)
    expect(hasBindingErrors(binding)).toBe(true)
    expect(binding.diagnostics).toContainEqual(expect.objectContaining({ code: 'unknown_scenario' }))
  })

  it('reports a missing equipment class instead of failing', () => {
    const custom = new ScenePresetCatalog(new Set(SCENARIO_CATALOG.map(scenario => scenario.id)))
    const preset = structuredClone(BUILT_IN_SCENE_PRESETS.find(candidate => candidate.id === 'vision-sorting')!)
    preset.cell.equipment = preset.cell.equipment.filter(equipment => equipment.definitionId !== 'storage-bin')
    custom.register(preset)
    const binding = resolveScenarioSceneBinding('sorting-normal-cycle', custom)
    expect(binding.diagnostics).toContainEqual(expect.objectContaining({ code: 'missing_equipment_class' }))
    expect(hasBindingErrors(binding)).toBe(false)
  })
})
