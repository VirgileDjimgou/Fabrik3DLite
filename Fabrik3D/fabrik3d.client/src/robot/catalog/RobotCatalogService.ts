import type { RobotDimensions } from '../IndustrialRobot'
import type { JointLimit } from '../../simulation/AxisLimits'
import { CATALOG_ASSETS } from './assets'
import { ROBOT_PROFILES, TOOL_DEFINITIONS } from './definitions'
import type { RobotDefinition, RobotProfileSummary, ToolDefinition } from './types'
import { toJointLimits } from './types'

/** Maximum absolute joint value accepted during validation (radians). */
const MAX_ABS_JOINT_RAD = 4 * Math.PI

export function validateRobotDefinition(definition: RobotDefinition): void {
  if (!definition.id.trim()) throw new Error('Robot definition id is required.')
  if (!definition.name.trim()) throw new Error(`Robot definition '${definition.id}' requires a name.`)
  if (!Number.isFinite(definition.payloadKg) || definition.payloadKg <= 0) {
    throw new Error(`Robot definition '${definition.id}' requires a positive payloadKg.`)
  }
  if (!Number.isFinite(definition.reachMeters) || definition.reachMeters <= 0) {
    throw new Error(`Robot definition '${definition.id}' requires a positive reachMeters.`)
  }
  if (!definition.controllerProfile.trim()) {
    throw new Error(`Robot definition '${definition.id}' requires a controller profile.`)
  }
  if (!definition.visualAsset.trim() || !definition.collisionModel.trim()) {
    throw new Error(`Robot definition '${definition.id}' requires visualAsset and collisionModel asset keys.`)
  }
  if (definition.joints.length !== 6) {
    throw new Error(`Robot definition '${definition.id}' must declare exactly 6 joints, got ${definition.joints.length}.`)
  }

  const jointIds = new Set<string>()
  for (const joint of definition.joints) {
    if (!joint.id.trim()) throw new Error(`Robot definition '${definition.id}' contains a joint without id.`)
    if (jointIds.has(joint.id)) throw new Error(`Robot definition '${definition.id}' contains duplicate joint '${joint.id}'.`)
    jointIds.add(joint.id)
    if (!Number.isFinite(joint.minRad) || !Number.isFinite(joint.maxRad)) {
      throw new Error(`Robot definition '${definition.id}' joint '${joint.id}' has a non-finite limit.`)
    }
    if (joint.minRad >= joint.maxRad) {
      throw new Error(`Robot definition '${definition.id}' joint '${joint.id}' has min >= max (${joint.minRad} >= ${joint.maxRad}).`)
    }
    if (Math.abs(joint.minRad) > MAX_ABS_JOINT_RAD || Math.abs(joint.maxRad) > MAX_ABS_JOINT_RAD) {
      throw new Error(`Robot definition '${definition.id}' joint '${joint.id}' exceeds the sane limit of ±${MAX_ABS_JOINT_RAD} rad.`)
    }
  }
}

export function validateToolDefinition(tool: ToolDefinition): void {
  if (!tool.id.trim()) throw new Error('Tool definition id is required.')
  if (!tool.name.trim()) throw new Error(`Tool definition '${tool.id}' requires a name.`)
  if (!Number.isFinite(tool.massKg) || tool.massKg < 0) {
    throw new Error(`Tool definition '${tool.id}' requires a non-negative massKg.`)
  }
  if (!Number.isFinite(tool.workingPayloadKg) || tool.workingPayloadKg < 0) {
    throw new Error(`Tool definition '${tool.id}' requires a non-negative workingPayloadKg.`)
  }
  if (!tool.mount.trim()) throw new Error(`Tool definition '${tool.id}' requires a flange mount.`)
}

/**
 * Resolves the asset keys declared by a robot against the known catalog
 * assets, producing a useful diagnostic when an asset is missing or unknown.
 */
export function validateRobotAssets(definition: RobotDefinition): void {
  const known = new Set(CATALOG_ASSETS.map((asset) => asset.id))
  for (const [label, assetId] of [
    ['visual asset', definition.visualAsset],
    ['collision model', definition.collisionModel],
  ] as const) {
    if (!assetId.trim()) {
      throw new Error(`Robot '${definition.id}' has an empty ${label}.`)
    }
    if (!known.has(assetId)) {
      throw new Error(
        `Robot '${definition.id}' references unknown ${label} '${assetId}'. Known assets: ${[...known].join(', ')}.`,
      )
    }
  }
}

export class RobotCatalogService {
  private readonly robots = new Map<string, RobotDefinition>()
  private readonly tools = new Map<string, ToolDefinition>()

  registerRobot(definition: RobotDefinition): void {
    validateRobotDefinition(definition)
    validateRobotAssets(definition)
    if (this.robots.has(definition.id)) {
      throw new Error(`Robot definition '${definition.id}' is already registered.`)
    }
    this.robots.set(definition.id, definition)
  }

  registerTool(tool: ToolDefinition): void {
    validateToolDefinition(tool)
    if (this.tools.has(tool.id)) throw new Error(`Tool definition '${tool.id}' is already registered.`)
    this.tools.set(tool.id, tool)
  }

  getRobot(id: string): RobotDefinition {
    const definition = this.robots.get(id)
    if (!definition) throw new Error(`Robot profile '${id}' is not in the catalog.`)
    return definition
  }

  listRobots(): RobotDefinition[] { return [...this.robots.values()] }
  listTools(): ToolDefinition[] { return [...this.tools.values()] }

  summarize(): RobotProfileSummary[] {
    return this.listRobots().map((robot) => ({
      id: robot.id,
      name: robot.name,
      payloadKg: robot.payloadKg,
      reachMeters: robot.reachMeters,
      controllerProfile: robot.controllerProfile,
      vendor: robot.vendor,
    }))
  }

  /** Dimensions used to build the visual arm for a profile. */
  resolveDimensions(robot: RobotDefinition): RobotDimensions { return { ...robot.dimensions } }

  /** Joint limits used to drive the generic controller for a profile. */
  resolveJointLimits(robot: RobotDefinition): JointLimit[] { return toJointLimits(robot.joints) }

  /** A tool is compatible when the robot payload covers tool + working payload. */
  isToolCompatible(robotId: string, toolId: string): boolean {
    const robot = this.getRobot(robotId)
    const tool = this.tools.get(toolId)
    if (!tool) throw new Error(`Tool '${toolId}' is not in the catalog.`)
    return robot.payloadKg >= tool.massKg + tool.workingPayloadKg
  }
}

/** Catalog preloaded with the three generic profiles and the default gripper. */
export function createDefaultRobotCatalog(): RobotCatalogService {
  const catalog = new RobotCatalogService()
  for (const robot of ROBOT_PROFILES) catalog.registerRobot(robot)
  for (const tool of TOOL_DEFINITIONS) catalog.registerTool(tool)
  return catalog
}
