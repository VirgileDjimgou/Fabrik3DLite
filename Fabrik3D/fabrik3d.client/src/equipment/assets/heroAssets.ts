import type { AssetSemanticNode, EquipmentAssetManifest } from './types'

/**
 * S55 flagship reference-cell assets. They are generated in-repository by
 * `npm run assets:generate` and are deliberately generic, license-safe geometry
 * (no OEM extraction). The manifests mirror `equipment.asset.json` exactly; the
 * asset pipeline test re-computes every referenced SHA-256 so the two can never
 * silently diverge.
 */
export const HERO_CNC_MACHINE_ASSET_ID = 'hero-cnc-machine-v1' as const
export const HERO_CELL_DRESSING_ASSET_ID = 'hero-cell-dressing-v1' as const
export const PROCEDURAL_HERO_CNC_ASSET_ID = 'procedural-cnc-machine' as const
export const PROCEDURAL_CELL_DRESSING_ASSET_ID = 'procedural-cell-dressing' as const

const HERO_CNC_HASH = '0a3abcfdd7c6cda5e7d377953464e0e9a47e1d7b67715afc9fc2897ef1339af3'
const HERO_CNC_LOD_HASH = 'fb614d2453d8ec6985b692a4a40ecefa36aed6bbef1a27aefe94f20ca373fbe1'
const HERO_CNC_THUMB_HASH = '42d8bf4aa6f84f39e7fc135e74f28c4d0e369fad0f59682a6a28689a2537943c'
const HERO_DRESSING_HASH = 'bab161f9160fb383c458dead4016635f59c78514b7a38f9167bb0d8385fe4662'
const HERO_DRESSING_LOD_HASH = 'c9508fe87bfb3bada1504f2ee9265a64ef2383427edf5eb768edd9a52fd53426'
const HERO_DRESSING_THUMB_HASH = '0c99b4d2228d708cdd1f6c0ccf68da333e39a89d7a75bfcb1febdabf00af5a01'

/**
 * Runtime node contract that must exist in the generated GLB. `spindle:main`
 * and `axis:feed` are preserved node names but are not expressible in the
 * portable manifest's semantic-node namespaces, so they are asserted by the
 * pipeline test instead.
 */
export const HERO_CNC_CONTRACT_NODES: readonly string[] = [
  'door:loading',
  'spindle:main',
  'fixture:chuck',
  'fixture:jaw-left',
  'fixture:jaw-right',
  'axis:feed',
  'coolant:nozzle',
  'signal:panel-screen',
  'signal:stack-light',
]

const cncSemanticNodes: AssetSemanticNode[] = [
  { id: 'door:loading', kind: 'door' },
  { id: 'fixture:chuck', kind: 'fixture' },
  { id: 'fixture:jaw-left', kind: 'fixture' },
  { id: 'fixture:jaw-right', kind: 'fixture' },
  { id: 'signal:panel-screen', kind: 'signal' },
  { id: 'signal:stack-light', kind: 'signal' },
]

const dressingSemanticNodes: AssetSemanticNode[] = [
  { id: 'motor:chip-conveyor', kind: 'motor' },
  { id: 'fixture:buffer:1', kind: 'fixture' },
  { id: 'fixture:buffer:2', kind: 'fixture' },
  { id: 'signal:worklight:1', kind: 'signal' },
  { id: 'signal:worklight:2', kind: 'signal' },
  { id: 'anchor:buffer.access', kind: 'anchor' },
]

export const HERO_CNC_MACHINE_MANIFEST: EquipmentAssetManifest = {
  schemaVersion: '1.0',
  id: HERO_CNC_MACHINE_ASSET_ID,
  equipmentDefinitionId: 'educational-cnc',
  category: 'machine',
  version: '1.0.0',
  coordinateSystem: { units: 'meters', upAxis: 'Y', handedness: 'right', origin: 'equipment-base' },
  boundsMeters: { x: 2.25, y: 2.5, z: 1.95 },
  visual: {
    glb: { path: 'model.glb', sha256: HERO_CNC_HASH },
    lods: [{ id: 'lod1', glb: { path: 'lod/lod1.glb', sha256: HERO_CNC_LOD_HASH }, triangleBudget: 6000 }],
  },
  collision: { id: 'cnc-1', kind: 'box', dimensionsMeters: { x: 2.0, y: 2.2, z: 1.6 } },
  semanticNodes: cncSemanticNodes,
  anchors: [{
    id: 'anchor:load-door',
    transform: { frameId: 'equipment-base', position: { x: 0, y: 1.0, z: 0.82 }, rotation: { x: 0, y: 0, z: 0 } },
  }],
  materials: ['machine-body', 'machine-trim', 'stainless', 'safety-hazard', 'chamber-dark', 'glass'],
  thumbnail: { path: 'thumbnail.svg', sha256: HERO_CNC_THUMB_HASH },
  license: { name: 'Fabrik3D generated generic asset; educational use' },
  integrity: { path: 'model.glb', sha256: HERO_CNC_HASH },
}

export const HERO_CELL_DRESSING_MANIFEST: EquipmentAssetManifest = {
  schemaVersion: '1.0',
  id: HERO_CELL_DRESSING_ASSET_ID,
  equipmentDefinitionId: 'cell-environment',
  category: 'machine',
  version: '1.0.0',
  coordinateSystem: { units: 'meters', upAxis: 'Y', handedness: 'right', origin: 'equipment-base' },
  boundsMeters: { x: 8.4, y: 3.3, z: 9.0 },
  visual: {
    glb: { path: 'model.glb', sha256: HERO_DRESSING_HASH },
    lods: [{ id: 'lod1', glb: { path: 'lod/lod1.glb', sha256: HERO_DRESSING_LOD_HASH }, triangleBudget: 6000 }],
  },
  // The dressing is decorative: a mesh proxy is declared for documentation but
  // the analytic cell collision models remain authoritative.
  collision: { id: 'cell-dressing-proxy', kind: 'mesh' },
  semanticNodes: dressingSemanticNodes,
  anchors: [{
    id: 'anchor:buffer.access',
    transform: { frameId: 'equipment-base', position: { x: 3.0, y: 0.9, z: 0.15 }, rotation: { x: 0, y: 0, z: 0 } },
  }],
  materials: ['machine-trim', 'stainless', 'safety-hazard', 'rack-blue', 'work-light', 'concrete'],
  thumbnail: { path: 'thumbnail.svg', sha256: HERO_DRESSING_THUMB_HASH },
  license: { name: 'Fabrik3D generated generic asset; educational use' },
  integrity: { path: 'model.glb', sha256: HERO_DRESSING_HASH },
}
