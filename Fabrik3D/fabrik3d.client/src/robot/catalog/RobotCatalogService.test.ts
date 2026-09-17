import { describe, expect, it } from 'vitest'
import {
  createDefaultRobotCatalog,
  DEFAULT_ROBOT_ID,
  MEDIUM_6AXIS,
  RobotCatalogService,
  validateRobotAssets,
  validateRobotDefinition,
  validateToolDefinition,
} from './index'
import { CAPSULE_COLLISION_MODEL_ID, PROCEDURAL_VISUAL_ASSET_ID } from './assets'
import type { RobotDefinition, ToolDefinition } from './types'

function validRobot(overrides: Partial<RobotDefinition> = {}): RobotDefinition {
  return { ...MEDIUM_6AXIS, id: 'custom-6axis', ...overrides }
}

function validTool(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return { id: 'custom-gripper', name: 'Gripper', category: 'gripper', massKg: 1, mount: 'iso-50', workingPayloadKg: 1, ...overrides }
}

describe('robot catalog validation', () => {
  it('rejects duplicate robot ids on registration', () => {
    const catalog = new RobotCatalogService()
    catalog.registerRobot(validRobot({ id: 'dup' }))
    expect(() => catalog.registerRobot(validRobot({ id: 'dup' }))).toThrow("'dup' is already registered")
  })

  it('rejects duplicate tool ids on registration', () => {
    const catalog = new RobotCatalogService()
    catalog.registerTool(validTool({ id: 'dup-tool' }))
    expect(() => catalog.registerTool(validTool({ id: 'dup-tool' }))).toThrow("'dup-tool' is already registered")
  })

  it('rejects a robot without exactly six joints', () => {
    const robot = validRobot({ joints: MEDIUM_6AXIS.joints.slice(0, 5) })
    expect(() => validateRobotDefinition(robot)).toThrow('exactly 6 joints')
  })

  it('rejects a robot with a duplicate joint id', () => {
    const joints = MEDIUM_6AXIS.joints.map((j, i) => ({ ...j, id: i === 5 ? 'j1' : j.id }))
    expect(() => validateRobotDefinition(validRobot({ joints }))).toThrow("duplicate joint 'j1'")
  })

  it('rejects joints whose min is not below max', () => {
    const joints = MEDIUM_6AXIS.joints.map((j, i) => (i === 0 ? { ...j, minRad: 1, maxRad: 1 } : j))
    expect(() => validateRobotDefinition(validRobot({ joints }))).toThrow('min >= max')
  })

  it('rejects non-finite or absurd joint limits', () => {
    const nan = MEDIUM_6AXIS.joints.map((j, i) => (i === 0 ? { ...j, maxRad: Number.NaN } : j))
    expect(() => validateRobotDefinition(validRobot({ joints: nan }))).toThrow('non-finite')

    const huge = MEDIUM_6AXIS.joints.map((j, i) => (i === 0 ? { ...j, maxRad: 100 } : j))
    expect(() => validateRobotDefinition(validRobot({ joints: huge }))).toThrow('sane limit')
  })

  it('rejects a robot with invalid payload or reach', () => {
    expect(() => validateRobotDefinition(validRobot({ payloadKg: 0 }))).toThrow('positive payloadKg')
    expect(() => validateRobotDefinition(validRobot({ reachMeters: -1 }))).toThrow('positive reachMeters')
  })

  it('rejects unknown or missing assets with a useful diagnostic', () => {
    expect(() => validateRobotAssets(validRobot({ visualAsset: 'missing-mesh' })))
      .toThrow("references unknown visual asset 'missing-mesh'")
    expect(() => validateRobotAssets(validRobot({ collisionModel: '  ' })))
      .toThrow('empty collision model')
    expect(() => new RobotCatalogService().registerRobot(validRobot({ visualAsset: 'missing-mesh' })))
      .toThrow("references unknown visual asset 'missing-mesh'")
  })

  it('rejects invalid tools', () => {
    expect(() => validateToolDefinition(validTool({ massKg: -1 }))).toThrow('non-negative massKg')
    expect(() => validateToolDefinition(validTool({ mount: '' }))).toThrow('flange mount')
  })
})

describe('default robot catalog', () => {
  it('provides exactly three generic six-axis profiles with valid assets', () => {
    const catalog = createDefaultRobotCatalog()
    const robots = catalog.listRobots()
    expect(robots.map((r) => r.id)).toEqual(['compact-6axis', 'medium-6axis', 'heavy-6axis'])
    for (const robot of robots) {
      expect(robot.joints).toHaveLength(6)
      expect(robot.visualAsset).toBe(PROCEDURAL_VISUAL_ASSET_ID)
      expect(robot.collisionModel).toBe(CAPSULE_COLLISION_MODEL_ID)
      expect(robot.controllerProfile).toBe('generic-position')
    }
  })

  it('migrates the current robot as the default compatibility profile', () => {
    const catalog = createDefaultRobotCatalog()
    expect(DEFAULT_ROBOT_ID).toBe('medium-6axis')
    expect(catalog.getRobot(DEFAULT_ROBOT_ID).dimensions).toMatchObject({
      scale: 1.25,
      upperArmLength: 1.05,
      forearmLength: 0.88,
    })
  })

  it('reports payload and reach metadata for every profile', () => {
    const catalog = createDefaultRobotCatalog()
    const summaries = catalog.summarize()
    const medium = summaries.find((s) => s.id === 'medium-6axis')
    expect(medium).toMatchObject({ payloadKg: 12, reachMeters: 1.4, controllerProfile: 'generic-position' })
  })

  it('computes tool compatibility from payload and tool mass', () => {
    const catalog = createDefaultRobotCatalog()
    // default gripper: 0.8 kg + 2 kg working = 2.8 kg needed
    expect(catalog.isToolCompatible('compact-6axis', 'two-finger-gripper')).toBe(true)
    const heavyTool = { id: 'heavy-gripper', name: 'Heavy', category: 'gripper', massKg: 4, mount: 'iso-50', workingPayloadKg: 0 } satisfies ToolDefinition
    catalog.registerTool(heavyTool)
    expect(catalog.isToolCompatible('compact-6axis', 'heavy-gripper')).toBe(false)
    expect(catalog.isToolCompatible('heavy-6axis', 'heavy-gripper')).toBe(true)
  })

  it('fails with a diagnostic when a profile id is unknown', () => {
    expect(() => createDefaultRobotCatalog().getRobot('nope')).toThrow("'nope' is not in the catalog")
  })
})
