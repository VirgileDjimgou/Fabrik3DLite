import type { AssetSemanticNode, EquipmentAssetManifest } from './types'

export const PROFESSIONAL_ROBOT_ASSET_IDS = {
  compact: 'generic-6axis-compact-v1',
  medium: 'generic-6axis-medium-v1',
  heavy: 'generic-6axis-heavy-v1',
} as const

type RobotSize = keyof typeof PROFESSIONAL_ROBOT_ASSET_IDS

const hashes: Record<RobotSize, readonly [string, string, string]> = {
  compact: ['2b49271242ca4adbb60ab1b69b28ba7e3462f10de371ad35a015986bbda87ee1', '34bd4beca7432cc0235e0bac641b72c42dd8db8096cf4d0c2d06f0aeb5f09ea1', '95c126de82b394b90f42bb37d2a5ee4240b5176a61c2bf6306b50b7ec47d5921'],
  medium: ['f32f8a523a0a8b344255afad48a8bc45e98d5ae033b600844dd82430b6afe39a', 'e63e7cdd15296d00474fff5b4b558d5eb37f9dfbd86248a4e813fe8ffa5ce7b4', '1e8a53f1b4c4534b2679053c4c42db35bd0adca8576bf61fbf96248cb885890b'],
  heavy: ['8a0d0364676d97710d3f22c8caef07946a00fb238587a81dc1b460d2c2bc4c90', 'bb6cd3f6c63fb2e0ffa24e956e71c6b8d97db5e2c4d883efc1cf11f17c37a402', '6f613fcb42cd6caba2305328d39a73203b9f65e0579cde44fe14272cfa6a57b1'],
}

const bounds: Record<RobotSize, { x: number, y: number, z: number }> = {
  compact: { x: 1, y: 1.7, z: 1 }, medium: { x: 1.55, y: 3.1, z: 1.55 }, heavy: { x: 2, y: 4, z: 2 },
}

function manifest(size: RobotSize): EquipmentAssetManifest {
  const [hash, lodHash, thumbHash] = hashes[size]
  const id = PROFESSIONAL_ROBOT_ASSET_IDS[size]
  return {
    schemaVersion: '1.0', id, equipmentDefinitionId: `${size}-6axis`, category: 'robot', version: '1.0.0',
    coordinateSystem: { units: 'meters', upAxis: 'Y', handedness: 'right', origin: 'equipment-base' }, boundsMeters: bounds[size],
    visual: { glb: { path: 'model.glb', sha256: hash }, lods: [{ id: 'lod1', glb: { path: 'lod/lod1.glb', sha256: lodHash }, triangleBudget: 1800 }] },
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
