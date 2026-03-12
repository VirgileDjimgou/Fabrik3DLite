import * as THREE from 'three'
import { RobotJoint, type JointAxis } from './RobotJoint'
import { RobotLink } from './RobotLink'
import { DEFAULT_JOINT_LIMITS, AXIS_COUNT } from '../simulation/AxisLimits'

export interface RobotMaterials {
  body: THREE.MeshStandardMaterial
  dark: THREE.MeshStandardMaterial
  gripper: THREE.MeshStandardMaterial
}

/**
 * Procedurally-built 6-axis industrial robot (FANUC / KUKA style).
 *
 * Hierarchy:
 *   root
 *    └─ base meshes
 *    └─ axis1 (Y)
 *        └─ shoulder meshes
 *        └─ axis2 (Z)
 *            └─ upper-arm meshes
 *            └─ axis3 (Z)
 *                └─ forearm meshes
 *                └─ axis4 (X)
 *                    └─ wrist-roll meshes
 *                    └─ axis5 (Z)
 *                        └─ wrist-pitch meshes
 *                        └─ axis6 (X)
 *                            └─ flange / gripper
 */
export class IndustrialRobot {
  readonly root: THREE.Group
  readonly joints: RobotJoint[]
  private readonly links: RobotLink[] = []
  private readonly materials: RobotMaterials

  constructor(materials: RobotMaterials) {
    this.materials = materials
    this.root = new THREE.Group()
    this.root.name = 'IndustrialRobot'

    const axes: { name: string; axis: JointAxis; offset: THREE.Vector3 }[] = [
      { name: 'axis1', axis: 'y', offset: new THREE.Vector3(0, 0.4, 0) },
      { name: 'axis2', axis: 'z', offset: new THREE.Vector3(0, 0.4, 0) },
      { name: 'axis3', axis: 'z', offset: new THREE.Vector3(0, 0.9, 0) },
      { name: 'axis4', axis: 'x', offset: new THREE.Vector3(0, 0.76, 0) },
      { name: 'axis5', axis: 'z', offset: new THREE.Vector3(0, 0, 0) },
      { name: 'axis6', axis: 'x', offset: new THREE.Vector3(0, 0.1, 0) },
    ]

    this.joints = axes.map((a, i) => new RobotJoint({
      name: a.name,
      axis: a.axis,
      limit: DEFAULT_JOINT_LIMITS[i]!,
      offset: a.offset,
    }))

    this.buildGeometry()
  }

  // ── Joint angle helpers ──────────────────────────────────────────
  setJointAngles(angles: number[]): void {
    for (let i = 0; i < Math.min(angles.length, AXIS_COUNT); i++) {
      this.joints[i]!.angle = angles[i]!
    }
  }

  getJointAngles(): number[] {
    return this.joints.map((j) => j.angle)
  }

  // ── Build ────────────────────────────────────────────────────────
  private buildGeometry(): void {
    const { body, dark, gripper } = this.materials

    // ── Base ──
    const baseLink = new RobotLink('base', [
      {
        geometry: new THREE.CylinderGeometry(0.5, 0.55, 0.3, 24),
        material: dark,
        position: new THREE.Vector3(0, 0.15, 0),
      },
      {
        geometry: new THREE.CylinderGeometry(0.4, 0.4, 0.1, 24),
        material: body,
        position: new THREE.Vector3(0, 0.35, 0),
      },
    ])
    this.root.add(baseLink.group)
    this.links.push(baseLink)

    // ── Axis 1 → shoulder ──
    const shoulderLink = new RobotLink('shoulder', [
      {
        geometry: new THREE.CylinderGeometry(0.28, 0.28, 0.35, 20),
        material: body,
        position: new THREE.Vector3(0, 0.175, 0),
      },
      {
        geometry: new THREE.SphereGeometry(0.22, 16, 12),
        material: dark,
        position: new THREE.Vector3(0, 0.4, 0),
      },
    ])
    this.joints[0]!.group.add(shoulderLink.group)
    this.root.add(this.joints[0]!.group)

    // ── Axis 2 → upper arm ──
    const upperArmLink = new RobotLink('upperArm', [
      {
        geometry: new THREE.BoxGeometry(0.18, 0.9, 0.18),
        material: body,
        position: new THREE.Vector3(0, 0.45, 0),
      },
      {
        geometry: new THREE.SphereGeometry(0.16, 14, 10),
        material: dark,
        position: new THREE.Vector3(0, 0.9, 0),
      },
    ])
    this.joints[1]!.group.add(upperArmLink.group)
    this.joints[0]!.group.add(this.joints[1]!.group)

    // ── Axis 3 → forearm ──
    const forearmLink = new RobotLink('forearm', [
      {
        geometry: new THREE.BoxGeometry(0.14, 0.7, 0.14),
        material: body,
        position: new THREE.Vector3(0, 0.35, 0),
      },
      {
        geometry: new THREE.CylinderGeometry(0.1, 0.12, 0.12, 16),
        material: dark,
        position: new THREE.Vector3(0, 0.72, 0),
      },
    ])
    this.joints[2]!.group.add(forearmLink.group)
    this.joints[1]!.group.add(this.joints[2]!.group)

    // ── Axis 4 → wrist roll ──
    const wristRollLink = new RobotLink('wristRoll', [
      {
        geometry: new THREE.CylinderGeometry(0.08, 0.08, 0.15, 14),
        material: body,
        rotation: new THREE.Euler(0, 0, Math.PI / 2),
      },
    ])
    this.joints[3]!.group.add(wristRollLink.group)
    this.joints[2]!.group.add(this.joints[3]!.group)

    // ── Axis 5 → wrist pitch ──
    const wristPitchLink = new RobotLink('wristPitch', [
      {
        geometry: new THREE.SphereGeometry(0.08, 12, 8),
        material: dark,
        position: new THREE.Vector3(0, 0.1, 0),
      },
    ])
    this.joints[4]!.group.add(wristPitchLink.group)
    this.joints[3]!.group.add(this.joints[4]!.group)

    // ── Axis 6 → flange + gripper ──
    const flangeLink = new RobotLink('flange', [
      {
        geometry: new THREE.CylinderGeometry(0.07, 0.07, 0.04, 14),
        material: body,
        position: new THREE.Vector3(0, 0.02, 0),
      },
    ])
    this.joints[5]!.group.add(flangeLink.group)
    this.joints[4]!.group.add(this.joints[5]!.group)

    // ── Tool – gripper ──
    const toolGroup = new THREE.Group()
    toolGroup.name = 'tool'
    toolGroup.position.y = 0.05

    const gripperLink = new RobotLink('gripper', [
      {
        geometry: new THREE.BoxGeometry(0.06, 0.04, 0.12),
        material: gripper,
        position: new THREE.Vector3(0, 0.02, 0),
      },
      {
        geometry: new THREE.BoxGeometry(0.015, 0.1, 0.02),
        material: gripper,
        position: new THREE.Vector3(0, 0.09, 0.045),
      },
      {
        geometry: new THREE.BoxGeometry(0.015, 0.1, 0.02),
        material: gripper,
        position: new THREE.Vector3(0, 0.09, -0.045),
      },
    ])
    toolGroup.add(gripperLink.group)
    this.joints[5]!.group.add(toolGroup)
    this.links.push(gripperLink)
  }

  /** Clean up all GPU resources. */
  dispose(): void {
    for (const link of this.links) link.dispose()
    this.materials.body.dispose()
    this.materials.dark.dispose()
    this.materials.gripper.dispose()
  }
}
