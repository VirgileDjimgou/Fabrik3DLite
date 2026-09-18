import { clampJoint, DEFAULT_JOINT_LIMITS } from '../simulation/AxisLimits'
import type { MotionSafetyEngine } from '../safety/motionSafety'
export class ManualJogController {
  private heldAxis: number | null = null
  private heldDirection = 0
  private lastHeldAt = 0
  constructor(private readonly getJoints: () => number[], private readonly setJoint: (axis: number, radians: number) => void, private readonly safety: MotionSafetyEngine, private readonly now: () => number = () => performance.now(), private readonly timeoutMs = 500) {}
  press(axis: number, direction: -1 | 1): boolean { if (axis < 0 || axis >= DEFAULT_JOINT_LIMITS.length) return false; this.heldAxis = axis; this.heldDirection = direction; this.lastHeldAt = this.now(); return true }
  release(): void { this.heldAxis = null; this.heldDirection = 0 }
  tick(stepRadians = 0.02): boolean {
    if (this.heldAxis === null || this.now() - this.lastHeldAt > this.timeoutMs) { this.release(); return false }
    const joints = this.getJoints(); const axis = this.heldAxis; const target = [...joints]; target[axis] = clampJoint(target[axis]! + stepRadians * this.heldDirection, DEFAULT_JOINT_LIMITS[axis]!)
    if (this.safety.checkMotion(joints, target, 'MANUAL_TRAINING_JOG').blocked) { this.release(); return false }
    this.setJoint(axis, target[axis]!); return true
  }
}
