import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createDefaultRobotCatalog, toJointLimits } from '../robot/catalog'
import { createRobotKinematics } from '../kinematics'
import type { MotionSafetyEngine } from '../safety/motionSafety'
import { RobotVisualBinding } from '../robot/RobotVisualBinding'
import { ScenarioRobotMotionAdapter, waypointToolPosition } from './ScenarioRobotMotionAdapter'
import { createScenarioMotionPlan, SCENARIO_HOME_JOINTS } from './scenarioRobotMotion'

const catalog = createDefaultRobotCatalog()

function safeState(overrides: Partial<ScenarioStateLike> = {}): ScenarioStateLike {
  return { lifecycle: 'running', emergencyStop: false, gateOpen: false, scannerMuted: false, ...overrides }
}

interface ScenarioStateLike {
  lifecycle: 'idle' | 'running' | 'completed' | 'failed'
  emergencyStop: boolean
  gateOpen: boolean
  scannerMuted: boolean
}

function adapterFor(kind: Parameters<typeof createScenarioMotionPlan>[0], options: {
  visualBinding?: ScenarioRobotMotionAdapterOptionsSink
  safety?: MotionSafetyEngine | null
} = {}): ScenarioRobotMotionAdapter {
  return new ScenarioRobotMotionAdapter({
    plan: createScenarioMotionPlan(kind),
    profile: catalog.getRobot(createScenarioMotionPlan(kind).robotProfileId),
    visualBinding: options.visualBinding ?? null,
    safety: options.safety,
  })
}

interface ScenarioRobotMotionAdapterOptionsSink { setJointAngles(angles: readonly number[]): void }

function run(adapter: ScenarioRobotMotionAdapter, ticks = 220, dt = 0.1): void {
  for (let index = 0; index < ticks; index += 1) adapter.tick(dt)
}

function robotRig(): THREE.Object3D {
  const root = new THREE.Group()
  let parent: THREE.Object3D = root
  for (let index = 1; index <= 6; index += 1) {
    const joint = new THREE.Group()
    joint.name = `joint:j${index}`
    joint.userData.semanticId = `joint:j${index}`
    parent.add(joint)
    parent = joint
  }
  return root
}

