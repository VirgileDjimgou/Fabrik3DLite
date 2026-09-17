import type { Transform, Vector3Meters } from './types'

export const WORLD_FRAME_ID = 'world'

export function createTransform(
  position: Vector3Meters,
  rotation = { x: 0, y: 0, z: 0 },
  frameId = WORLD_FRAME_ID,
): Transform {
  return { frameId, position: { ...position }, rotation: { ...rotation } }
}

/** Applies a pose to a point using XYZ Euler rotation and meter units. */
export function transformPoint(transform: Transform, point: Vector3Meters): Vector3Meters {
  let { x, y, z } = point
  const rx = transform.rotation.x
  const ry = transform.rotation.y
  const rz = transform.rotation.z

  const cosX = Math.cos(rx); const sinX = Math.sin(rx)
  ;[y, z] = [y * cosX - z * sinX, y * sinX + z * cosX]
  const cosY = Math.cos(ry); const sinY = Math.sin(ry)
  ;[x, z] = [x * cosY + z * sinY, -x * sinY + z * cosY]
  const cosZ = Math.cos(rz); const sinZ = Math.sin(rz)
  ;[x, y] = [x * cosZ - y * sinZ, x * sinZ + y * cosZ]

  return {
    x: x + transform.position.x,
    y: y + transform.position.y,
    z: z + transform.position.z,
  }
}

export function isFiniteTransform(transform: Transform): boolean {
  return [
    transform.position.x, transform.position.y, transform.position.z,
    transform.rotation.x, transform.rotation.y, transform.rotation.z,
  ].every(Number.isFinite)
}
