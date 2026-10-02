/**
 * S59 scenario cell composition requirements.
 *
 * Pure data describing, for each existing scenario cell, the industrial
 * equipment the scenario logic actually requires. The 3D cells in
 * `src/scenes/materialFlowCells.ts` are composed from this list; the visual
 * profiles in `visualProfile.ts` advertise the same classes. Keeping the
 * requirement table in one place lets a composition test prove that a resolved
 * cell really contains the equipment each scenario needs without encoding any
 * scenario truth in meshes.
 *
 * Nothing here is executable: it is versioned data and never contains Three.js
 * objects, Vue components or callbacks.
 */

export const SCENARIO_CELL_COMPOSITION_SCHEMA_VERSION = '1.0' as const

export type ScenarioCellKind =
  | 'vision-sorting'
  | 'robot-palletizing'
  | 'assembly-inspection'
  | 'robot-safety-training'
  | 'cnc-machine-tending'

/** One required equipment class with the minimum number of visible instances. */
export interface CellEquipmentRequirement {
  /** Equipment definition class that must exist in the cell. */
  definitionId: string
  /** Minimum number of instances; defaults to 1. */
  minCount: number
  /** Human-readable role this equipment plays in the scenario. */
  role: string
}

function requirement(definitionId: string, role: string, minCount = 1): CellEquipmentRequirement {
  return { definitionId, minCount, role }
}

/**
 * Required equipment per cell, mapped from the S59 brief. Counts distinguish
 * functionally different instances of the same class (accepted vs reject bin,
 * empty vs completed pallet, two clamps, several boxes/workpieces).
 */
export const SCENARIO_CELL_REQUIREMENTS: Readonly<Record<ScenarioCellKind, readonly CellEquipmentRequirement[]>> = {
  'vision-sorting': [
    requirement('straight-conveyor', 'infeed conveyor'),
    requirement('vision-inspection-station', 'inspection / vision station'),
    requirement('photoelectric-sensor', 'camera / sensor'),
    requirement('diverter-pusher', 'diverter'),
    requirement('storage-bin', 'accepted bin and reject bin', 2),
    requirement('plc-cabinet', 'control cabinet'),
    requirement('operator-hmi-pedestal', 'HMI pedestal'),
    requirement('configurable-part', 'workpieces', 1),
  ],
  'robot-palletizing': [
    requirement('fanuc-like-6axis', '6-axis robot'),
    requirement('vacuum-gripper', 'vacuum gripper'),
    requirement('straight-conveyor', 'infeed conveyor'),
    requirement('carton', 'boxes / workpieces', 1),
    requirement('euro-pallet', 'empty pallet and completed pallet', 2),
    requirement('infeed-buffer', 'infeed buffer'),
    requirement('outfeed-buffer', 'outfeed buffer'),
    requirement('fence-panel', 'fencing', 2),
    requirement('light-curtain', 'light curtain'),
    requirement('robot-controller-cabinet', 'controller cabinet'),
  ],
  'assembly-inspection': [
    requirement('fanuc-like-6axis', 'robot'),
    requirement('machining-fixture', 'fixture'),
    requirement('toggle-clamp', 'clamps', 2),
    requirement('configurable-part', 'part', 1),
    requirement('part-presence-sensor', 'inspection sensor'),
    requirement('barcode-rfid-reader', 'inspection camera'),
    requirement('workholding-adapter', 'assembly station'),
    requirement('outfeed-buffer', 'accepted / rework buffer'),
    requirement('operator-hmi-pedestal', 'operator station'),
  ],
  'robot-safety-training': [
    requirement('fanuc-like-6axis', 'robot'),
    requirement('fence-panel', 'fence', 2),
    requirement('interlocked-gate', 'interlocked gate'),
    requirement('area-scanner', 'area scanner'),
    requirement('emergency-stop', 'E-stop'),
    requirement('stack-light', 'stack light'),
    requirement('safety-zone', 'operator access area and safety zones', 2),
  ],
  'cnc-machine-tending': [
    requirement('fanuc-like-6axis', 'robot'),
    requirement('educational-cnc', 'CNC machine'),
    requirement('belt-conveyor', 'conveyor'),
    requirement('pallet-station', 'pallet station'),
    requirement('safety-zone', 'safety zone'),
  ],
}

const SCENARIO_CELL_KIND_BY_ID: Readonly<Record<string, ScenarioCellKind>> = {
  'sorting-normal-cycle': 'vision-sorting',
  'sorting-jam-recovery': 'vision-sorting',
  'palletizing-normal-cycle': 'robot-palletizing',
  'palletizing-vacuum-recovery': 'robot-palletizing',
  'assembly-inspection-cycle': 'assembly-inspection',
  'safety-door-recovery': 'robot-safety-training',
  'robot-axes': 'cnc-machine-tending',
  'coordinate-frames': 'cnc-machine-tending',
  'pick-and-place': 'cnc-machine-tending',
  'cnc-loading': 'cnc-machine-tending',
  'pallet-processing': 'cnc-machine-tending',
}

const PRESET_CELL_KIND: Readonly<Record<string, ScenarioCellKind>> = {
  'vision-sorting': 'vision-sorting',
  'robot-palletizing': 'robot-palletizing',
  'assembly-inspection': 'assembly-inspection',
  'robot-safety-training': 'robot-safety-training',
  'cnc-machine-tending': 'cnc-machine-tending',
}

/** Resolves a scenario id to its industrial cell kind. Unknown ids are CNC (fallback). */
export function cellKindForScenario(scenarioId: string): ScenarioCellKind {
  return SCENARIO_CELL_KIND_BY_ID[scenarioId] ?? 'cnc-machine-tending'
}

/** Resolves a scene preset id to its industrial cell kind. */
export function cellKindForPreset(presetId: string): ScenarioCellKind {
  return PRESET_CELL_KIND[presetId] ?? 'cnc-machine-tending'
}

/** Unique required equipment classes for a cell, in declaration order. */
export function requiredEquipmentClasses(kind: ScenarioCellKind): string[] {
  return [...new Set(SCENARIO_CELL_REQUIREMENTS[kind].map(item => item.definitionId))]
}

/** Required full equipment class list, including the CNC reference cell's fixtures. */
export function requiredEquipmentVerdict(
  kind: ScenarioCellKind,
  equipment: ReadonlyArray<{ definitionId: string }>,
): { ok: boolean; missing: string[] } {
  const counts = new Map<string, number>()
  for (const instance of equipment) counts.set(instance.definitionId, (counts.get(instance.definitionId) ?? 0) + 1)
  const missing: string[] = []
  for (const item of SCENARIO_CELL_REQUIREMENTS[kind]) {
    if ((counts.get(item.definitionId) ?? 0) < item.minCount) {
      missing.push(`${item.definitionId} (need ${item.minCount}, have ${counts.get(item.definitionId) ?? 0})`)
    }
  }
  return { ok: missing.length === 0, missing }
}
