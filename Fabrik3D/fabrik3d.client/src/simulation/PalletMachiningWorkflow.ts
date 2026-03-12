/**
 * Full pallet-to-CNC-to-same-pallet machining workflow.
 *
 * Processes every raw slot on the first stopped pallet:
 *   pick → CNC load → machine → retrieve → return to same slot.
 *
 * Supports start / pause / resume / stop / reset.
 * Exposes readable state for the operator dashboard.
 */

import type { RobotController } from './RobotController'
import type { PalletData } from './PalletModels'
import { nextRawSlot, pickSlot, returnSlot, isPalletComplete } from './PalletModels'
import {
  PALLET_HOME_POSE,
  getPalletAbovePose,
  getPalletDownPose,
  getCncApproachPose,
  getCncInsertPose,
} from './PalletWorkspaceTargets'

// ── Phase enum ─────────────────────────────────────────────────────

export type PalletWorkflowPhase =
  | 'IDLE'
  | 'SELECT_NEXT_SLOT'
  | 'MOVE_ABOVE_PALLET_SLOT'
  | 'DESCEND_TO_PICK'
  | 'PICK_PART'
  | 'LIFT_FROM_PALLET'
  | 'MOVE_TO_CNC_APPROACH'
  | 'OPEN_CNC_DOOR'
  | 'MOVE_TO_CNC_INSERT'
  | 'LOAD_PART'
  | 'RETRACT_FROM_CNC'
  | 'CLOSE_CNC_DOOR'
  | 'MACHINING'
  | 'OPEN_CNC_DOOR_RETRIEVE'
  | 'MOVE_TO_CNC_RETRIEVE'
  | 'RETRIEVE_PART'
  | 'LIFT_FROM_CNC'
  | 'MOVE_ABOVE_ORIGIN_SLOT'
  | 'DESCEND_TO_ORIGIN_SLOT'
  | 'PLACE_PART_BACK'
  | 'LIFT_AFTER_PLACE'
  | 'NEXT_SLOT'
  | 'COMPLETE'

/** High-level run state for the dashboard. */
export type WorkflowRunState = 'idle' | 'running' | 'paused' | 'stopped' | 'complete'

// ── Timing config ──────────────────────────────────────────────────

export interface PalletWorkflowTiming {
  travelDuration: number
  approachDuration: number
  gripDuration: number
  doorWait: number
  machiningDuration: number
}

export const DEFAULT_PALLET_TIMING: PalletWorkflowTiming = {
  travelDuration:    3.0,
  approachDuration:  1.2,
  gripDuration:      1.0,
  doorWait:          1.0,
  machiningDuration: 5.0,
}

// ── Callbacks from the scene ───────────────────────────────────────

export interface PalletWorkflowCallbacks {
  openCNCDoor: () => void
  startCNCMachining: () => void
  cncUnloadComplete: () => void
  getCNCState: () => string
  hideSlotPart: (palletId: string, row: number, col: number) => void
  showSlotPart: (palletId: string, row: number, col: number) => void
}

// ── Workflow class ─────────────────────────────────────────────────

export class PalletMachiningWorkflow {
  phase: PalletWorkflowPhase = 'IDLE'
  runState: WorkflowRunState = 'idle'
  slotsCompleted = 0

  /** Fires on every phase change. */
  onPhaseChanged: ((phase: PalletWorkflowPhase) => void) | null = null
  /** Fires when run-state changes. */
  onRunStateChanged: ((state: WorkflowRunState) => void) | null = null
  /** Fires when one slot cycle is done. */
  onSlotComplete: ((row: number, col: number) => void) | null = null
  /** Fires when the entire pallet is done. */
  onPalletComplete: (() => void) | null = null

  private readonly ctrl: RobotController
  private readonly cb: PalletWorkflowCallbacks
  readonly timing: PalletWorkflowTiming

  private _pallet: PalletData | null = null
  private _currentRow = 0
  private _currentCol = 0
  private waitUntil = 0

  constructor(
    controller: RobotController,
    callbacks: PalletWorkflowCallbacks,
    timing?: Partial<PalletWorkflowTiming>,
  ) {
    this.ctrl = controller
    this.cb = callbacks
    this.timing = { ...DEFAULT_PALLET_TIMING, ...timing }
  }

  // ── Readable state for the dashboard ─────────────────────────

