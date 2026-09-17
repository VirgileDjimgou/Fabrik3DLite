import { EQUIPMENT_SDK_VERSION, type CellDefinition, type EquipmentDefinition, type EquipmentInstance } from './types'
import { isFiniteTransform } from './transforms'

export class EquipmentRegistry {
  private readonly definitions = new Map<string, EquipmentDefinition>()
  private readonly instances = new Map<string, EquipmentInstance>()

  registerDefinition(definition: EquipmentDefinition): void {
    validateEquipmentDefinition(definition)
    if (this.definitions.has(definition.id)) throw new Error(`Equipment definition '${definition.id}' is already registered.`)
    this.definitions.set(definition.id, structuredClone(definition))
  }

  registerInstance(instance: EquipmentInstance): void {
    if (!this.definitions.has(instance.definitionId)) {
      throw new Error(`Equipment instance '${instance.id}' references unknown definition '${instance.definitionId}'.`)
    }
    if (!instance.id.trim()) throw new Error('Equipment instance id is required.')
    if (!isFiniteTransform(instance.transform)) throw new Error(`Equipment instance '${instance.id}' has a non-finite transform.`)
    if (this.instances.has(instance.id)) throw new Error(`Equipment instance '${instance.id}' is already registered.`)
    this.instances.set(instance.id, structuredClone(instance))
  }

  loadCell(cell: CellDefinition): void {
    validateCellDefinition(cell)
    for (const instance of cell.equipment) this.registerInstance(instance)
  }

  getDefinition(id: string): EquipmentDefinition | undefined { return this.definitions.get(id) }
  getInstance(id: string): EquipmentInstance | undefined { return this.instances.get(id) }
  getInstances(): EquipmentInstance[] { return [...this.instances.values()] }

  findInstancesByCapability(capabilityId: string): EquipmentInstance[] {
    return this.getInstances().filter((instance) =>
      this.definitions.get(instance.definitionId)?.capabilities.some((capability) => capability.id === capabilityId),
    )
  }
}

export function validateEquipmentDefinition(definition: EquipmentDefinition): void {
  if (definition.sdkVersion !== EQUIPMENT_SDK_VERSION) throw new Error(`Unsupported equipment SDK version '${definition.sdkVersion}'.`)
  if (!definition.id.trim()) throw new Error('Equipment definition id is required.')
  if (!definition.category) throw new Error(`Equipment definition '${definition.id}' requires a category.`)
  const portIds = new Set<string>()
  for (const port of definition.ports) {
    if (!port.id.trim()) throw new Error(`Equipment definition '${definition.id}' contains a port without id.`)
    if (portIds.has(port.id)) throw new Error(`Equipment definition '${definition.id}' contains duplicate port '${port.id}'.`)
    portIds.add(port.id)
  }
}

export function validateCellDefinition(cell: CellDefinition): void {
  if (cell.sdkVersion !== EQUIPMENT_SDK_VERSION) throw new Error(`Unsupported cell SDK version '${cell.sdkVersion}'.`)
  if (!cell.id.trim() || !cell.name.trim() || !cell.worldFrameId.trim()) throw new Error('Cell id, name and world frame id are required.')
  const ids = new Set<string>()
  for (const equipment of cell.equipment) {
    if (ids.has(equipment.id)) throw new Error(`Cell '${cell.id}' contains duplicate equipment instance '${equipment.id}'.`)
    ids.add(equipment.id)
  }
}
