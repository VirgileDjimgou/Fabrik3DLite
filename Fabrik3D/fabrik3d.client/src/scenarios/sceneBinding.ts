/**
 * S58 scenario-to-scene resolution.
 *
 * Resolution chain: `Scenario → compatible ScenePreset → CellDefinition`.
 * The binding is deterministic and data-only; it validates scene compatibility
 * and reports explicit diagnostics instead of throwing when a scenario or its
 * preferred preset is unknown. A missing visual profile falls back to a derived
 * profile so the scenario always resolves to a valid composed scene.
 */

import type { CellDefinition } from '../equipment/types'
import { DEFAULT_SCENE_PRESET_ID, ScenePresetCatalog, createDefaultScenePresetCatalog } from '../scenes/catalog'
import type { SceneCameraPreset, SceneEnvironmentPreset, ScenePreset } from '../scenes/types'
import { SCENARIO_CATALOG } from './catalog'
import type { ScenarioDefinition } from './types'
import { deriveScenarioVisualProfile, getScenarioVisualProfile, type ScenarioVisualProfile } from './visualProfile'

export type ScenarioBindingDiagnosticCode =
  | 'unknown_scenario'
  | 'unknown_preset'
  | 'profile_preset_unavailable'
  | 'profile_fallback'
  | 'no_compatible_preset'
  | 'preset_not_simulation_ready'
  | 'missing_equipment_class'

export interface ScenarioBindingDiagnostic {
  severity: 'error' | 'warning'
  code: ScenarioBindingDiagnosticCode
  message: string
}

export interface ScenarioSceneBinding {
  scenarioId: string
  /** The scenario definition, or `null` when the id is unknown (fallback binding). */
  scenario: ScenarioDefinition | null
  presetId: string
  scenePreset: ScenePreset
  cell: CellDefinition
  visualProfile: ScenarioVisualProfile
  /** Effective camera: profile override when present, otherwise the scene preset camera. */
  camera: SceneCameraPreset
  environmentLevel: SceneEnvironmentPreset
  diagnostics: ScenarioBindingDiagnostic[]
  /** True when the binding used a fallback preset/profile rather than the declared one. */
  fallbackUsed: boolean
}

/**
 * Resolves a scenario id to a compatible scene preset and cell. The catalog may
 * be injected so callers and tests share one validated instance.
 */
export function resolveScenarioSceneBinding(
  scenarioId: string,
  catalog: ScenePresetCatalog = createDefaultScenePresetCatalog(),
): ScenarioSceneBinding {
  const diagnostics: ScenarioBindingDiagnostic[] = []
  const scenario = SCENARIO_CATALOG.find(candidate => candidate.id === scenarioId) ?? null
  let fallbackUsed = false
  if (!scenario) {
    diagnostics.push({ severity: 'error', code: 'unknown_scenario', message: `Scenario '${scenarioId}' is not in the catalog; a safe default scene was composed.` })
    fallbackUsed = true
  }

  const explicitProfile = getScenarioVisualProfile(scenarioId)
  let preset: ScenePreset | null = null

  if (explicitProfile) {
    const preferred = findPreset(catalog, explicitProfile.scenePresetId)
    if (!preferred) {
      diagnostics.push({ severity: 'warning', code: 'unknown_preset', message: `Visual profile preset '${explicitProfile.scenePresetId}' is not registered; a compatible preset was resolved instead.` })
      fallbackUsed = true
    } else if (!preferred.compatibleScenarioIds.includes(scenarioId)) {
      diagnostics.push({ severity: 'warning', code: 'profile_preset_unavailable', message: `Visual profile preset '${preferred.id}' is not compatible with scenario '${scenarioId}'.` })
      fallbackUsed = true
    } else {
      preset = preferred
    }
  }

  preset ??= firstCompatiblePreset(catalog, scenarioId)
  if (!preset) {
    diagnostics.push({ severity: 'error', code: 'no_compatible_preset', message: `No scene preset is compatible with scenario '${scenarioId}'; the default preset was composed.` })
    preset = catalog.get(DEFAULT_SCENE_PRESET_ID)
    fallbackUsed = true
  }

  if (preset.capability !== 'simulation-ready') {
    diagnostics.push({ severity: 'warning', code: 'preset_not_simulation_ready', message: `Scene preset '${preset.id}' is '${preset.capability}'; the scenario cannot execute a real runtime there.` })
    fallbackUsed = true
  }

  const visualProfile = explicitProfile ?? deriveScenarioVisualProfile(
    scenarioId,
    preset.id,
    preset.environment.preset,
    preset.cell.equipment.map(equipment => equipment.definitionId),
  )
  if (!explicitProfile && scenario) {
    diagnostics.push({ severity: 'warning', code: 'profile_fallback', message: `Scenario '${scenarioId}' has no declared visual profile; one was derived from scene preset '${preset.id}'.` })
  }

  const cellDefinitions = new Set(preset.cell.equipment.map(equipment => equipment.definitionId))
  for (const definitionId of visualProfile.equipmentClasses) {
    if (!cellDefinitions.has(definitionId)) {
      diagnostics.push({ severity: 'warning', code: 'missing_equipment_class', message: `Scenario '${scenarioId}' expects equipment class '${definitionId}', which scene preset '${preset.id}' does not provide; it resolves to the procedural fallback.` })
    }
  }

  return {
    scenarioId,
    scenario,
    presetId: preset.id,
    scenePreset: preset,
    cell: preset.cell,
    visualProfile,
    camera: visualProfile.camera ?? preset.camera,
    environmentLevel: visualProfile.environmentLevel,
    diagnostics,
    fallbackUsed,
  }
}

function findPreset(catalog: ScenePresetCatalog, id: string): ScenePreset | null {
  return catalog.list().find(preset => preset.id === id) ?? null
}

function firstCompatiblePreset(catalog: ScenePresetCatalog, scenarioId: string): ScenePreset | null {
  const compatible = catalog.list().filter(preset => preset.compatibleScenarioIds.includes(scenarioId))
  return compatible.find(preset => preset.capability === 'simulation-ready') ?? compatible[0] ?? null
}

export function hasBindingErrors(binding: ScenarioSceneBinding): boolean {
  return binding.diagnostics.some(diagnostic => diagnostic.severity === 'error')
}
