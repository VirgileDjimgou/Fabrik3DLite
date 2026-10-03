import type { CellDefinition } from '../equipment'
import { SINGLE_CONVEYOR_CELL } from '../equipment'
import { SCENARIO_CATALOG } from '../scenarios/catalog'
import { resolveCellLayout } from './cellLayout'
import { cellFootprints } from './cellFootprints'
import { SCENE_PRESET_SCHEMA_VERSION, type ScenePreset } from './types'
import { validateScenePreset } from './validation'
import {
  ASSEMBLY_INSPECTION_CELL,
  PALLETIZING_CELL,
  SAFETY_TRAINING_CELL,
  VISION_SORTING_CELL,
} from './materialFlowCells'

export const DEFAULT_SCENE_PRESET_ID = 'cnc-machine-tending'

/**
 * S60: floor size and camera framing are derived from the measured equipment
 * footprints, robot reach envelope and documented clearances instead of being
 * hand-tuned. The layout layer is a configuration aid only and never becomes
 * runtime truth.
 */
function framing(cell: CellDefinition): {
  floorSizeMeters: { x: number; z: number }
  camera: ScenePreset['camera']
  cameraPresets: NonNullable<ScenePreset['cameraPresets']>
} {
  const layout = resolveCellLayout({ footprints: cellFootprints(cell) })
  return { floorSizeMeters: layout.floorSizeMeters, camera: layout.camera, cameraPresets: layout.cameras }
}

const CNC_FRAMING = framing(SINGLE_CONVEYOR_CELL)
const SORTING_FRAMING = framing(VISION_SORTING_CELL)
const PALLETIZING_FRAMING = framing(PALLETIZING_CELL)
const ASSEMBLY_FRAMING = framing(ASSEMBLY_INSPECTION_CELL)
const SAFETY_FRAMING = framing(SAFETY_TRAINING_CELL)

