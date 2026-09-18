import { describe, expect, it } from 'vitest'
import type { EquipmentRuntimeState } from '../equipment/types'
import type { RobotMotionRuntime } from '../equipment/types'
import { PalletMachiningWorkflow, type PalletWorkflowCallbacks } from '../simulation/PalletMachiningWorkflow'
import { PALLET_HOME_POSE } from '../simulation/PalletWorkspaceTargets'
import type { PalletData } from '../simulation/PalletModels'
import { bindWorkflowEvents } from './workflowEvents'
import { ScenarioRunner } from './runner'
import { getScenario } from './catalog'

const FAST_TIMING = { travelDuration: 0, approachDuration: 0, gripDuration: 0, doorWait: 0, machiningDuration: 0 }

function callbacks(): PalletWorkflowCallbacks {
  return {
    openCNCDoor: () => {}, startCNCMachining: () => {}, cncUnloadComplete: () => {},
    getCNCState: () => 'UNLOADING', hideSlotPart: () => {}, showSlotPart: () => {},
  }
}

function pallet(): PalletData {
  return {
    id: 'pallet-0', rows: 1, cols: 1, cavityShape: 'hex', materialType: 'hex-billet',
    occupied: [[true]], slotStatus: [['raw']], worldX: 0, state: 'stopped',
  }
}

class RecordingAdapter implements RobotMotionRuntime {
  readonly equipmentId = 'robot-1'
  moves: number[][] = []
  isMoving = false
  private joints = [...PALLET_HOME_POSE]
  moveJoints(targetAngles: number[], _duration?: number): void { this.moves.push([...targetAngles]); this.joints = [...targetAngles] }
  enqueueMove(): void {}
  clearCommands(): void {}
  getJointAngles(): number[] { return [...this.joints] }
  getRuntimeState(): EquipmentRuntimeState { return { status: 'idle', updatedAt: new Date().toISOString() } }
}

function runWorkflow(bindEvents: boolean): { phases: string[]; runStates: string[]; palletComplete: boolean; finalState: string } {
  const adapter = new RecordingAdapter()
  const wf = new PalletMachiningWorkflow(adapter, callbacks(), FAST_TIMING)
  const phases: string[] = []
  const runStates: string[] = []
  let palletComplete = false
  wf.onPhaseChanged = (phase) => phases.push(phase)
  wf.onRunStateChanged = (state) => runStates.push(state)
  wf.onPalletComplete = () => { palletComplete = true }
  if (bindEvents) bindWorkflowEvents(wf, () => {})

  wf.start(pallet())
  for (let i = 0; i < 500; i++) wf.update()

  return { phases, runStates, palletComplete, finalState: wf.runState }
}

describe('workflow extraction equivalence', () => {
  it('binding scenario events does not change workflow outcomes', () => {
    const plain = runWorkflow(false)
    const bound = runWorkflow(true)

    expect(bound.phases).toEqual(plain.phases)
    expect(bound.runStates).toEqual(plain.runStates)
    expect(bound.palletComplete).toBe(plain.palletComplete)
    expect(bound.finalState).toBe(plain.finalState)
    expect(plain.palletComplete).toBe(true)
    expect(plain.finalState).toBe('complete')
  })

  it('the reference scenario completes through the extracted workflow events', () => {
    const adapter = new RecordingAdapter()
    const wf = new PalletMachiningWorkflow(adapter, callbacks(), FAST_TIMING)
    const runner = new ScenarioRunner(getScenario('pallet-processing'))
    runner.start()

    bindWorkflowEvents(wf, (event) => { runner.observe(event) })
    wf.start(pallet())
    for (let i = 0; i < 500; i++) wf.update()

    const state = runner.getState()
    expect(state.status).toBe('completed')
    expect(state.progressPercent).toBe(100)
    expect(state.completedCount).toBe(state.totalActivities)
  })
})