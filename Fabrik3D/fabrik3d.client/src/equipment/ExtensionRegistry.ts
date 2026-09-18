import type { EquipmentDefinition, EquipmentRuntimeAdapter, EquipmentTelemetryMapper } from './types'
import type { RegisteredEquipmentVisual } from './assets'

export interface EquipmentExtension {
  definition: EquipmentDefinition
  visual: RegisteredEquipmentVisual
  /** Runtime installation is code-owned; imports can never provide this factory. */
  createRuntime?: (equipmentId: string) => EquipmentRuntimeAdapter
  createTelemetryMapper?: (equipmentId: string) => EquipmentTelemetryMapper
}

/** Links data contracts without giving visual packages authority over runtime behaviour. */
export class EquipmentExtensionRegistry {
  private readonly extensions = new Map<string, EquipmentExtension>()
  register(extension: EquipmentExtension): void {
    const { definition, visual } = extension
    if (this.extensions.has(definition.id)) throw new Error(`Equipment extension '${definition.id}' is already registered.`)
    if (visual.source === 'glb' && visual.manifest.equipmentDefinitionId !== definition.id) throw new Error(`Visual '${visual.id}' does not target '${definition.id}'.`)
    if (definition.runtimeCapability === 'simulation-ready' && !extension.createRuntime) throw new Error(`Simulation-ready equipment '${definition.id}' requires a trusted runtime adapter.`)
    this.extensions.set(definition.id, extension)
  }
  get(definitionId: string): EquipmentExtension { const result = this.extensions.get(definitionId); if (!result) throw new Error(`Unknown equipment extension '${definitionId}'.`); return result }
  list(): EquipmentExtension[] { return [...this.extensions.values()] }
}
