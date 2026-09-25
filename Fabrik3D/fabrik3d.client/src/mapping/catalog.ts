/**
 * Internal signal catalog view used by mapping validation.
 *
 * The simulator signal catalog from S32 is authoritative. This module exposes a
 * minimal, read-only projection so the mapping layer stays decoupled from the
 * registry implementation while still validating against real signals.
 */

import type { SignalDefinition } from '../signals/types'
import type { SignalRegistry } from '../signals/SignalRegistry'
import type { MappingDataType } from './schema'

export interface MappingSignalInfo {
  id: string
  equipmentId: string
  writable: boolean
  dataType: MappingDataType
  engineeringUnit?: string
}

export interface MappingSignalCatalog {
  get(id: string): MappingSignalInfo | undefined
  ids(): readonly string[]
}

export function createStaticSignalCatalog(signals: readonly MappingSignalInfo[]): MappingSignalCatalog {
  const byId = new Map(signals.map((signal) => [signal.id, { ...signal }]))
  return {
    get: (id) => byId.get(id),
    ids: () => [...byId.keys()].sort(),
  }
}

export function createCatalogFromDefinitions(definitions: readonly SignalDefinition[]): MappingSignalCatalog {
  return createStaticSignalCatalog(definitions.map((definition) => ({
    id: definition.id,
    equipmentId: definition.equipmentId,
    writable: definition.writable,
    dataType: definition.dataType,
    engineeringUnit: definition.engineeringUnit,
  })))
}

export function createCatalogFromRegistry(registry: SignalRegistry): MappingSignalCatalog {
  return createCatalogFromDefinitions(registry.getAllDefinitions())
}
