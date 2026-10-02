import type { AssetSemanticNode, EquipmentAssetManifest } from './types'

export const PROFESSIONAL_ROBOT_ASSET_IDS = {
  compact: 'generic-6axis-compact-v1',
  medium: 'generic-6axis-medium-v1',
  heavy: 'generic-6axis-heavy-v1',
} as const

type RobotSize = keyof typeof PROFESSIONAL_ROBOT_ASSET_IDS

const hashes: Record<RobotSize, readonly [string, string, string]> = {
  compact: ['49e927776689e4a9bef3a2ccab45ce3dfcba5e2a40a1aa55430a4cdca7e88f96', '94d0ad665e968eb2d63d8ed073eacf974c7b9f33051e26cf50e135d4a25b3cfc', '95c126de82b394b90f42bb37d2a5ee4240b5176a61c2bf6306b50b7ec47d5921'],
  medium: ['345a7fd902372d1364e2ed8bd27c715f90de58eeb03abc7ec5fd2c1f457e2346', 'a594d55e01af463ea0f310cb592815c34d4032328d24aabcbec4ded9518f5696', '1e8a53f1b4c4534b2679053c4c42db35bd0adca8576bf61fbf96248cb885890b'],
  heavy: ['e61a52200b67043f998938d633cb2e29ed23cad460920ac771d2b5c7a224e9f0', 'b2b1670f27e1a819d3f47e30bef8820d9d9abba3c3131fa518251598dd1b7d35', '6f613fcb42cd6caba2305328d39a73203b9f65e0579cde44fe14272cfa6a57b1'],
}

const bounds: Record<RobotSize, { x: number, y: number, z: number }> = {
  compact: { x: 1.05, y: 1.95, z: 1.05 }, medium: { x: 1.6, y: 3.85, z: 1.6 }, heavy: { x: 2.05, y: 6.05, z: 2.05 },
}

function manifest(size: RobotSize): EquipmentAssetManifest {
  const [hash, lodHash, thumbHash] = hashes[size]
  const id = PROFESSIONAL_ROBOT_ASSET_IDS[size]
  return {
    schemaVersion: '1.0', id, equipmentDefinitionId: `${size}-6axis`, category: 'robot', version: '1.0.0',
    coordinateSystem: { units: 'meters', upAxis: 'Y', handedness: 'right', origin: 'equipment-base' }, boundsMeters: bounds[size],
    visual: { glb: { path: 'model.glb', sha256: hash }, lods: [{ id: 'lod1', glb: { path: 'lod/lod1.glb', sha256: lodHash }, triangleBudget: 2500 }] },
    collision: { id: 'capsule-6axis', kind: 'capsule' },
    semanticNodes: ([...Array.from({ length: 6 }, (_, index) => ({ id: `joint:j${index + 1}`, kind: 'joint' as const })), { id: 'tool:flange', kind: 'tool' as const }, { id: 'tool:tcp', kind: 'tool' as const }] satisfies AssetSemanticNode[]),
    anchors: [{ id: 'anchor:base', transform: { frameId: 'equipment-base', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } } }],
    robotRig: { joints: [{ id: 'joint:j1', axis: 'y', direction: 1 }, { id: 'joint:j2', axis: 'z', direction: 1, parentId: 'joint:j1' }, { id: 'joint:j3', axis: 'z', direction: 1, parentId: 'joint:j2' }, { id: 'joint:j4', axis: 'x', direction: 1, parentId: 'joint:j3' }, { id: 'joint:j5', axis: 'z', direction: 1, parentId: 'joint:j4' }, { id: 'joint:j6', axis: 'x', direction: 1, parentId: 'joint:j5' }], baseFrameNode: 'frame:base', flangeNode: 'tool:flange', toolFrameNode: 'tool:tcp' },
    materials: ['robot-orange', 'robot-orange-light', 'dark-steel', 'safety-label'], thumbnail: { path: 'thumbnail.svg', sha256: thumbHash },
    license: { name: 'Fabrik3D generated generic asset; educational use' }, integrity: { path: 'model.glb', sha256: hash },
  }
}

export const PROFESSIONAL_ROBOT_MANIFESTS = {
  compact: manifest('compact'), medium: manifest('medium'), heavy: manifest('heavy'),
} as const
