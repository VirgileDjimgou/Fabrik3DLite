import { describe, expect, it } from 'vitest'
import { PalletMachiningWorkflow, type PalletWorkflowCallbacks } from './PalletMachiningWorkflow'
import { createFullPallet } from './PalletModels'
import type { RobotMotionRuntime } from '../equipment/types'

/**
 * S36: the simulator may only drive actuators while it holds authority. When the authority gate
 * returns false the workflow must not issue any actuator command.
 */
function createRuntime() {
  let commands = 0
  const runtime = {
    equipmentId: 'robot-1',
    isMoving: false,
    moveJoints: () => { commands++ },
    enqueueMove: () => { commands++ },
    clearCommands: () => { /* no-op */ },
    getRuntimeState: () => ({ equipmentId: 'robot-1' }),
    getJointAngles: () => [0, 0, 0, 0, 0, 0],
    get commandCount() { return commands },
  }
  return runtime
}

function createCallbacks(): PalletWorkflowCallbacks {
  return {
    openCNCDoor: () => { /* no-op */ },
    startCNCMachining: () => { /* no-op */ },
    cncUnloadComplete: () => { /* no-op */ },
    getCNCState: () => 'IDLE',
    hideSlotPart: () => { /* no-op */ },
    showSlotPart: () => { /* no-op */ },
  }
}

describe('simulator actuator authority gating', () => {
  it('issues no actuator command while the authority gate denies control', () => {
    let authorized = false
    const runtime = createRuntime()
    const workflow = new PalletMachiningWorkflow(
      runtime as unknown as RobotMotionRuntime,
      createCallbacks(),
      undefined,
      null,
      () => authorized,
    )

    workflow.start(createFullPallet('hex-billet', 1, 1))
    const phaseBefore = workflow.phase
    workflow.update()

    expect(runtime.commandCount).toBe(0)
    expect(workflow.phase).toBe(phaseBefore)
  })

  it('drives the actuator once the simulator holds authority', () => {
    let authorized = false
    const runtime = createRuntime()
    const workflow = new PalletMachiningWorkflow(
      runtime as unknown as RobotMotionRuntime,
      createCallbacks(),
      undefined,
      null,
      () => authorized,
    )

    workflow.start(createFullPallet('hex-billet', 1, 1))
    workflow.update()
    expect(runtime.commandCount).toBe(0)

    authorized = true
    workflow.update()
    expect(runtime.commandCount).toBeGreaterThan(0)
  })
})
