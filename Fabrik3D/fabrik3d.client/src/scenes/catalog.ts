import { EQUIPMENT_SDK_VERSION, SINGLE_CONVEYOR_CELL, createTransform, type CellDefinition } from '../equipment'
import { SCENARIO_CATALOG } from '../scenarios/catalog'
import { SCENE_PRESET_SCHEMA_VERSION, type ScenePreset } from './types'
import { validateScenePreset } from './validation'

export const DEFAULT_SCENE_PRESET_ID = 'cnc-machine-tending'

const safetyTrainingCell: CellDefinition = {
  sdkVersion: EQUIPMENT_SDK_VERSION,
  id: 'robot-safety-training-cell',
  name: 'Robot safety training cell',
  worldFrameId: 'world',
  equipment: [
    { id: 'robot-1', definitionId: 'fanuc-like-6axis', transform: createTransform({ x: 0, y: 0, z: 0 }) },
    { id: 'safety-zone-1', definitionId: 'safety-zone', transform: createTransform({ x: 0, y: 0, z: 0 }) },
  ],
}

function materialFlowCell(id: string, name: string, definitionIds: string[]): CellDefinition {
  return {
    sdkVersion: EQUIPMENT_SDK_VERSION, id, name, worldFrameId: 'world',
    equipment: definitionIds.map((definitionId, index) => ({ id: `${definitionId}-${index + 1}`, definitionId, transform: createTransform({ x: (index % 4) * 1.25 - 1.8, y: 0, z: Math.floor(index / 4) * 1.35 - .8 }) })),
  }
}

const visionSortingCell = materialFlowCell('vision-sorting-cell', 'Vision sorting cell', ['straight-conveyor', 'photoelectric-sensor', 'barcode-rfid-reader', 'diverter-pusher', 'storage-bin', 'storage-bin', 'plc-cabinet', 'operator-hmi-pedestal'])
const palletizingCell = materialFlowCell('palletizing-cell', 'Palletizing cell', ['straight-conveyor', 'vacuum-gripper', 'euro-pallet', 'infeed-buffer', 'outfeed-buffer', 'fence-panel', 'light-curtain', 'robot-controller-cabinet'])
const assemblyCell = materialFlowCell('assembly-inspection-cell', 'Assembly and inspection cell', ['robot-controller-cabinet', 'machining-fixture', 'toggle-clamp', 'part-presence-sensor', 'barcode-rfid-reader', 'outfeed-buffer', 'operator-hmi-pedestal'])
const safetyExerciseCell = materialFlowCell('safety-training-cell', 'Safety training cell', ['fanuc-like-6axis', 'interlocked-gate', 'area-scanner', 'emergency-stop', 'stack-light', 'plc-cabinet'])

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
    environment: { preset: 'industrial-hall', floorSizeMeters: { x: 12, z: 10 } },
    camera: { position: { x: 5, y: 5, z: 7 }, target: { x: 0, y: 1, z: 0 } },
    defaultPanelLayout: { guide: { x: 16, y: 16 }, dashboard: { x: 1150, y: 16 } },
  },
  {
    schemaVersion: SCENE_PRESET_SCHEMA_VERSION, id: 'vision-sorting',
    name: { en: 'Vision sorting', fr: 'Tri par vision', de: 'Bildverarbeitungs-Sortierung' },
    purpose: { en: 'Conveyor sorting with inspection, diverter and reject bins.', fr: 'Tri sur convoyeur avec contrôle, déviateur et bacs de rebut.', de: 'Fördersortierung mit Prüfung, Weiche und Ausschussbehältern.' },
    capability: 'simulation-ready', runtimeProfile: 'material-flow', cell: visionSortingCell,
    compatibleScenarioIds: ['sorting-normal-cycle', 'sorting-jam-recovery'], defaultScenarioId: 'sorting-normal-cycle',
    environment: { preset: 'industrial-hall', floorSizeMeters: { x: 10, z: 8 } }, camera: { position: { x: 5, y: 4, z: 6 }, target: { x: 0, y: .7, z: 0 } },
  },
  {
    schemaVersion: SCENE_PRESET_SCHEMA_VERSION, id: 'robot-palletizing',
    name: { en: 'Robot palletizing', fr: 'Palettisation robotisée', de: 'Roboter-Palettierung' },
    purpose: { en: 'Vacuum pick, layer pattern and finished-pallet buffer.', fr: 'Prise par vide, motif de couche et buffer palette finie.', de: 'Vakuumgreifen, Lagenmuster und Fertigpalettenpuffer.' },
    capability: 'simulation-ready', runtimeProfile: 'material-flow', cell: palletizingCell,
    compatibleScenarioIds: ['palletizing-normal-cycle', 'palletizing-vacuum-recovery'], defaultScenarioId: 'palletizing-normal-cycle',
    environment: { preset: 'industrial-hall', floorSizeMeters: { x: 11, z: 9 } }, camera: { position: { x: 6, y: 5, z: 7 }, target: { x: 0, y: .8, z: 0 } },
  },
  {
    schemaVersion: SCENE_PRESET_SCHEMA_VERSION, id: 'assembly-inspection',
    name: { en: 'Assembly and inspection', fr: 'Assemblage et contrôle', de: 'Montage und Prüfung' },
    purpose: { en: 'Robot fixture, simplified press, inspection and rework buffer.', fr: 'Robot, montage, presse simplifiée, contrôle et buffer de reprise.', de: 'Roboter, Vorrichtung, vereinfachte Presse, Prüfung und Nacharbeitspuffer.' },
    capability: 'simulation-ready', runtimeProfile: 'material-flow', cell: assemblyCell,
    compatibleScenarioIds: ['assembly-inspection-cycle'], defaultScenarioId: 'assembly-inspection-cycle',
    environment: { preset: 'industrial-hall', floorSizeMeters: { x: 9, z: 8 } }, camera: { position: { x: 5, y: 4, z: 6 }, target: { x: 0, y: .8, z: 0 } },
  },
  {
    schemaVersion: SCENE_PRESET_SCHEMA_VERSION, id: 'robot-safety-training',
    name: { en: 'Robot safety training', fr: 'Formation sécurité robot', de: 'Robotersicherheitstraining' },
    purpose: { en: 'Access gate, scanner, emergency stop and controlled restart exercise.', fr: 'Exercice porte d’accès, scanner, arrêt d’urgence et redémarrage contrôlé.', de: 'Übung mit Zugangstür, Scanner, Not-Halt und kontrolliertem Neustart.' },
    capability: 'simulation-ready', runtimeProfile: 'material-flow', cell: safetyExerciseCell,
    compatibleScenarioIds: ['safety-door-recovery'], defaultScenarioId: 'safety-door-recovery',
    environment: { preset: 'training-lab', floorSizeMeters: { x: 8, z: 8 } }, camera: { position: { x: 4, y: 5, z: 6 }, target: { x: 0, y: .8, z: 0 } },
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
