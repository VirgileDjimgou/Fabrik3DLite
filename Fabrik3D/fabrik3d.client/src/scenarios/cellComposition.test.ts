import { describe, expect, it } from 'vitest'
import { createDefaultScenePresetCatalog } from '../scenes'
import {
  SCENARIO_CELL_REQUIREMENTS,
  cellKindForPreset,
  cellKindForScenario,
  requiredEquipmentVerdict,
} from './cellComposition'
import { resolveScenarioSceneBinding } from './sceneBinding'

/**
 * S59 composition tests: the resolved 3D cell for every existing scenario must
 * actually contain the industrial equipment its scenario logic requires. This is
 * asserted against the resolved `CellDefinition`, never against a mesh name.
 */
describe('S59 scenario cell composition', () => {
  const catalog = createDefaultScenePresetCatalog()

  it('provides the required equipment classes for every simulation-ready scenario', () => {
    for (const preset of catalog.list().filter(candidate => candidate.capability === 'simulation-ready')) {
      for (const scenarioId of preset.compatibleScenarioIds) {
        const binding = resolveScenarioSceneBinding(scenarioId, catalog)
        const verdict = requiredEquipmentVerdict(
          cellKindForScenario(scenarioId),
          binding.cell.equipment.map(equipment => ({ definitionId: equipment.definitionId })),
        )
        expect(verdict.missing, `${scenarioId} → ${verdict.missing.join(', ')}`).toEqual([])
        expect(verdict.ok, scenarioId).toBe(true)
      }
    }
  })

  it('maps each scene preset to a declared cell kind with a requirement table', () => {
    for (const preset of catalog.list()) {
      const kind = cellKindForPreset(preset.id)
      expect(SCENARIO_CELL_REQUIREMENTS[kind].length, preset.id).toBeGreaterThan(0)
    }
  })

  it('contains distinct accepted and reject bins, and both pallet roles, in the right cells', () => {
    const sorting = resolveScenarioSceneBinding('sorting-normal-cycle', catalog)
    const bins = sorting.cell.equipment.filter(equipment => equipment.definitionId === 'storage-bin')
    expect(bins.map(bin => bin.id)).toEqual(expect.arrayContaining(['accepted-bin-1', 'reject-bin-1']))
    expect(bins.length).toBeGreaterThanOrEqual(2)

    const palletizing = resolveScenarioSceneBinding('palletizing-normal-cycle', catalog)
    const pallets = palletizing.cell.equipment.filter(equipment => equipment.definitionId === 'euro-pallet')
    expect(pallets.map(pallet => pallet.id)).toEqual(expect.arrayContaining(['empty-pallet-1', 'completed-pallet-1']))

    const safety = resolveScenarioSceneBinding('safety-door-recovery', catalog)
    const classes = new Set(safety.cell.equipment.map(equipment => equipment.definitionId))
    for (const required of ['interlocked-gate', 'area-scanner', 'emergency-stop', 'stack-light', 'fence-panel', 'safety-zone', 'fanuc-like-6axis']) {
      expect(classes.has(required), required).toBe(true)
    }
  })

  it('keeps the CNC reference cell composition intact and compatible', () => {
    const binding = resolveScenarioSceneBinding('pallet-processing', catalog)
    expect(binding.presetId).toBe('cnc-machine-tending')
    const verdict = requiredEquipmentVerdict(
      'cnc-machine-tending',
      binding.cell.equipment.map(equipment => ({ definitionId: equipment.definitionId })),
    )
    expect(verdict.ok).toBe(true)
  })

  it('uses SI metre transforms that stay inside the declared scene floor', () => {
    for (const preset of catalog.list()) {
      const floor = preset.environment.floorSizeMeters
      for (const equipment of preset.cell.equipment) {
        const { x, y, z } = equipment.transform.position
        expect(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z), `${preset.id}.${equipment.id}`).toBe(true)
        expect(y, `${preset.id}.${equipment.id} y`).toBeGreaterThanOrEqual(0)
        expect(Math.abs(x)).toBeLessThanOrEqual(floor.x)
        expect(Math.abs(z)).toBeLessThanOrEqual(floor.z)
      }
    }
  })
})
