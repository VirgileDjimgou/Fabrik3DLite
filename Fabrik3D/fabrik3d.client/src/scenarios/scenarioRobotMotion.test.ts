import { describe, expect, it } from 'vitest'
import { createDefaultRobotCatalog } from '../robot/catalog'
import { clampJoints } from '../simulation/AxisLimits'
import type { ScenarioCellKind } from './cellComposition'
import {
  createScenarioMotionPlan,
  emptyScenarioMotionPlan,
  hasScenarioRobotMotion,
  motionInhibitReason,
  SCENARIO_HOME_JOINTS,
} from './scenarioRobotMotion'

const catalog = createDefaultRobotCatalog()

const EXPECTED_PHASES: ReadonlyArray<readonly [ScenarioCellKind, readonly string[]]> = [
  ['robot-palletizing', [
    'SCENARIO_HOME', 'APPROACH_PICK', 'PICK_PART', 'LIFT_FROM_PICK', 'TRANSFER_PART',
    'APPROACH_PLACE', 'PLACE_PART', 'RELEASE_PART', 'RETREAT_FROM_PLACE', 'SCENARIO_HOME',
  ]],
  ['assembly-inspection', [
    'SCENARIO_HOME', 'APPROACH_PICK', 'PICK_PART', 'LIFT_FROM_PICK', 'TRANSFER_PART',
    'APPROACH_PLACE', 'PLACE_PART', 'RELEASE_PART', 'RETREAT_FROM_PLACE', 'INSPECTION_POSE', 'SCENARIO_HOME',
  ]],
  ['robot-safety-training', ['SCENARIO_HOME', 'DEMONSTRATE_MOTION', 'DEMONSTRATE_MOTION', 'SCENARIO_HOME']],
]

describe('S66 scenario robot motion plans', () => {
  it('declares the documented waypoint ordering per cell', () => {
    for (const [kind, phases] of EXPECTED_PHASES) {
      const plan = createScenarioMotionPlan(kind)
      expect(plan.waypoints.map(waypoint => waypoint.phase), kind).toEqual([...phases])
      expect(plan.schemaVersion).toBe('1.0')
    }
  })

  it('is deterministic, immutable data', () => {
    const first = createScenarioMotionPlan('robot-palletizing')
    const second = createScenarioMotionPlan('robot-palletizing')
    expect(second).toEqual(first)
    expect(Object.isFrozen(second)).toBe(true)
    expect(Object.isFrozen(second.waypoints)).toBe(true)
    expect(Object.isFrozen(second.waypoints[0])).toBe(true)
    expect(Object.isFrozen(second.waypoints[0]!.targetJointsRad)).toBe(true)
  })

  it('selects a compatible existing catalog profile per cell', () => {
    // S69 composition: palletizing uses the medium arm so every box/pallet
    // target is inside its envelope and the back fence is outside it; safety
    // training uses the compact arm so the repositioned training fence clears it.
    expect(createScenarioMotionPlan('robot-palletizing').robotProfileId).toBe('medium-6axis')
    expect(createScenarioMotionPlan('assembly-inspection').robotProfileId).toBe('compact-6axis')
    expect(createScenarioMotionPlan('robot-safety-training').robotProfileId).toBe('compact-6axis')
    for (const [kind] of EXPECTED_PHASES) {
      const plan = createScenarioMotionPlan(kind)
      expect(catalog.getRobot(plan.robotProfileId).id).toBe(plan.robotProfileId)
    }
  })

  it('keeps every waypoint within the selected profile joint limits', () => {
    for (const [kind] of EXPECTED_PHASES) {
      const plan = createScenarioMotionPlan(kind)
      const profile = catalog.getRobot(plan.robotProfileId)
      const limits = profile.joints.map(joint => ({ min: joint.minRad, max: joint.maxRad }))
      for (const waypoint of plan.waypoints) {
        expect(waypoint.targetJointsRad).toHaveLength(6)
        for (const [index, value] of waypoint.targetJointsRad.entries()) {
          expect(Number.isFinite(value), `${kind} J${index + 1}`).toBe(true)
          expect(value, `${kind} J${index + 1}`).toBeGreaterThanOrEqual(limits[index]!.min)
          expect(value, `${kind} J${index + 1}`).toBeLessThanOrEqual(limits[index]!.max)
        }
        expect(clampJoints([...waypoint.targetJointsRad], limits)).toEqual([...waypoint.targetJointsRad])
        expect(waypoint.durationSeconds).toBeGreaterThan(0)
      }
      expect(plan.waypoints[0]!.targetJointsRad).toEqual([...SCENARIO_HOME_JOINTS])
    }
  })

  it('exercises several joints across palletizing and assembly', () => {
    for (const [kind] of EXPECTED_PHASES.slice(0, 2)) {
      const plan = createScenarioMotionPlan(kind)
      const exercised = new Set<number>()
      for (const waypoint of plan.waypoints) {
        waypoint.targetJointsRad.forEach((value, index) => { if (Math.abs(value) > 1e-6) exercised.add(index + 1) })
      }
      expect(exercised.size, kind).toBeGreaterThanOrEqual(4)
    }
  })

  it('returns an empty, non-running plan for unrelated cell kinds', () => {
    const plan = emptyScenarioMotionPlan('vision-sorting')
    expect(plan.waypoints).toHaveLength(0)
    expect(hasScenarioRobotMotion('vision-sorting')).toBe(false)
    expect(hasScenarioRobotMotion('cnc-machine-tending')).toBe(false)
    expect(hasScenarioRobotMotion('robot-palletizing')).toBe(true)
  })

  it('prioritises E-stop over interlock and muted scanner', () => {
    expect(motionInhibitReason({ emergencyStop: false, gateOpen: false, scannerMuted: false })).toBeNull()
    expect(motionInhibitReason({ emergencyStop: true, gateOpen: true, scannerMuted: true })).toBe('emergency-stop')
    expect(motionInhibitReason({ emergencyStop: false, gateOpen: true, scannerMuted: true })).toBe('interlock-open')
    expect(motionInhibitReason({ emergencyStop: false, gateOpen: false, scannerMuted: true })).toBe('scanner-muted')
  })
})
