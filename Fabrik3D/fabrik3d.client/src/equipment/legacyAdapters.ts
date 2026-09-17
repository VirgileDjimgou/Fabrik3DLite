import type { RobotCommand, RobotState } from '../simulation/RobotController'
import type { PalletData } from '../simulation/PalletModels'
import type { CncRuntime, EquipmentRuntimeState, PalletStationRuntime, RobotMotionRuntime } from './types'

export interface LegacyCncApi {
  state: string
  loadPart(): void
  startMachining(): void
  unloadComplete(): void
}

/** Minimal surface exposed by the current robot controller. */
export interface LegacyRobotControllerApi {
  readonly isMoving: boolean
  readonly state: RobotState
  moveJoints(targetAngles: number[], duration?: number): void
  enqueueCommand(command: RobotCommand): void
  clearCommands(): void
}

export interface LegacyPalletComponentApi {
  setSlotVisible(row: number, col: number, visible: boolean): void
}

export interface LegacyPalletFeedApi {
  getFirstStoppedPallet(): PalletData | null
  getPalletComponent(palletId: string): LegacyPalletComponentApi | null
}

export class LegacyRobotAdapter implements RobotMotionRuntime {
  constructor(readonly equipmentId: string, private readonly controller: LegacyRobotControllerApi) {}
  get isMoving(): boolean { return this.controller.isMoving }
  moveJoints(targetAngles: number[], duration?: number): void { this.controller.moveJoints(targetAngles, duration) }
  enqueueMove(targetAngles: number[], duration?: number): void {
    this.controller.enqueueCommand({ type: 'MOVE_TO_POSITION', targetAngles, duration })
  }
  clearCommands(): void { this.controller.clearCommands() }
  getRuntimeState(): EquipmentRuntimeState {
    return { status: this.controller.isMoving ? 'running' : 'idle', updatedAt: new Date().toISOString(), values: { controllerState: this.controller.state } }
  }
}

export class LegacyCncAdapter implements CncRuntime {
  constructor(readonly equipmentId: string, private readonly cnc: LegacyCncApi) {}
  openForLoad(): void { this.cnc.loadPart() }
  startMachining(): void { this.cnc.startMachining() }
  completeUnload(): void { this.cnc.unloadComplete() }
  getMachineState(): string { return this.cnc.state }
  getRuntimeState(): EquipmentRuntimeState {
    const state = this.cnc.state
    return { status: state === 'MACHINING' ? 'running' : 'idle', updatedAt: new Date().toISOString(), values: { machineState: state } }
  }
}

export class LegacyPalletStationAdapter implements PalletStationRuntime {
  constructor(readonly equipmentId: string, private readonly feed: LegacyPalletFeedApi) {}
  getFirstStoppedPallet(): PalletData | null { return this.feed.getFirstStoppedPallet() }
  setSlotVisible(palletId: string, row: number, col: number, visible: boolean): void {
    this.feed.getPalletComponent(palletId)?.setSlotVisible(row, col, visible)
  }
  getRuntimeState(): EquipmentRuntimeState {
    const pallet = this.getFirstStoppedPallet()
    return { status: pallet ? 'idle' : 'offline', updatedAt: new Date().toISOString(), values: { stoppedPalletId: pallet?.id ?? null } }
  }
}
