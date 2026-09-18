import { isFiniteTransform } from '../equipment'
import { SCENE_PRESET_SCHEMA_VERSION, type ScenePreset, type ScenePresetDiagnostic } from './types'

export function validateScenePreset(preset: ScenePreset, knownScenarioIds: ReadonlySet<string>): ScenePresetDiagnostic[] {
  const diagnostics: ScenePresetDiagnostic[] = []
  const error = (code: string, message: string) => diagnostics.push({ severity: 'error', code, message })

  if (preset.schemaVersion !== SCENE_PRESET_SCHEMA_VERSION) error('unsupported_version', `Scene '${preset.id}' uses unsupported schema '${preset.schemaVersion}'.`)
  if (!preset.id.trim()) error('missing_id', 'Scene preset id is required.')
  if (!preset.cell.id.trim()) error('missing_cell_id', `Scene '${preset.id}' requires a cell id.`)
  if (!positive(preset.environment.floorSizeMeters.x) || !positive(preset.environment.floorSizeMeters.z)) error('invalid_floor_size', `Scene '${preset.id}' requires positive floor dimensions.`)
  if (![...Object.values(preset.camera.position), ...Object.values(preset.camera.target)].every(Number.isFinite)) error('invalid_camera', `Scene '${preset.id}' camera values must be finite SI coordinates.`)

  const scenarioIds = new Set<string>()
  for (const scenarioId of preset.compatibleScenarioIds) {
    if (scenarioIds.has(scenarioId)) error('duplicate_scenario', `Scene '${preset.id}' repeats scenario '${scenarioId}'.`)
    scenarioIds.add(scenarioId)
    if (!knownScenarioIds.has(scenarioId)) error('unknown_scenario', `Scene '${preset.id}' references unknown scenario '${scenarioId}'.`)
  }
  if (preset.defaultScenarioId && !scenarioIds.has(preset.defaultScenarioId)) error('invalid_default_scenario', `Default scenario '${preset.defaultScenarioId}' is not compatible with scene '${preset.id}'.`)
  if (preset.capability === 'simulation-ready' && preset.runtimeProfile === 'none') error('missing_runtime', `Simulation-ready scene '${preset.id}' requires a runtime profile.`)
  if (preset.capability === 'simulation-ready' && !preset.defaultScenarioId) error('missing_default_scenario', `Simulation-ready scene '${preset.id}' requires a default scenario.`)
  if (preset.capability === 'layout-only' && preset.runtimeProfile !== 'none') error('layout_runtime_mismatch', `Layout-only scene '${preset.id}' cannot declare executable runtime '${preset.runtimeProfile}'.`)

  const equipmentIds = new Set<string>()
  for (const equipment of preset.cell.equipment) {
    if (equipmentIds.has(equipment.id)) error('duplicate_equipment', `Scene '${preset.id}' repeats equipment '${equipment.id}'.`)
    equipmentIds.add(equipment.id)
    if (!equipment.id.trim() || !equipment.definitionId.trim()) error('invalid_equipment', `Scene '${preset.id}' contains equipment without an id or definition.`)
    if (!isFiniteTransform(equipment.transform)) error('invalid_transform', `Equipment '${equipment.id}' has a non-finite transform.`)
  }
  for (const [panelId, point] of Object.entries(preset.defaultPanelLayout ?? {})) {
    if (!panelId.trim() || !Number.isFinite(point.x) || !Number.isFinite(point.y)) error('invalid_panel_layout', `Scene '${preset.id}' has an invalid default panel position.`)
  }
  return diagnostics
}

function positive(value: number): boolean { return Number.isFinite(value) && value > 0 }
