import type { EquipmentRegistry } from '../equipment/EquipmentRegistry'
import { SignalRegistry, type SignalRegistryOptions } from './SignalRegistry'
import { registerEquipmentSignals } from './equipmentBinding'

/** Instance ids used by the CNC machine-tending reference cell. */
export const REFERENCE_CELL_EQUIPMENT_IDS = {
  robotId: 'robot-1',
  cncId: 'cnc-1',
  conveyorId: 'conveyor-1',
  safetyId: 'safety-zone-1',
} as const

/**
 * Creates a scene-scoped registry and registers every declared signal for the
 * cell instances. Equipment definitions without signal declarations are skipped.
 */
export function createReferenceCellSignalRegistry(
  equipment: EquipmentRegistry,
  options: SignalRegistryOptions = {},
): SignalRegistry {
  const registry = new SignalRegistry(options)
  for (const instance of equipment.getInstances()) {
    const definition = equipment.getDefinition(instance.definitionId)
    if (!definition?.signals?.length) continue
    registerEquipmentSignals(registry, definition, instance.id)
  }
  return registry
}
