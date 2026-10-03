import { describe, expect, it } from 'vitest'
import { collectMaterialIds, isMaterialId } from './materialLibrary'
import { buildFactoryEnvironment, disposeFactoryEnvironment } from './factoryEnvironment'
import { buildCncMachineVisual } from './cncMachineVisual'
import { buildHeroCellDressingFallback, disposeHeroCellDressing } from './heroCellDressing'
import { KNOWN_EQUIPMENT_CLASSES, createMaterialFlowVisual } from './materialFlowVisuals'

/**
 * S68 acceptance criterion 1: every flagship visual surface is built from the
 * shared material vocabulary. These are static, GPU-free checks.
 */
describe('S68 shared material vocabulary coverage', () => {
  it('builds every known procedural equipment class from the shared library', () => {
    expect(KNOWN_EQUIPMENT_CLASSES.length).toBeGreaterThan(20)
    for (const definitionId of KNOWN_EQUIPMENT_CLASSES) {
      const root = createMaterialFlowVisual(definitionId)
      const ids = collectMaterialIds(root)
      expect(ids.length, definitionId).toBeGreaterThan(0)
      for (const id of ids) expect(isMaterialId(id), `${definitionId}: ${id}`).toBe(true)
    }
  })

  it('builds the CNC machine visual and hero-cell dressing from the shared library', () => {
    const cnc = buildCncMachineVisual()
    for (const id of collectMaterialIds(cnc.group)) expect(isMaterialId(id), id).toBe(true)
    cnc.dispose()

    const dressing = buildHeroCellDressingFallback()
    for (const id of collectMaterialIds(dressing)) expect(isMaterialId(id), id).toBe(true)
    disposeHeroCellDressing(dressing)
  })

  it('uses only shared-vocabulary materials in the factory environment', () => {
    const environment = buildFactoryEnvironment({ cellId: 'cnc-machine-tending' })
    for (const id of collectMaterialIds(environment)) expect(isMaterialId(id), id).toBe(true)
    disposeFactoryEnvironment(environment)
  })
})
