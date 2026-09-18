import { describe, expect, it } from 'vitest'
import type { EquipmentRuntimeState } from '../equipment/types'
import type { RobotMotionRuntime } from '../equipment/types'
import { MEDIUM_6AXIS } from '../robot/catalog'
import { createSafetyRobotModel } from './robotModel'
import { MotionSafetyEngine } from './motionSafety'
import { createSingleCellWorld } from './cellObstacles'
import { vec } from './collision'
import { PALLET_HOME_POSE } from '../simulation/PalletWorkspaceTargets'
import { PalletMachiningWorkflow, type PalletWorkflowCallbacks } from '../simulation/PalletMachiningWorkflow'
import type { PalletData } from '../simulation/PalletModels'

function callbacks(): PalletWorkflowCallbacks {
  return {
    openCNCDoor: () => {},
    startCNCMachining: () => {},
    cncUnloadComplete: () => {},
    getCNCState: () => 'IDLE',
    hideSlotPart: () => {},
    showSlotPart: () => {},
  }
}

function pallet(): PalletData {
  return {
    id: 'pallet-0',
    rows: 1,
    cols: 1,
    cavityShape: 'hex',
    materialType: 'hex-billet',
    occupied: [[true]],
    slotStatus: [['raw']],
    worldX: 0,
    state: 'stopped',
  }
}

class RecordingAdapter implements RobotMotionRuntime {
  readonly equipmentId = 'robot-1'
  moves: number[][] = []
  isMoving = false
  private joints = [...PALLET_HOME_POSE]

  moveJoints(targetAngles: number[], _duration?: number): void {
    this.moves.push([...targetAngles])
    this.joints = [...targetAngles]
  }
  enqueueMove(): void {}
  clearCommands(): void {}
  getJointAngles(): number[] { return [...this.joints] }
  getRuntimeState(): EquipmentRuntimeState { return { status: 'idle', updatedAt: new Date().toISOString() } }
}

describe('end-to-end blocked-motion scenario', () => {
  it('pauses before penetrating an obstacle and reports the equipment and phase', () => {
    const world = createSingleCellWorld()
    // Keep-out zone across the pallet approach corridor.
    world.obstacles.push({
      id: 'pallet-guard',
      kind: 'safety-zone',
      primitive: { kind: 'box', min: vec(-0.5, 0.8, -1.4), max: vec(0.5, 3.0, -0.7) },
      clearanceMeters: 0.0,
    })
    const engine = new MotionSafetyEngine(createSafetyRobotModel(MEDIUM_6AXIS), world)
    const adapter = new RecordingAdapter()
    const workflow = new PalletMachiningWorkflow(adapter, callbacks(), undefined, engine)

    workflow.start(pallet())
    workflow.update()

    // A known collision prevents execution before visible penetration.
    expect(workflow.runState).toBe('paused')
    expect(adapter.moves).toHaveLength(0)

    const alarm = engine.alarms.last
    expect(alarm).not.toBeNull()
    expect(alarm?.code).toBe('COLLISION_RISK')
    expect(alarm?.equipmentId).toBe('pallet-guard')
    expect(alarm?.phase).toBe('MOVE_ABOVE_PALLET_SLOT')
  })

  it('keeps the pre-safety behavior when no safety engine is attached', () => {
    const adapter = new RecordingAdapter()
    const workflow = new PalletMachiningWorkflow(adapter, callbacks())

    workflow.start(pallet())
    workflow.update()

    expect(workflow.runState).toBe('running')
    expect(adapter.moves).toHaveLength(1)
  })
})