export const BUILT_IN_SCENE_PRESETS: readonly ScenePreset[] = [
  {
    schemaVersion: SCENE_PRESET_SCHEMA_VERSION,
    id: DEFAULT_SCENE_PRESET_ID,
    name: { en: 'CNC machine tending', fr: 'Chargement robotisé CNC', de: 'CNC-Maschinenbeschickung' },
    purpose: { en: 'Complete pallet-to-CNC machining cell.', fr: 'Cellule complète palette vers CNC.', de: 'Komplette Palette-zu-CNC-Zelle.' },
    capability: 'simulation-ready',
    runtimeProfile: 'single-conveyor-machining',
    cell: SINGLE_CONVEYOR_CELL,
    compatibleScenarioIds: ['robot-axes', 'coordinate-frames', 'pick-and-place', 'cnc-loading', 'pallet-processing'],
    defaultScenarioId: 'pallet-processing',
    environment: { preset: 'industrial-hall', floorSizeMeters: CNC_FRAMING.floorSizeMeters },
    camera: CNC_FRAMING.camera,
    cameraPresets: CNC_FRAMING.cameraPresets,
    defaultPanelLayout: { guide: { x: 16, y: 16 }, dashboard: { x: 1150, y: 16 } },
  },
  {
    schemaVersion: SCENE_PRESET_SCHEMA_VERSION, id: 'vision-sorting',
    name: { en: 'Vision sorting', fr: 'Tri par vision', de: 'Bildverarbeitungs-Sortierung' },
    purpose: { en: 'Conveyor sorting with inspection, diverter and reject bins.', fr: 'Tri sur convoyeur avec contrôle, déviateur et bacs de rebut.', de: 'Fördersortierung mit Prüfung, Weiche und Ausschussbehältern.' },
    capability: 'simulation-ready', runtimeProfile: 'material-flow', cell: VISION_SORTING_CELL,
    compatibleScenarioIds: ['sorting-normal-cycle', 'sorting-jam-recovery'], defaultScenarioId: 'sorting-normal-cycle',
    environment: { preset: 'industrial-hall', floorSizeMeters: SORTING_FRAMING.floorSizeMeters }, camera: SORTING_FRAMING.camera, cameraPresets: SORTING_FRAMING.cameraPresets,
  },
  {
    schemaVersion: SCENE_PRESET_SCHEMA_VERSION, id: 'robot-palletizing',
    name: { en: 'Robot palletizing', fr: 'Palettisation robotisée', de: 'Roboter-Palettierung' },
    purpose: { en: 'Vacuum pick, layer pattern and finished-pallet buffer.', fr: 'Prise par vide, motif de couche et buffer palette finie.', de: 'Vakuumgreifen, Lagenmuster und Fertigpalettenpuffer.' },
    capability: 'simulation-ready', runtimeProfile: 'material-flow', cell: PALLETIZING_CELL,
    compatibleScenarioIds: ['palletizing-normal-cycle', 'palletizing-vacuum-recovery'], defaultScenarioId: 'palletizing-normal-cycle',
    environment: { preset: 'industrial-hall', floorSizeMeters: PALLETIZING_FRAMING.floorSizeMeters }, camera: PALLETIZING_FRAMING.camera, cameraPresets: PALLETIZING_FRAMING.cameraPresets,
  },
  {
    schemaVersion: SCENE_PRESET_SCHEMA_VERSION, id: 'assembly-inspection',
    name: { en: 'Assembly and inspection', fr: 'Assemblage et contrôle', de: 'Montage und Prüfung' },
    purpose: { en: 'Robot fixture, simplified press, inspection and rework buffer.', fr: 'Robot, montage, presse simplifiée, contrôle et buffer de reprise.', de: 'Roboter, Vorrichtung, vereinfachte Presse, Prüfung und Nacharbeitspuffer.' },
    capability: 'simulation-ready', runtimeProfile: 'material-flow', cell: ASSEMBLY_INSPECTION_CELL,
    compatibleScenarioIds: ['assembly-inspection-cycle'], defaultScenarioId: 'assembly-inspection-cycle',
    environment: { preset: 'industrial-hall', floorSizeMeters: ASSEMBLY_FRAMING.floorSizeMeters }, camera: ASSEMBLY_FRAMING.camera, cameraPresets: ASSEMBLY_FRAMING.cameraPresets,
  },
  {
    schemaVersion: SCENE_PRESET_SCHEMA_VERSION, id: 'robot-safety-training',
    name: { en: 'Robot safety training', fr: 'Formation sécurité robot', de: 'Robotersicherheitstraining' },
    purpose: { en: 'Access gate, scanner, emergency stop and controlled restart exercise.', fr: 'Exercice porte d’accès, scanner, arrêt d’urgence et redémarrage contrôlé.', de: 'Übung mit Zugangstür, Scanner, Not-Halt und kontrolliertem Neustart.' },
    capability: 'simulation-ready', runtimeProfile: 'material-flow', cell: SAFETY_TRAINING_CELL,
    compatibleScenarioIds: ['safety-door-recovery'], defaultScenarioId: 'safety-door-recovery',
    environment: { preset: 'training-lab', floorSizeMeters: SAFETY_FRAMING.floorSizeMeters }, camera: SAFETY_FRAMING.camera, cameraPresets: SAFETY_FRAMING.cameraPresets,
  },
]

export class ScenePresetCatalog {
  private readonly presets = new Map<string, ScenePreset>()

  constructor(private readonly knownScenarioIds: ReadonlySet<string>) {}

  register(preset: ScenePreset): void {
    if (this.presets.has(preset.id)) throw new Error(`Scene preset '${preset.id}' is already registered.`)
    const errors = validateScenePreset(preset, this.knownScenarioIds).filter(diagnostic => diagnostic.severity === 'error')
    if (errors.length) throw new Error(errors.map(diagnostic => diagnostic.message).join(' '))
    this.presets.set(preset.id, preset)
  }

  get(id: string): ScenePreset {
    const preset = this.presets.get(id)
    if (!preset) throw new Error(`Unknown scene preset '${id}'.`)
    return preset
  }

  list(): ScenePreset[] { return [...this.presets.values()] }
}

export function createDefaultScenePresetCatalog(): ScenePresetCatalog {
  const catalog = new ScenePresetCatalog(new Set(SCENARIO_CATALOG.map(scenario => scenario.id)))
  for (const preset of BUILT_IN_SCENE_PRESETS) catalog.register(preset)
  return catalog
}
