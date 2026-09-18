import { EquipmentAssetRegistry } from './registry'
import type { EquipmentAssetManifest } from './types'
import { PROFESSIONAL_ROBOT_ASSET_IDS, PROFESSIONAL_ROBOT_MANIFESTS } from './robotAssets'

const conveyorHash = 'b5e6a80e6bf44158c5deb6bb7cd0a026dff20a12684fbdf5fbffd10a5ed2aab6'
const conveyorLodHash = '4b4a369926133beda36933dd15697ffd0ee9f005084d409cc2d05c4b526706b9'
const conveyorThumbHash = '96699f9db8360c2f1cd25c35bd9ac87dc936785c7f49e7b01a6c3c31c32fdb89'
const palletHash = '6fbe5e83fe794ef3bdc5d4eea5c5693626cfa7218ec9678137193f664b1763eb'
const palletLodHash = '2dc3b751e5e0740118fff0a99a3fb8da15ab70a03b463e96859fbca5e721314d'
const palletThumbHash = '21ef983168488808b93d43a2e2db928c1712a132ab0d627618e709b09a5ad4a0'

export const INDUSTRIAL_CONVEYOR_ASSET_ID = 'generic-conveyor-v1' as const
export const INDUSTRIAL_PALLET_STATION_ASSET_ID = 'generic-pallet-station-v1' as const
export const PROCEDURAL_CONVEYOR_ASSET_ID = 'procedural-belt-conveyor' as const
export const PROCEDURAL_PALLET_STATION_ASSET_ID = 'procedural-pallet-station' as const
export const PROCEDURAL_ROBOT_ASSET_ID = 'procedural-6axis' as const

export const INDUSTRIAL_CONVEYOR_MANIFEST: EquipmentAssetManifest = {
  schemaVersion: '1.0', id: INDUSTRIAL_CONVEYOR_ASSET_ID, equipmentDefinitionId: 'belt-conveyor', category: 'conveyor', version: '1.0.0',
  coordinateSystem: { units: 'meters', upAxis: 'Y', handedness: 'right', origin: 'equipment-base' },
  boundsMeters: { x: 6, y: 0.82, z: 0.76 },
  visual: { glb: { path: 'model.glb', sha256: conveyorHash }, lods: [{ id: 'lod1', glb: { path: 'lod/lod1.glb', sha256: conveyorLodHash }, triangleBudget: 2500 }] },
  collision: { id: 'conveyor-1', kind: 'box', dimensionsMeters: { x: 6, y: 0.64, z: 0.72 } },
  semanticNodes: [
    { id: 'motor:main', kind: 'motor' }, { id: 'sensor:infeed', kind: 'sensor' }, { id: 'sensor:station', kind: 'sensor' }, { id: 'sensor:outfeed', kind: 'sensor' },
    { id: 'anchor:material.in', kind: 'anchor' }, { id: 'anchor:material.out', kind: 'anchor' },
  ],
  anchors: [
    { id: 'anchor:material.in', transform: { frameId: 'equipment-base', position: { x: -3, y: 0.64, z: 0 }, rotation: { x: 0, y: 0, z: 0 } } },
    { id: 'anchor:material.out', transform: { frameId: 'equipment-base', position: { x: 3, y: 0.64, z: 0 }, rotation: { x: 0, y: 0, z: 0 } } },
  ],
  materials: ['painted-steel', 'dark-steel', 'belt-rubber', 'safety-yellow'], thumbnail: { path: 'thumbnail.svg', sha256: conveyorThumbHash },
  license: { name: 'Fabrik3D generated generic asset; educational use' }, integrity: { path: 'model.glb', sha256: conveyorHash },
}

export const INDUSTRIAL_PALLET_STATION_MANIFEST: EquipmentAssetManifest = {
  schemaVersion: '1.0', id: INDUSTRIAL_PALLET_STATION_ASSET_ID, equipmentDefinitionId: 'pallet-station', category: 'pallet-station', version: '1.0.0',
  coordinateSystem: { units: 'meters', upAxis: 'Y', handedness: 'right', origin: 'equipment-base' },
  boundsMeters: { x: 0.6, y: 0.17, z: 0.6 },
  visual: { glb: { path: 'model.glb', sha256: palletHash }, lods: [{ id: 'lod1', glb: { path: 'lod/lod1.glb', sha256: palletLodHash }, triangleBudget: 700 }] },
  collision: { id: 'pallet-work-object', kind: 'box', dimensionsMeters: { x: 0.6, y: 0.087, z: 0.6 } },
  semanticNodes: [{ id: 'fixture:locator:1', kind: 'fixture' }, { id: 'fixture:clamp:1', kind: 'fixture' }, { id: 'sensor:presence', kind: 'sensor' }, { id: 'anchor:robot.grasp', kind: 'anchor' }],
  anchors: [{ id: 'anchor:robot.grasp', transform: { frameId: 'pallet', position: { x: 0, y: 0.12, z: 0 }, rotation: { x: 0, y: 0, z: 0 } } }],
  materials: ['pallet-blue', 'steel', 'locator-yellow'], thumbnail: { path: 'thumbnail.svg', sha256: palletThumbHash },
  license: { name: 'Fabrik3D generated generic asset; educational use' }, integrity: { path: 'model.glb', sha256: palletHash },
}

export function createIndustrialAssetRegistry(): EquipmentAssetRegistry {
  const registry = new EquipmentAssetRegistry()
  registry.register({ id: PROCEDURAL_CONVEYOR_ASSET_ID, source: 'procedural', description: 'Existing procedural conveyor fallback.' })
  registry.register({ id: PROCEDURAL_PALLET_STATION_ASSET_ID, source: 'procedural', description: 'Existing procedural pallet fallback.' })
  registry.register({ id: PROCEDURAL_ROBOT_ASSET_ID, source: 'procedural', description: 'Existing procedural six-axis robot fallback.' })
  registry.register({ id: INDUSTRIAL_CONVEYOR_ASSET_ID, source: 'glb', description: 'Generated modular industrial conveyor.', manifest: INDUSTRIAL_CONVEYOR_MANIFEST, url: '/assets/equipment/generic-conveyor-v1/model.glb', fallbackAssetId: PROCEDURAL_CONVEYOR_ASSET_ID })
  registry.register({ id: INDUSTRIAL_PALLET_STATION_ASSET_ID, source: 'glb', description: 'Generated modular pallet station.', manifest: INDUSTRIAL_PALLET_STATION_MANIFEST, url: '/assets/equipment/generic-pallet-station-v1/model.glb', fallbackAssetId: PROCEDURAL_PALLET_STATION_ASSET_ID })
  for (const size of ['compact', 'medium', 'heavy'] as const) {
    const id = PROFESSIONAL_ROBOT_ASSET_IDS[size]
    registry.register({ id, source: 'glb', description: `Generated professional generic ${size} six-axis robot.`, manifest: PROFESSIONAL_ROBOT_MANIFESTS[size], url: `/assets/equipment/${id}/model.glb`, fallbackAssetId: PROCEDURAL_ROBOT_ASSET_ID })
  }
  return registry
}
