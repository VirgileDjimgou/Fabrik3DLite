/** Shared, deterministic fixtures for mapping tests. */

import { createSingleConveyorEquipmentRegistry } from '../equipment/fixtures/singleConveyorCell'
import { createReferenceCellSignalRegistry } from '../signals'
import { createCatalogFromRegistry, type MappingSignalCatalog } from './catalog'

/** Catalog built from the authoritative S32 reference-cell signal registry. */
export function createReferenceCellCatalog(): MappingSignalCatalog {
  const registry = createReferenceCellSignalRegistry(createSingleConveyorEquipmentRegistry())
  return createCatalogFromRegistry(registry)
}