  get pallet(): PalletData | null { return this._pallet }
  get currentRow(): number { return this._currentRow }
  get currentCol(): number { return this._currentCol }
  get totalSlots(): number { return this._pallet ? this._pallet.rows * this._pallet.cols : 0 }
  get remainingSlots(): number { return this.totalSlots - this.slotsCompleted }
  get progressPercent(): number { return this.totalSlots > 0 ? Math.round((this.slotsCompleted / this.totalSlots) * 100) : 0 }

  // ── Control API ──────────────────────────────────────────────

  /** Begin processing a pallet from its first raw slot. */
  start(pallet: PalletData): void {
    this._pallet = pallet
    this.slotsCompleted = 0
    this.setRunState('running')
    this.setPhase('SELECT_NEXT_SLOT')
  }

  /** Pause workflow – robot finishes current motion then stops. */
  pause(): void {
    if (this.runState === 'running') {
      this.setRunState('paused')
    }
  }

  /** Resume from paused state. */
  resume(): void {
    if (this.runState === 'paused') {
      this.setRunState('running')
    }
  }

  /** Stop the workflow entirely. */
  stop(): void {
    this.setRunState('stopped')
    this.ctrl.clearCommands()
  }

  /** Reset the workflow back to idle (caller should also reset pallet data). */
  reset(): void {
    this.ctrl.clearCommands()
    this.setPhase('IDLE')
    this.setRunState('idle')
    this.slotsCompleted = 0
    this._pallet = null
    this._currentRow = 0
    this._currentCol = 0
    this.waitUntil = 0
    this.ctrl.moveJoints(PALLET_HOME_POSE, 1.5)
  }

  // ── Core frame update ────────────────────────────────────────

