/**
 * S58 declarative visual composition for a scenario.
 *
 * A `ScenarioVisualProfile` is pure data: it names the preferred scene preset,
 * the environment level, the equipment classes the 3D cell must contain and an
 * optional camera framing. It never contains Three.js objects, Vue components,
 * runtime callbacks or scripts. Missing profiles resolve through a documented
 * fallback derived from the compatible scene preset, so a scenario always gets a
 * valid composed scene instead of failing.
 *
 * S59: the declared equipment classes are derived from the shared scenario cell
 * requirement table (`cellComposition.ts`) so the profile, the composed cell and
 * the composition tests cannot drift apart.
 */

import type { SceneCameraPreset, SceneEnvironmentPreset } from '../scenes/types'
import { requiredEquipmentClasses, type ScenarioCellKind } from './cellComposition'

export const SCENARIO_VISUAL_PROFILE_SCHEMA_VERSION = '1.0' as const

export interface ScenarioVisualProfile {
  schemaVersion: typeof SCENARIO_VISUAL_PROFILE_SCHEMA_VERSION
  scenarioId: string
  /** Preferred compatible scene preset; the resolver validates compatibility. */
  scenePresetId: string
  /** Environment level; the scene preset remains authoritative when omitted. */
  environmentLevel: SceneEnvironmentPreset
  /** Equipment definition classes the scenario's 3D cell is expected to contain. */
  equipmentClasses: string[]
  /** Optional camera framing override for this scenario. */
  camera?: SceneCameraPreset
}

/**
 * Built-in profiles for the `simulation-ready` material-flow scenarios. The
 * CNC reference scenarios keep their dedicated single-conveyor runtime, so they
 * are deliberately absent here and resolve through the derived fallback.
 */
export const SCENARIO_VISUAL_PROFILES: readonly ScenarioVisualProfile[] = [
  profile('sorting-normal-cycle', 'vision-sorting', 'vision-sorting', 'industrial-hall'),
  profile('sorting-jam-recovery', 'vision-sorting', 'vision-sorting', 'industrial-hall'),
  profile('palletizing-normal-cycle', 'robot-palletizing', 'robot-palletizing', 'industrial-hall'),
  profile('palletizing-vacuum-recovery', 'robot-palletizing', 'robot-palletizing', 'industrial-hall'),
  profile('assembly-inspection-cycle', 'assembly-inspection', 'assembly-inspection', 'industrial-hall'),
  profile('safety-door-recovery', 'robot-safety-training', 'robot-safety-training', 'training-lab'),
]

function profile(
  scenarioId: string,
  scenePresetId: string,
  kind: ScenarioCellKind,
  environmentLevel: SceneEnvironmentPreset,
): ScenarioVisualProfile {
  return {
    schemaVersion: SCENARIO_VISUAL_PROFILE_SCHEMA_VERSION,
    scenarioId,
    scenePresetId,
    environmentLevel,
    equipmentClasses: requiredEquipmentClasses(kind),
  }
}

export function getScenarioVisualProfile(scenarioId: string): ScenarioVisualProfile | null {
  return SCENARIO_VISUAL_PROFILES.find(profile => profile.scenarioId === scenarioId) ?? null
}

/**
 * Derived fallback used when no declarative profile exists. It composes the
 * visual from the resolved scene preset so the scenario remains selectable and
 * explicit rather than rendering a blank view.
 */
export function deriveScenarioVisualProfile(
  scenarioId: string,
  scenePresetId: string,
  environmentLevel: SceneEnvironmentPreset,
  equipmentDefinitionIds: readonly string[],
): ScenarioVisualProfile {
  return {
    schemaVersion: SCENARIO_VISUAL_PROFILE_SCHEMA_VERSION,
    scenarioId,
    scenePresetId,
    environmentLevel,
    equipmentClasses: [...new Set(equipmentDefinitionIds)],
  }
}
