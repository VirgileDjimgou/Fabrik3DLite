import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { IndustrialRobot, type RobotMaterials } from '../IndustrialRobot'
import { createDefaultRobotCatalog } from './RobotCatalogService'

function materials(): RobotMaterials {
  return {
    body: new THREE.MeshStandardMaterial(),
    dark: new THREE.MeshStandardMaterial(),
    gripper: new THREE.MeshStandardMaterial(),
  }
}

describe('robot profile headless instantiation', () => {
  it('instantiates every catalog profile with the same six-joint runtime', () => {
    const catalog = createDefaultRobotCatalog()
    for (const profile of catalog.listRobots()) {
      const robot = new IndustrialRobot(
        materials(),
        catalog.resolveDimensions(profile),
        catalog.resolveJointLimits(profile),
      )

      expect(robot.joints).toHaveLength(6)
      expect(robot.root).toBeTruthy()
      expect(robot.getJointAngles()).toHaveLength(6)

      robot.dispose()
    }
  })

  it('drives each profile through the generic controller limits', () => {
    const catalog = createDefaultRobotCatalog()
    const profile = catalog.getRobot('compact-6axis')
    const limits = catalog.resolveJointLimits(profile)
    expect(limits).toHaveLength(6)
    for (const limit of limits) {
      expect(limit.min).toBeLessThan(limit.max)
    }
  })
})
