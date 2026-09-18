import type { EquipmentAssetManifest } from './types'

export const REFERENCE_6AXIS_GLB_ASSET_ID = 'reference-6axis-glb' as const

/** A deliberately tiny valid GLB used for headless loader smoke tests. */
export const REFERENCE_EMPTY_SCENE_GLB_BASE64 =
  'Z2xURgIAAABIAAAANAAAAEpTT057ImFzc2V0Ijp7InZlcnNpb24iOiIyLjAifSwic2NlbmUiOjAsInNjZW5lcyI6W3t9XX0g'

const testHash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

/**
 * Reference package metadata. The GLB payload above is intentionally held in
 * source for tests; production packages use the documented directory layout.
 */
export const REFERENCE_6AXIS_GLB_MANIFEST: EquipmentAssetManifest = {
  schemaVersion: '1.0',
  id: REFERENCE_6AXIS_GLB_ASSET_ID,
  equipmentDefinitionId: 'medium-6axis',
  category: 'robot',
  version: '0.1.0',
  coordinateSystem: { units: 'meters', upAxis: 'Y', handedness: 'right', origin: 'equipment-base' },
  boundsMeters: { x: 1.2, y: 2.0, z: 1.2 },
  visual: { glb: { path: 'model.glb', sha256: testHash }, lods: [] },
  collision: { id: 'capsule-6axis', kind: 'capsule' },
  semanticNodes: [
    { id: 'joint:j1', kind: 'joint' },
    { id: 'joint:j2', kind: 'joint' },
    { id: 'joint:j3', kind: 'joint' },
    { id: 'joint:j4', kind: 'joint' },
    { id: 'joint:j5', kind: 'joint' },
    { id: 'joint:j6', kind: 'joint' },
    { id: 'tool:flange', kind: 'tool' },
  ],
  anchors: [{
    id: 'anchor:tool.flange',
    transform: { frameId: 'tool', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
  }],
  materials: ['painted-metal', 'dark-metal'],
  thumbnail: { path: 'thumbnail.webp', sha256: testHash },
  license: { name: 'Fabrik3D reference asset; educational use' },
  integrity: { path: 'manifest.sha256', sha256: testHash },
}

export function referenceGlbArrayBuffer(): ArrayBuffer {
  const binary = globalThis.atob(REFERENCE_EMPTY_SCENE_GLB_BASE64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes.buffer
}
