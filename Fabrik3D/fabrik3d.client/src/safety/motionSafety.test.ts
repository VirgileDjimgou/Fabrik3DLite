import { describe, expect, it } from 'vitest'
import { MEDIUM_6AXIS } from '../robot/catalog'
import { getCncInsertPose, getPalletDownPose } from '../simulation/PalletWorkspaceTargets'
import { createSingleCellWorld, type CellCollisionWorld } from './cellObstacles'
import { vec } from './collision'
import { DEFAULT_SAFETY_OPTIONS, MotionSafetyEngine } from './motionSafety'
import { createSafetyRobotModel } from './robotModel'

const model = createSafetyRobotModel(MEDIUM_6AXIS)
const HOME = [0, -0.3, 0.5, 0, 0, 0]

function engine(overrides: Partial<typeof DEFAULT_SAFETY_OPTIONS> = {}, world: CellCollisionWorld = createSingleCellWorld()) {
  return new MotionSafetyEngine(model, world, undefined, overrides)
}

describe('MotionSafetyEngine', () => {
  it('allows a reachable, clear pallet pick motion', () => {
    const target = getPalletDownPose(0, 2, 2)
    const result = engine().checkMotion(HOME, target, 'DESCEND_TO_PICK')
    expect(result.ok).toBe(true)
    expect(result.blocked).toBe(false)
    expect(result.alarm).toBeNull()
  })

  it('allows a CNC insert through the door opening', () => {
    const result = engine().checkMotion(HOME, getCncInsertPose(), 'MOVE_TO_CNC_INSERT')
    expect(result.ok).toBe(true)
    expect(result.blocked).toBe(false)
  })

  it('blocks a motion that drives the tool into the CNC body', () => {
    // Tool tip aimed forward at the CNC header (grazes the body).
    const deepCnc = [-Math.PI / 2, -1.57, 0.45, 0, -0.2, 0]
    const result = engine().checkMotion(HOME, deepCnc, 'MOVE_TO_CNC_INSERT')
    expect(result.ok).toBe(false)
    expect(result.blocked).toBe(true)
    expect(result.alarm?.code).toBe('COLLISION_RISK')
    expect(result.alarm?.equipmentId).toBe('cnc-1')
    expect(result.alarm?.phase).toBe('MOVE_TO_CNC_INSERT')
  })

  it('blocks a joint-limit violation instead of silently clamping', () => {
    const result = engine().checkMotion(HOME, [0, 99, 0, 0, 0, 0], 'MOVE_ABOVE_PALLET_SLOT')
    expect(result.ok).toBe(false)
    expect(result.blocked).toBe(true)
    expect(result.alarm?.code).toBe('JOINT_LIMIT_VIOLATION')
  })

  it('warns (non-blocking) when a target is unreachable', () => {
    const result = engine().checkTarget({ frameId: 'world', position: vec(50, 0, 0), orientation: { x: 0, y: 0, z: 0, w: 1 } }, 'MOVE_TO_CNC_APPROACH')
    expect(result.ok).toBe(false)
    expect(result.blocked).toBe(false)
    expect(result.alarm?.code).toBe('UNREACHABLE_TARGET')
  })

  it('reports the involved equipment and phase in collision diagnostics', () => {
    const deepCnc = [-Math.PI / 2, -1.57, 0.45, 0, -0.2, 0]
    const result = engine().checkMotion(HOME, deepCnc, 'RETRACT_FROM_CNC')
    expect(result.alarm?.equipmentId).toBe('cnc-1')
    expect(result.alarm?.phase).toBe('RETRACT_FROM_CNC')
    expect(result.alarm?.message).toContain('cnc-1')
  })

  it('blocks a motion crossing an injected in-reach safety zone', () => {
    // A keep-out zone across the tool's CNC approach corridor.
    const world = createSingleCellWorld()
    world.obstacles.push({
      id: 'operator-zone',
      kind: 'safety-zone',
      primitive: { kind: 'box', min: vec(-1.5, 0.2, 1.9), max: vec(1.5, 2.4, 2.2) },
      clearanceMeters: 0.02,
    })

    const result = engine({ sweptSampleCount: 40 }, world).checkMotion(HOME, getCncInsertPose(), 'MOVE_TO_CNC_APPROACH')
    expect(result.ok).toBe(false)
    expect(result.blocked).toBe(true)
    expect(result.alarm?.equipmentId).toBe('operator-zone')
    expect(result.alarm?.code).toBe('COLLISION_RISK')
  })

  it('records raised alarms on the engine log', () => {
    const e = engine()
    e.checkTarget({ frameId: 'world', position: vec(50, 0, 0), orientation: { x: 0, y: 0, z: 0, w: 1 } }, 'MOVE_TO_CNC_APPROACH')
    expect(e.alarms.last?.code).toBe('UNREACHABLE_TARGET')
  })
})

describe('motion safety performance budget', () => {
  it('stays within a render-loop budget with diagnostics enabled', () => {
    const enabled = engine()
    const target = getPalletDownPose(0, 2, 2)
    const started = performance.now()
    for (let i = 0; i < 50; i++) enabled.checkMotion(HOME, target, 'DESCEND_TO_PICK')
    const enabledTime = performance.now() - started
    expect(enabledTime).toBeLessThan(2000)
  })

  it('is measurably cheaper when diagnostics are disabled', () => {
    const enabled = engine()
    const disabled = engine({ enabled: false })
    const target = getPalletDownPose(0, 2, 2)

    const enabledStart = performance.now()
    for (let i = 0; i < 100; i++) enabled.checkMotion(HOME, target, 'DESCEND_TO_PICK')
    const enabledTime = performance.now() - enabledStart

    const disabledStart = performance.now()
    for (let i = 0; i < 100; i++) disabled.checkMotion(HOME, target, 'DESCEND_TO_PICK')
    const disabledTime = performance.now() - disabledStart

    expect(disabledTime).toBeLessThan(enabledTime)
    expect(disabled.checkMotion(HOME, target, 'DESCEND_TO_PICK').ok).toBe(true)
  })
})