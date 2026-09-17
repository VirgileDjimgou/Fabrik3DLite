import type { JointLimit } from '../simulation/AxisLimits'
import { clampJoint } from '../simulation/AxisLimits'
import { dhMatrix, IDENTITY_MATRIX, isFinitePose, multiplyMatrix, poseError, poseFromMatrix, vectorLength } from './math'
import type { DhLinkDefinition, InverseKinematicsOptions, InverseKinematicsResult, KinematicPose, RobotKinematicsModel } from './types'

const DEFAULT_OPTIONS: Required<InverseKinematicsOptions> = {
  initialJointsRad: [], maxIterations: 160, positionToleranceMeters: 0.003, orientationToleranceRadians: 0.035, damping: 0.08,
}

/** Serial DH implementation independent from rendering. */
export class SerialDhKinematics implements RobotKinematicsModel {
  constructor(
    readonly id: string,
    private readonly links: readonly DhLinkDefinition[],
    readonly jointLimits: readonly JointLimit[],
  ) {
    if (links.length !== jointLimits.length) throw new Error('DH links and joint limits must have the same length.')
  }

  forward(jointsRad: readonly number[]): KinematicPose {
    if (jointsRad.length !== this.links.length) throw new Error(`Expected ${this.links.length} joint values, got ${jointsRad.length}.`)
    let transform = IDENTITY_MATRIX
    for (let index = 0; index < this.links.length; index++) {
      const link = this.links[index]!
      transform = multiplyMatrix(transform, dhMatrix(jointsRad[index]! + link.thetaOffsetRad, link.dMeters, link.aMeters, link.alphaRad))
    }
    return poseFromMatrix(transform)
  }

  inverse(target: KinematicPose, options: InverseKinematicsOptions = {}): InverseKinematicsResult {
    if (!isFinitePose(target) || target.frameId !== 'world') return failed('invalid-target', 0, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, 'Target must be finite and expressed in the world frame.')
    const settings = { ...DEFAULT_OPTIONS, ...options }
    let joints = this.jointLimits.map((limit, index) => clampJoint(settings.initialJointsRad[index] ?? 0, limit))
    let best = { joints: [...joints], error: Number.POSITIVE_INFINITY, position: Number.POSITIVE_INFINITY, orientation: Number.POSITIVE_INFINITY }
    const epsilon = 0.0001

    for (let iteration = 0; iteration < settings.maxIterations; iteration++) {
      const current = this.forward(joints)
      const error = poseError(target, current)
      const positionError = vectorLength(error.slice(0, 3)); const orientationError = vectorLength(error.slice(3))
      const totalError = positionError + orientationError * 0.25
      if (totalError < best.error) best = { joints: [...joints], error: totalError, position: positionError, orientation: orientationError }
      if (positionError <= settings.positionToleranceMeters && orientationError <= settings.orientationToleranceRadians) {
        return { jointsRad: joints, diagnostics: { status: 'converged', iterations: iteration + 1, positionErrorMeters: positionError, orientationErrorRadians: orientationError, message: 'Converged within configured tolerances.' } }
      }

      const jacobian = Array.from({ length: 6 }, () => Array.from({ length: this.links.length }, () => 0))
      for (let column = 0; column < this.links.length; column++) {
        const perturbed = [...joints]; perturbed[column] = perturbed[column]! + epsilon
        const difference = poseError(this.forward(perturbed), current)
        for (let row = 0; row < 6; row++) jacobian[row]![column] = difference[row]! / epsilon
      }
      const step = dampedLeastSquaresStep(jacobian, error, settings.damping)
      if (!step) return failed('singular', iteration + 1, positionError, orientationError, 'Jacobian is singular near the requested pose.')
      if (vectorLength(step) < 1e-9) {
        return failed('singular', iteration + 1, positionError, orientationError, 'Jacobian provides no motion direction for the requested pose.')
      }
      let changed = false
      joints = joints.map((joint, index) => {
        const next = clampJoint(joint + Math.max(-0.18, Math.min(0.18, step[index]!)), this.jointLimits[index]!)
        changed ||= Math.abs(next - joint) > 1e-8
        return next
      })
      if (!changed) break
    }
    const reachableRadius = this.links.reduce((sum, link) => sum + Math.abs(link.aMeters) + Math.abs(link.dMeters), 0)
    const status = Math.hypot(target.position.x, target.position.y, target.position.z) > reachableRadius + 0.05 ? 'unreachable' : 'max-iterations'
    return failed(status, settings.maxIterations, best.position, best.orientation, status === 'unreachable' ? 'Target is outside the model reach envelope.' : 'Solver did not converge from the provided seed.')
  }
}

function failed(status: 'unreachable' | 'singular' | 'invalid-target' | 'max-iterations', iterations: number, positionErrorMeters: number, orientationErrorRadians: number, message: string): InverseKinematicsResult {
  return { jointsRad: null, diagnostics: { status, iterations, positionErrorMeters, orientationErrorRadians, message } }
}

/** Solve Jᵀ(JJᵀ + λ²I)⁻¹e for a 6×N Jacobian. */
function dampedLeastSquaresStep(jacobian: number[][], error: number[], damping: number): number[] | null {
  const jjT = Array.from({ length: 6 }, (_, row) => Array.from({ length: 6 }, (_, col) => {
    let sum = row === col ? damping * damping : 0
    for (let index = 0; index < jacobian[row]!.length; index++) sum += jacobian[row]![index]! * jacobian[col]![index]!
    return sum
  }))
  const inverseError = solveLinearSystem(jjT, error)
  if (!inverseError) return null
  return jacobian[0]!.map((_, column) => jacobian.reduce((sum, row, index) => sum + row[column]! * inverseError[index]!, 0))
}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] | null {
  const augmented = matrix.map((row, index) => [...row, vector[index]!])
  for (let pivot = 0; pivot < augmented.length; pivot++) {
    let maxRow = pivot
    for (let row = pivot + 1; row < augmented.length; row++) if (Math.abs(augmented[row]![pivot]!) > Math.abs(augmented[maxRow]![pivot]!)) maxRow = row
    if (Math.abs(augmented[maxRow]![pivot]!) < 1e-10) return null
    ;[augmented[pivot], augmented[maxRow]] = [augmented[maxRow]!, augmented[pivot]!]
    const divisor = augmented[pivot]![pivot]!
    for (let column = pivot; column <= augmented.length; column++) augmented[pivot]![column] = augmented[pivot]![column]! / divisor
    for (let row = 0; row < augmented.length; row++) if (row !== pivot) {
      const scale = augmented[row]![pivot]!
      for (let column = pivot; column <= augmented.length; column++) augmented[row]![column] = augmented[row]![column]! - scale * augmented[pivot]![column]!
    }
  }
  return augmented.map((row) => row[augmented.length]!)
}
