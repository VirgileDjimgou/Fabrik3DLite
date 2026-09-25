import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EquipmentRuntimeState, RobotMotionRuntime } from '../equipment/types'
import { CncCycleMachine, timingsForMachiningDuration } from './CncCycleMachine'
import { createFullPallet } from './PalletModels'
import { PalletMachiningWorkflow, type PalletWorkflowCallbacks } from './PalletMachiningWorkflow'

/**
 * Integration between the deterministic pallet workflow and the S39 CNC cycle
 * machine: the workflow's coarse-state expectations must stay aligned with the
 * richer cycle phases so the reference cell still completes without a browser.
 */

class FakeRobot implements RobotMotionRuntime {
  readonly equipmentId = 'robot-1'
  isMoving = false
  private joints = [0, 0, 0, 0, 0, 0]
  private current: { target: number[]; duration: number; elapsed: number } | null = null
  private queue: Array<{ target: number[]; duration: number }> = []

  moveJoints(target: number[], duration = 0): void { this.queue = []; this.start(target, duration) }
  enqueueMove(target: number[], duration = 0): void { this.queue.push({ target: [...target], duration }) }
  clearCommands(): void { this.queue = []; this.current = null; this.isMoving = false }
  getJointAngles(): number[] { return [...this.joints] }
  getRuntimeState(): EquipmentRuntimeState {
    return { status: this.isMoving ? 'running' : 'idle', updatedAt: '', values: {} }
  }

  tick(dt: number): void {
    if (!this.current) { this.startNext(); return }
    this.current.elapsed += dt
    if (this.current.elapsed >= this.current.duration) {
      this.joints = [...this.current.target]
      this.current = null
      this.isMoving = false
      this.startNext()
    }
  }

  private startNext(): void {
    const next = this.queue.shift()
    if (next) this.start(next.target, next.duration)
  }

  private start(target: number[], duration: number): void {
    if (duration <= 0) { this.joints = [...target]; this.current = null; this.isMoving = false; return }
    this.current = { target: [...target], duration, elapsed: 0 }
    this.isMoving = true
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
})
afterEach(() => { vi.useRealTimers() })

describe('pallet workflow ↔ CNC cycle machine integration (S39)', () => {
  it('completes a pallet while the CNC runs its full coarse-state sequence', () => {
    const robot = new FakeRobot()
    const cnc = new CncCycleMachine(timingsForMachiningDuration(5))
    const coarseStates: string[] = []
    const phases: string[] = []
    cnc.onPhaseChanged = (phase) => phases.push(phase)

    const callbacks: PalletWorkflowCallbacks = {
      openCNCDoor: () => { cnc.loadPart() },
      startCNCMachining: () => { cnc.startMachining() },
      cncUnloadComplete: () => { cnc.unloadComplete() },
      getCNCState: () => cnc.coarseState,
      hideSlotPart: () => {},
      showSlotPart: () => {},
    }

    const workflow = new PalletMachiningWorkflow(robot, callbacks)
    workflow.onPhaseChanged = (phase) => phases.push(`workflow:${phase}`)
    workflow.start(createFullPallet('hex-billet', 1, 1, -1.5))

    let steps = 0
    while (workflow.runState !== 'complete' && steps < 20_000) {
      steps += 1
      vi.advanceTimersByTime(100)
      robot.tick(0.1)
      cnc.update(0.1)
      workflow.update()
      const coarse = cnc.coarseState
      if (coarseStates[coarseStates.length - 1] !== coarse) coarseStates.push(coarse)
    }

    expect(workflow.runState).toBe('complete')
    expect(workflow.slotsCompleted).toBe(1)
    expect(coarseStates).toEqual(['IDLE', 'LOADING', 'MACHINING', 'UNLOADING', 'IDLE'])
    // The full cycle really ran through the fine-grained phases, not a shortcut.
    for (const phase of ['LOAD_OPENING', 'DOOR_CLOSING', 'CLAMPING', 'SPINDLE_RAMP_UP', 'FEED', 'SPINDLE_RAMP_DOWN', 'UNCLAMPING', 'UNLOAD_READY']) {
      expect(phases).toContain(phase)
    }
  })
})
