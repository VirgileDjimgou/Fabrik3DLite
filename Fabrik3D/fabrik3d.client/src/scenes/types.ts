import type { CellDefinition, Vector3Meters } from '../equipment'
import type { LocalizedText } from '../scenarios/types'

export const SCENE_PRESET_SCHEMA_VERSION = '1.0' as const

export type SceneCapability = 'simulation-ready' | 'layout-only'
export type SceneRuntimeProfile = 'single-conveyor-machining' | 'material-flow' | 'none'
export type SceneEnvironmentPreset = 'industrial-hall' | 'training-lab'

export interface SceneCameraPreset {
  position: Vector3Meters
  target: Vector3Meters
}

export interface ScenePanelPosition {
  x: number
  y: number
}

/** Versioned data only. Runtime code is resolved from trusted registries. */
export interface ScenePreset {
  schemaVersion: typeof SCENE_PRESET_SCHEMA_VERSION
  id: string
  name: LocalizedText
  purpose: LocalizedText
  capability: SceneCapability
  runtimeProfile: SceneRuntimeProfile
  cell: CellDefinition
  compatibleScenarioIds: string[]
  defaultScenarioId?: string
  environment: {
    preset: SceneEnvironmentPreset
    floorSizeMeters: { x: number; z: number }
  }
  camera: SceneCameraPreset
  defaultPanelLayout?: Record<string, ScenePanelPosition>
}

export interface ScenePresetDiagnostic {
  severity: 'error' | 'warning'
  code: string
  message: string
}
