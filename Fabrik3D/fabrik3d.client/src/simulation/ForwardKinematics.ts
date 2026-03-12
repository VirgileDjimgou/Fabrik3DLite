import * as THREE from 'three'

/**
 * Denavit-Hartenberg parameters for one link.
 * Convention: θ (joint angle offset), d, a, α
 */
export interface DHParameter {
  thetaOffset: number
  d: number
  a: number
  alpha: number
}

/** Approximate DH parameters for a FANUC-style 6-axis robot. */
export const DEFAULT_DH_PARAMS: readonly DHParameter[] = [
  { thetaOffset: 0, d: 0.40, a: 0.00, alpha: -Math.PI / 2 },
  { thetaOffset: -Math.PI / 2, d: 0.00, a: 0.90, alpha: 0 },
  { thetaOffset: 0, d: 0.00, a: 0.00, alpha: -Math.PI / 2 },
  { thetaOffset: 0, d: 0.76, a: 0.00, alpha: Math.PI / 2 },
  { thetaOffset: 0, d: 0.00, a: 0.00, alpha: -Math.PI / 2 },
  { thetaOffset: 0, d: 0.10, a: 0.00, alpha: 0 },
] as const

/** Build a 4×4 transformation matrix for one DH row. */
function dhMatrix(theta: number, d: number, a: number, alpha: number): THREE.Matrix4 {
  const ct = Math.cos(theta)
  const st = Math.sin(theta)
  const ca = Math.cos(alpha)
  const sa = Math.sin(alpha)

  return new THREE.Matrix4().set(
    ct, -st * ca, st * sa, a * ct,
    st, ct * ca, -ct * sa, a * st,
    0, sa, ca, d,
    0, 0, 0, 1,
  )
}

export interface FKResult {
  position: THREE.Vector3
  orientation: THREE.Quaternion
  transforms: THREE.Matrix4[]
}

/**
 * Compute forward kinematics for the given joint angles using DH parameters.
 * Returns end-effector position, orientation and per-joint transforms.
 */
export function computeForwardKinematics(
  jointAngles: number[],
  dhParams: readonly DHParameter[] = DEFAULT_DH_PARAMS,
): FKResult {
  const transforms: THREE.Matrix4[] = []
  const cumulative = new THREE.Matrix4().identity()

  for (let i = 0; i < dhParams.length; i++) {
    const p = dhParams[i]!
    const theta = jointAngles[i]! + p.thetaOffset
    const m = dhMatrix(theta, p.d, p.a, p.alpha)
    cumulative.multiply(m)
    transforms.push(cumulative.clone())
  }

  const position = new THREE.Vector3()
  const orientation = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  cumulative.decompose(position, orientation, scale)

  return { position, orientation, transforms }
}
