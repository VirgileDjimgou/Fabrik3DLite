import type { RobotDefinition } from '../robot/catalog'
import { toJointLimits } from '../robot/catalog'
import { SerialDhKinematics } from './SerialDhKinematics'
import type { DhLinkDefinition, RobotKinematicsModel } from './types'

/**
 * Maps existing procedural robot dimensions to a generic DH chain.
 * This is a simulation model, not an OEM robot calibration.
 */
export function createRobotKinematics(robot: RobotDefinition): RobotKinematicsModel {
  const dimensions = robot.dimensions
  const links: DhLinkDefinition[] = [
    { thetaOffsetRad: 0, dMeters: dimensions.baseHeight ?? 0.4, aMeters: 0, alphaRad: -Math.PI / 2 },
    { thetaOffsetRad: -Math.PI / 2, dMeters: 0, aMeters: dimensions.upperArmLength ?? 0.9, alphaRad: 0 },
    { thetaOffsetRad: 0, dMeters: 0, aMeters: 0, alphaRad: -Math.PI / 2 },
    { thetaOffsetRad: 0, dMeters: dimensions.forearmLength ?? 0.76, aMeters: 0, alphaRad: Math.PI / 2 },
    { thetaOffsetRad: 0, dMeters: 0, aMeters: 0, alphaRad: -Math.PI / 2 },
    { thetaOffsetRad: 0, dMeters: dimensions.wristLength ?? 0.1, aMeters: 0, alphaRad: 0 },
  ]
  return new SerialDhKinematics(robot.id, links, toJointLimits(robot.joints))
}