  update(): void {
    if (this.runState !== 'running' || !this._pallet) return
    if (this.phase === 'IDLE' || this.phase === 'COMPLETE') return
    if (this.ctrl.isMoving) return

    const now = performance.now() / 1000
    const t = this.timing
    const p = this._pallet

    switch (this.phase) {
      // ──────── Slot selection ─────────────────────────────────

      case 'SELECT_NEXT_SLOT': {
        const slot = nextRawSlot(p)
        if (!slot) {
          this.setPhase('COMPLETE')
          this.setRunState('complete')
          this.onPalletComplete?.()
          return
        }
        this._currentRow = slot[0]
        this._currentCol = slot[1]
        this.setPhase('MOVE_ABOVE_PALLET_SLOT')
        this.ctrl.moveJoints(
          getPalletAbovePose(p.worldX, this._currentRow, this._currentCol, p.rows, p.cols),
          t.travelDuration,
        )
        break
      }

      // ──────── Pick from pallet ──────────────────────────────

      case 'MOVE_ABOVE_PALLET_SLOT':
        this.setPhase('DESCEND_TO_PICK')
        this.ctrl.moveJoints(
          getPalletDownPose(p.worldX, this._currentRow, this._currentCol, p.rows, p.cols),
          t.approachDuration,
        )
        break

      case 'DESCEND_TO_PICK':
        this.setPhase('PICK_PART')
        pickSlot(p, this._currentRow, this._currentCol)
        this.cb.hideSlotPart(p.id, this._currentRow, this._currentCol)
        this.waitUntil = now + t.gripDuration
        break

      case 'PICK_PART':
        if (now < this.waitUntil) return
        this.setPhase('LIFT_FROM_PALLET')
        this.ctrl.moveJoints(
          getPalletAbovePose(p.worldX, this._currentRow, this._currentCol, p.rows, p.cols),
          t.approachDuration,
        )
        break

      // ──────── Travel to CNC ─────────────────────────────────

      case 'LIFT_FROM_PALLET':
        this.setPhase('MOVE_TO_CNC_APPROACH')
        this.ctrl.moveJoints(PALLET_HOME_POSE, t.travelDuration * 0.5)
        this.ctrl.enqueueCommand({
          type: 'MOVE_TO_POSITION',
          targetAngles: getCncApproachPose(),
          duration: t.travelDuration * 0.6,
        })
        break

      case 'MOVE_TO_CNC_APPROACH':
        this.setPhase('OPEN_CNC_DOOR')
        this.cb.openCNCDoor()
        this.waitUntil = now + t.doorWait
        break

      case 'OPEN_CNC_DOOR':
        if (now < this.waitUntil) return
        this.setPhase('MOVE_TO_CNC_INSERT')
        this.ctrl.moveJoints(getCncInsertPose(), t.approachDuration)
        break

      case 'MOVE_TO_CNC_INSERT':
        this.setPhase('LOAD_PART')
        this.waitUntil = now + t.gripDuration
        break

      case 'LOAD_PART':
        if (now < this.waitUntil) return
        this.setPhase('RETRACT_FROM_CNC')
        this.ctrl.moveJoints(getCncApproachPose(), t.approachDuration)
        break

      case 'RETRACT_FROM_CNC':
        this.setPhase('CLOSE_CNC_DOOR')
        this.cb.startCNCMachining()
        this.waitUntil = now + t.machiningDuration
        break

      // ──────── Machining ─────────────────────────────────────

      case 'CLOSE_CNC_DOOR':
        this.setPhase('MACHINING')
        this.ctrl.moveJoints(PALLET_HOME_POSE, t.travelDuration)
        break

      case 'MACHINING':
        if (now < this.waitUntil) return
        if (this.cb.getCNCState() !== 'UNLOADING') return
        this.setPhase('OPEN_CNC_DOOR_RETRIEVE')
        this.ctrl.moveJoints(getCncApproachPose(), t.travelDuration)
        break

      // ──────── Retrieve from CNC ─────────────────────────────

      case 'OPEN_CNC_DOOR_RETRIEVE':
        this.setPhase('MOVE_TO_CNC_RETRIEVE')
        this.ctrl.moveJoints(getCncInsertPose(), t.approachDuration)
        break

      case 'MOVE_TO_CNC_RETRIEVE':
        this.setPhase('RETRIEVE_PART')
        this.cb.cncUnloadComplete()
        this.waitUntil = now + t.gripDuration
        break

      case 'RETRIEVE_PART':
        if (now < this.waitUntil) return
        this.setPhase('LIFT_FROM_CNC')
        this.ctrl.moveJoints(getCncApproachPose(), t.approachDuration)
        break

      // ──────── Return to same pallet slot ────────────────────

      case 'LIFT_FROM_CNC':
        this.setPhase('MOVE_ABOVE_ORIGIN_SLOT')
        this.ctrl.moveJoints(PALLET_HOME_POSE, t.travelDuration * 0.5)
        this.ctrl.enqueueCommand({
          type: 'MOVE_TO_POSITION',
          targetAngles: getPalletAbovePose(p.worldX, this._currentRow, this._currentCol, p.rows, p.cols),
          duration: t.travelDuration * 0.6,
        })
        break

      case 'MOVE_ABOVE_ORIGIN_SLOT':
        this.setPhase('DESCEND_TO_ORIGIN_SLOT')
        this.ctrl.moveJoints(
          getPalletDownPose(p.worldX, this._currentRow, this._currentCol, p.rows, p.cols),
          t.approachDuration,
        )
        break

      case 'DESCEND_TO_ORIGIN_SLOT':
        this.setPhase('PLACE_PART_BACK')
        returnSlot(p, this._currentRow, this._currentCol)
        this.cb.showSlotPart(p.id, this._currentRow, this._currentCol)
        this.waitUntil = now + t.gripDuration
        break

      case 'PLACE_PART_BACK':
        if (now < this.waitUntil) return
        this.setPhase('LIFT_AFTER_PLACE')
        this.ctrl.moveJoints(
          getPalletAbovePose(p.worldX, this._currentRow, this._currentCol, p.rows, p.cols),
          t.approachDuration,
        )
        break

      // ──────── Advance to next slot ──────────────────────────

      case 'LIFT_AFTER_PLACE':
        this.slotsCompleted++
        this.onSlotComplete?.(this._currentRow, this._currentCol)
        this.setPhase('NEXT_SLOT')
        break

      case 'NEXT_SLOT':
        if (isPalletComplete(p)) {
          this.setPhase('COMPLETE')
          this.setRunState('complete')
          this.ctrl.moveJoints(PALLET_HOME_POSE, t.travelDuration)
          this.onPalletComplete?.()
        } else {
          this.setPhase('SELECT_NEXT_SLOT')
        }
        break
    }
  }

  // ── Internal ─────────────────────────────────────────────────

  private setPhase(ph: PalletWorkflowPhase): void {
    this.phase = ph
    this.onPhaseChanged?.(ph)
  }

  private setRunState(s: WorkflowRunState): void {
    this.runState = s
    this.onRunStateChanged?.(s)
  }
}
