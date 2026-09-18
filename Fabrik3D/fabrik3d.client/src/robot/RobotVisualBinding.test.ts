import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { RobotVisualBinding } from './RobotVisualBinding'

const jointAxes = ['y', 'z', 'z', 'x', 'z', 'x'] as const

function rig(): THREE.Group {
  const root = new THREE.Group()
  let parent: THREE.Object3D = root
  for (let index = 1; index <= 6; index += 1) {
    const node = new THREE.Group()
    node.userData.semanticId = `joint:j${index}`
    parent.add(node)
    parent = node
  }
  return root
}

describe('RobotVisualBinding', () => {
  it('maps controller angles to the declared J1…J6 axes without owning state', () => {
    const binding = new RobotVisualBinding(rig())
    binding.setJointAngles([0.1, 0.2, 0.3, 0.4, 0.5, 0.6])
    expect(binding.joints.map((joint, index) => joint.rotation[jointAxes[index]!])).toEqual([0.1, 0.2, 0.3, 0.4, 0.5, 0.6])
  })

  it('fails safely when an imported robot lacks a required pivot', () => {
    expect(() => new RobotVisualBinding(new THREE.Group())).toThrow("missing semantic pivot 'joint:j1'")
  })

  it('uses the declared visual rig axis and direction when an asset provides one', () => {
    const binding = new RobotVisualBinding(rig(), {
      joints: [{ id: 'joint:j1', axis: 'x', direction: -1 }, { id: 'joint:j2', axis: 'z', direction: 1, parentId: 'joint:j1' }, { id: 'joint:j3', axis: 'z', direction: 1, parentId: 'joint:j2' }, { id: 'joint:j4', axis: 'x', direction: 1, parentId: 'joint:j3' }, { id: 'joint:j5', axis: 'z', direction: 1, parentId: 'joint:j4' }, { id: 'joint:j6', axis: 'x', direction: 1, parentId: 'joint:j5' }],
      baseFrameNode: 'frame:base', flangeNode: 'tool:flange', toolFrameNode: 'tool:tcp',
    })
    binding.setJointAngles([0.2])
    expect(binding.joints[0]!.rotation.x).toBeCloseTo(-0.2)
  })
})
