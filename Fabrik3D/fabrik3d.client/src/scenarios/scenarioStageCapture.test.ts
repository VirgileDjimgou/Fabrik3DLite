import { describe, expect, it } from 'vitest'
import { getScenario } from './catalog'
import { buildScenarioProcess } from './scenarioProcess'
import {
  buildScenarioStageCapturePlan,
  resolveStageCaptureTarget,
  stageCaptureSequence,
} from './scenarioStageCapture'

/**
 * S71: the execution-stage capture plan must be a pure, deterministic view of
 * the declared S67 process. These tests pin the ordering, the step counts and
 * the fail-closed behaviour for unknown stage ids.
 */
describe('scenarioStageCapture', () => {
  it('builds one ordered target per declared stage with monotonic step counts', () => {
    const definition = buildScenarioProcess(getScenario('palletizing-normal-cycle'))
    const plan = buildScenarioStageCapturePlan(definition)

    expect(plan.scenarioId).toBe('palletizing-normal-cycle')
    expect(plan.stageCount).toBe(definition.stages.length)
    expect(plan.targets.map(target => target.stageId)).toEqual(
      definition.stages.map(stage => stage.stageId),
    )
    plan.targets.forEach((target, index) => {
      expect(target.index).toBe(index)
      expect(target.steps).toBe(index + 1)
    })
  })

  it('marks the declared fault and recovery stages without inventing them', () => {
    const definition = buildScenarioProcess(getScenario('safety-door-recovery'))
    const plan = buildScenarioStageCapturePlan(definition)

    const fault = plan.targets.find(target => target.faultPoint)
    const recovery = plan.targets.find(target => target.recoveryPoint)
    expect(fault?.stageId).toBe('safety-motion-inhibited')
    expect(recovery?.stageId).toBe('safety-operator-acknowledged')
    // A normal cycle declares neither.
    const normal = buildScenarioStageCapturePlan(buildScenarioProcess(getScenario('assembly-inspection-cycle')))
    expect(normal.targets.some(target => target.faultPoint)).toBe(false)
    expect(normal.targets.some(target => target.recoveryPoint)).toBe(false)
  })

  it('resolves a known stage id and fails closed for an unknown one', () => {
    const plan = buildScenarioStageCapturePlan(buildScenarioProcess(getScenario('sorting-normal-cycle')))
    expect(resolveStageCaptureTarget(plan, 'vision-classified')?.index).toBe(4)
    expect(resolveStageCaptureTarget(plan, 'not-a-stage')).toBeNull()
  })

  it('exposes the full declared sequence including fault and recovery stages', () => {
    const plan = buildScenarioStageCapturePlan(buildScenarioProcess(getScenario('sorting-jam-recovery')))
    const sequence = stageCaptureSequence(plan)
    expect(sequence).toContain('vision-jam-detected')
    expect(sequence).toContain('vision-operator-acknowledged')
    expect(sequence[0]).toBe('vision-conveyor-advances')
  })
})