describe('S66 ScenarioRobotMotionAdapter', () => {
  it('follows the declared waypoint order and completes deterministically', () => {
    const adapter = adapterFor('robot-palletizing', { safety: null })
    const plan = createScenarioMotionPlan('robot-palletizing')
    adapter.observeState(safeState())
    const seen: string[] = []
    for (let index = 0; index < 220; index += 1) {
      adapter.tick(0.1)
      const phase = adapter.snapshot().phase
      if (phase && seen[seen.length - 1] !== phase) seen.push(phase)
    }
    expect(seen).toEqual(plan.waypoints.map(waypoint => waypoint.phase))
    expect(adapter.snapshot().complete).toBe(true)
    expect(adapter.isMoving).toBe(false)
  })

  it('is repeatable: identical simulation ticks produce identical joint traces', () => {
    const first = adapterFor('assembly-inspection', { safety: null })
    const second = adapterFor('assembly-inspection', { safety: null })
    first.observeState(safeState())
    second.observeState(safeState())
    run(first, 260)
    run(second, 260)
    expect(second.jointHistory).toEqual(first.jointHistory)
    expect(second.jointAngles).toEqual(first.jointAngles)
  })

  it('keeps every executed joint value inside the selected profile limits', () => {
    const plan = createScenarioMotionPlan('robot-palletizing')
    const profile = catalog.getRobot(plan.robotProfileId)
    const limits = toJointLimits(profile.joints)
    const adapter = adapterFor('robot-palletizing', { safety: null })
    adapter.observeState(safeState())
    run(adapter, 260)
    for (const angles of adapter.jointHistory) {
      angles.forEach((value, index) => {
        expect(value).toBeGreaterThanOrEqual(limits[index]!.min - 1e-9)
        expect(value).toBeLessThanOrEqual(limits[index]!.max + 1e-9)
      })
    }
  })

  it('exposes a finite tool-frame position derived from the controller FK', () => {
    const plan = createScenarioMotionPlan('assembly-inspection')
    const profile = catalog.getRobot(plan.robotProfileId)
    const adapter = adapterFor('assembly-inspection', { safety: null })
    adapter.observeState(safeState())
    run(adapter, 260)
    const tool = adapter.toolPosition()
    expect(tool).not.toBeNull()
    expect([tool!.x, tool!.y, tool!.z].every(Number.isFinite)).toBe(true)
    const expected = createRobotKinematics(profile).forward(adapter.jointAngles as number[])
    expect(tool!.x).toBeCloseTo(expected.position.x, 9)
    expect(tool!.y).toBeCloseTo(expected.position.y, 9)
    expect(tool!.z).toBeCloseTo(expected.position.z, 9)
    const waypointTool = waypointToolPosition(profile, plan.waypoints[0]!)
    expect(Number.isFinite(waypointTool.x)).toBe(true)
  })

  it('mirrors controller joints onto the existing RobotVisualBinding across several joints', () => {
    const root = robotRig()
    const binding = new RobotVisualBinding(root)
    const adapter = adapterFor('robot-palletizing', { visualBinding: binding, safety: null })
    adapter.observeState(safeState())
    let multiJointFrames = 0
    for (let index = 0; index < 120; index += 1) {
      adapter.tick(0.1)
      const moved = binding.joints.filter(joint =>
        Math.abs(joint.rotation.x) + Math.abs(joint.rotation.y) + Math.abs(joint.rotation.z) > 0.01)
      if (moved.length >= 4) multiJointFrames += 1
    }
    expect(multiJointFrames).toBeGreaterThan(0)
    const axes = ['y', 'z', 'z', 'x', 'z', 'x'] as const
    binding.joints.forEach((joint, index) => {
      expect(joint.rotation[axes[index]!]).toBeCloseTo(adapter.jointAngles[index]!, 9)
    })
  })

  it('does not move while a simulated safety condition is active and resumes after controlled recovery', () => {
    const adapter = adapterFor('robot-safety-training')
    const unsafe = safeState({ emergencyStop: true, gateOpen: true, scannerMuted: true })
    adapter.observeState(unsafe)
    run(adapter, 40)
    expect(adapter.isBlocked).toBe(true)
    expect(adapter.snapshot().blockReason).toBe('emergency-stop')
    expect(adapter.jointAngles.every(value => Math.abs(value) < 1e-12)).toBe(true)

    adapter.observeState(safeState())
    expect(adapter.isBlocked).toBe(false)
    adapter.tick(0.1)
    expect(adapter.snapshot().started).toBe(true)
    run(adapter, 20)
    expect(adapter.snapshot().phase).toBe('DEMONSTRATE_MOTION')
    expect(adapter.jointAngles.some(value => Math.abs(value) > 1e-6)).toBe(true)
  })

  it('stops immediately mid-motion and only continues after the safety condition clears', () => {
    const adapter = adapterFor('robot-palletizing', { safety: null })
    adapter.observeState(safeState())
    run(adapter, 25)
    expect(adapter.jointAngles.some(value => Math.abs(value) > 1e-6)).toBe(true)

    adapter.observeState(safeState({ emergencyStop: true }))
    const frozen = [...adapter.jointAngles]
    expect(adapter.isMoving).toBe(false)
    run(adapter, 30)
    expect([...adapter.jointAngles]).toEqual(frozen)

    adapter.observeState(safeState())
    run(adapter, 30)
    expect([...adapter.jointAngles]).not.toEqual(frozen)
  })

  it('blocks a target rejected by the injected MotionSafetyEngine', () => {
    const engine = { checkMotion: () => ({ ok: false, blocked: true, alarm: null, distanceMeters: null, collisionPoint: null, sampleIndex: null }) } as unknown as MotionSafetyEngine
    const adapter = adapterFor('robot-palletizing', { safety: engine })
    adapter.observeState(safeState())
    adapter.tick(0.1)
    expect(adapter.isBlocked).toBe(true)
    expect(adapter.snapshot().blockReason).toBe('motion-safety')
    expect(adapter.jointAngles.every(value => Math.abs(value) < 1e-12)).toBe(true)
  })

  it('passes every declared waypoint through the default simulated motion-safety gate', () => {
    for (const kind of ['robot-palletizing', 'assembly-inspection', 'robot-safety-training'] as const) {
      const adapter = adapterFor(kind)
      adapter.observeState(safeState())
      run(adapter, 260)
      expect(adapter.snapshot().blocked, kind).toBe(false)
      expect(adapter.snapshot().complete, kind).toBe(true)
      adapter.jointAngles.forEach((value, index) => {
        expect(value, `${kind} J${index + 1}`).toBeCloseTo(SCENARIO_HOME_JOINTS[index]!, 9)
      })
    }
  })

  it('is idle and inert without a declared plan', () => {
    const adapter = new ScenarioRobotMotionAdapter({ plan: createScenarioMotionPlan('cnc-machine-tending') })
    adapter.observeState(safeState())
    run(adapter, 40)
    expect(adapter.hasMotion()).toBe(false)
    expect(adapter.snapshot().started).toBe(false)
    expect(adapter.jointAngles.every(value => Math.abs(value) < 1e-12)).toBe(true)
  })
})
