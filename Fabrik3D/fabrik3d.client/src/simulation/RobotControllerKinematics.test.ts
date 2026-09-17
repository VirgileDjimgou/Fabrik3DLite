import { describe, expect, it } from 'vitest'
import { MEDIUM_6AXIS, toJointLimits } from '../robot/catalog'
import { createRobotKinematics } from '../kinematics'
import { RobotController } from './RobotController'

describe('RobotController kinematics boundary', () => {
  it('uses the injected profile model without a rendering dependency', () => {
    const model = createRobotKinematics(MEDIUM_6AXIS)
    const controller = new RobotController({ limits: toJointLimits(MEDIUM_6AXIS.joints), kinematics: model })
    controller.setJointAngles([0.1, -0.3, 0.45, 0, -0.2, 0.15])
    expect(controller.getKinematicPose()).toEqual(model.forward(controller.jointAngles))
  })
})
