import * as THREE from 'three'
import type { JointAxis } from './RobotJoint'
import type { RobotAssetRig } from '../equipment/assets'

const axes: readonly JointAxis[] = ['y', 'z', 'z', 'x', 'z', 'x']

/**
 * Visual-only adapter for a semantic robot GLB. The controller and shared
 * kinematics remain the sole owners of joint state; this class only applies
 * their angles to the asset's declared J1…J6 pivot nodes.
 */
export class RobotVisualBinding {
  readonly joints: readonly THREE.Object3D[]
  private readonly neutral: readonly number[]

  constructor(readonly root: THREE.Object3D, private readonly rig?: RobotAssetRig) {
    const found = new Map<string, THREE.Object3D>()
    root.traverse((node) => {
      const id = typeof node.userData.semanticId === 'string' ? node.userData.semanticId : node.name
      if (id.startsWith('joint:j')) found.set(id, node)
    })
    this.joints = [1, 2, 3, 4, 5, 6].map((index) => {
      const joint = found.get(`joint:j${index}`)
      if (!joint) throw new Error(`Robot visual is missing semantic pivot 'joint:j${index}'.`)
      return joint
    })
    this.neutral = this.joints.map((joint, index) => joint.rotation[this.axisFor(index)])
  }

  setJointAngles(angles: readonly number[]): void {
    this.joints.forEach((joint, index) => {
      const direction = this.rig?.joints[index]?.direction ?? 1
      joint.rotation[this.axisFor(index)] = this.neutral[index]! + direction * (angles[index] ?? 0)
    })
  }

  private axisFor(index: number): JointAxis { return this.rig?.joints[index]?.axis ?? axes[index]! }
}
