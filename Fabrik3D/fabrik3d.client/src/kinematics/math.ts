import type { KinematicPose, KinematicQuaternion, KinematicVector3 } from './types'

export type Matrix4 = [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number]

export const IDENTITY_MATRIX: Matrix4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

export function multiplyMatrix(a: Matrix4, b: Matrix4): Matrix4 {
  const result = Array.from({ length: 16 }, () => 0)
  for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
    result[row * 4 + col] = a[row * 4]! * b[col]! + a[row * 4 + 1]! * b[4 + col]! + a[row * 4 + 2]! * b[8 + col]! + a[row * 4 + 3]! * b[12 + col]!
  }
  return result as Matrix4
}

export function dhMatrix(theta: number, d: number, a: number, alpha: number): Matrix4 {
  const ct = Math.cos(theta); const st = Math.sin(theta); const ca = Math.cos(alpha); const sa = Math.sin(alpha)
  return [ct, -st * ca, st * sa, a * ct, st, ct * ca, -ct * sa, a * st, 0, sa, ca, d, 0, 0, 0, 1]
}

export function poseFromMatrix(matrix: Matrix4, frameId = 'world'): KinematicPose {
  return { position: { x: matrix[3], y: matrix[7], z: matrix[11] }, orientation: quaternionFromMatrix(matrix), frameId }
}

export function quaternionFromMatrix(m: Matrix4): KinematicQuaternion {
  const trace = m[0]! + m[5]! + m[10]!
  let x: number; let y: number; let z: number; let w: number
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2; w = 0.25 * s; x = (m[9]! - m[6]!) / s; y = (m[2]! - m[8]!) / s; z = (m[4]! - m[1]!) / s
  } else if (m[0]! > m[5]! && m[0]! > m[10]!) {
    const s = Math.sqrt(1 + m[0]! - m[5]! - m[10]!) * 2; w = (m[9]! - m[6]!) / s; x = 0.25 * s; y = (m[1]! + m[4]!) / s; z = (m[2]! + m[8]!) / s
  } else if (m[5]! > m[10]!) {
    const s = Math.sqrt(1 + m[5]! - m[0]! - m[10]!) * 2; w = (m[2]! - m[8]!) / s; x = (m[1]! + m[4]!) / s; y = 0.25 * s; z = (m[6]! + m[9]!) / s
  } else {
    const s = Math.sqrt(1 + m[10]! - m[0]! - m[5]!) * 2; w = (m[4]! - m[1]!) / s; x = (m[2]! + m[8]!) / s; y = (m[6]! + m[9]!) / s; z = 0.25 * s
  }
  return normalizeQuaternion({ x, y, z, w })
}

export function normalizeQuaternion(q: KinematicQuaternion): KinematicQuaternion {
  const length = Math.hypot(q.x, q.y, q.z, q.w)
  return length > 0 ? { x: q.x / length, y: q.y / length, z: q.z / length, w: q.w / length } : { x: 0, y: 0, z: 0, w: 1 }
}

export function poseError(target: KinematicPose, actual: KinematicPose): number[] {
  const qTarget = normalizeQuaternion(target.orientation); const qActual = normalizeQuaternion(actual.orientation)
  const sign = qTarget.x * qActual.x + qTarget.y * qActual.y + qTarget.z * qActual.z + qTarget.w * qActual.w < 0 ? -1 : 1
  // Small-angle orientation error from qTarget * inverse(qActual).
  const x = sign * qActual.x; const y = sign * qActual.y; const z = sign * qActual.z; const w = sign * qActual.w
  const rx = qTarget.w * -x + qTarget.x * w + qTarget.y * -z - qTarget.z * -y
  const ry = qTarget.w * -y - qTarget.x * -z + qTarget.y * w + qTarget.z * -x
  const rz = qTarget.w * -z + qTarget.x * -y - qTarget.y * -x + qTarget.z * w
  return [target.position.x - actual.position.x, target.position.y - actual.position.y, target.position.z - actual.position.z, 2 * rx, 2 * ry, 2 * rz]
}

export function isFinitePose(pose: KinematicPose): boolean {
  return [pose.position.x, pose.position.y, pose.position.z, pose.orientation.x, pose.orientation.y, pose.orientation.z, pose.orientation.w].every(Number.isFinite)
}

export function vectorLength(vector: readonly number[]): number { return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) }

export function clonePose(pose: KinematicPose): KinematicPose { return { frameId: pose.frameId, position: { ...pose.position }, orientation: { ...pose.orientation } } }

export function vectorDistance(a: KinematicVector3, b: KinematicVector3): number { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) }
