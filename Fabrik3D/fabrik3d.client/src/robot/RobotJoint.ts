import * as THREE from 'three'
import type { JointLimit } from '../simulation/AxisLimits'

export type JointAxis = 'x' | 'y' | 'z'

export interface RobotJointConfig {
  name: string
  axis: JointAxis
  limit: JointLimit
  offset: THREE.Vector3
}

/**
 * Represents a single revolute joint.
 * Wraps a THREE.Group pivot and exposes an `angle` property.
 */
export class RobotJoint {
  readonly name: string
  readonly group: THREE.Group
  readonly axis: JointAxis
  readonly limit: JointLimit

  private _angle = 0

  constructor(config: RobotJointConfig) {
    this.name = config.name
    this.axis = config.axis
    this.limit = config.limit
    this.group = new THREE.Group()
    this.group.name = config.name
    this.group.position.copy(config.offset)
  }

  get angle(): number {
    return this._angle
  }

  set angle(value: number) {
    this._angle = Math.max(this.limit.min, Math.min(this.limit.max, value))
    switch (this.axis) {
      case 'x': this.group.rotation.x = this._angle; break
      case 'y': this.group.rotation.y = this._angle; break
      case 'z': this.group.rotation.z = this._angle; break
    }
  }
}
