import type { EquipmentDefinition } from '../equipment/types'
import type { SignalDefinition } from './types'
import type { SignalRegistry } from './SignalRegistry'

/**
 * Converts an equipment definition's declarations into full signal definitions.
 * The id convention is stable: `<equipmentId>.<signalName>`.
 *
 * `equipmentId` defaults to the definition id but may be overridden with the
 * scene instance id (for example `robot-1`), which is what the runtime registry uses.
 */
export function signalDefinitionsForEquipment(definition: EquipmentDefinition, equipmentId: string = definition.id): SignalDefinition[] {
  return (definition.signals ?? []).map((signal) => ({
    id: `${equipmentId}.${signal.name}`,
    equipmentId,
    name: signal.name,
    displayName: signal.displayName,
    description: signal.description,
    direction: signal.direction,
    dataType: signal.dataType,
    engineeringUnit: signal.engineeringUnit,
    writable: signal.writable ?? false,
    min: signal.min,
    max: signal.max,
    enumValues: signal.enumValues,
    defaultValue: signal.defaultValue,
    safeValue: signal.safeValue,
    semanticCategory: signal.semanticCategory,
    staleAfterMs: signal.staleAfterMs,
  }))
}

/** Registers every declared signal of an equipment definition into the registry. */
export function registerEquipmentSignals(
  registry: SignalRegistry,
  definition: EquipmentDefinition,
  equipmentId: string = definition.id,
): readonly SignalDefinition[] {
  const definitions = signalDefinitionsForEquipment(definition, equipmentId)
  registry.registerMany(definitions)
  return definitions
}
