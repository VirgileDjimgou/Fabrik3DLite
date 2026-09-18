import type { PalletWorkflowPhase } from '../simulation/PalletMachiningWorkflow'

export interface LearningCheckpoint {
  id: PalletWorkflowPhase
  command: string
  explanation: string
  expectedResult: string
}

export const CHECKPOINTS: Partial<Record<PalletWorkflowPhase, LearningCheckpoint>> = {
  SELECT_NEXT_SLOT: { id: 'SELECT_NEXT_SLOT', command: 'Select pallet slot', explanation: 'The controller selects the next raw cavity in row-major order.', expectedResult: 'A raw pallet slot becomes active.' },
  MOVE_ABOVE_PALLET_SLOT: { id: 'MOVE_ABOVE_PALLET_SLOT', command: 'Approach pallet', explanation: 'The robot moves to a safe clearance above the active work-object target.', expectedResult: 'Tool is above the selected slot.' },
  DESCEND_TO_PICK: { id: 'DESCEND_TO_PICK', command: 'Pick part', explanation: 'The robot descends to the part while the safety engine validates the swept path.', expectedResult: 'The part can be gripped safely.' },
  MOVE_TO_CNC_APPROACH: { id: 'MOVE_TO_CNC_APPROACH', command: 'Move to CNC', explanation: 'The robot retracts through its safe home posture before approaching the CNC.', expectedResult: 'Tool is clear of the machine door.' },
  MOVE_TO_CNC_INSERT: { id: 'MOVE_TO_CNC_INSERT', command: 'Insert into CNC', explanation: 'The target is the CNC work object, reached only after the door command.', expectedResult: 'Part is ready to load.' },
  MACHINING: { id: 'MACHINING', command: 'Machine part', explanation: 'The CNC performs its timed process while the robot remains in its safe pose.', expectedResult: 'A processed part is available for retrieval.' },
  MOVE_ABOVE_ORIGIN_SLOT: { id: 'MOVE_ABOVE_ORIGIN_SLOT', command: 'Return to pallet', explanation: 'The robot returns to the original work-object slot, preserving traceability.', expectedResult: 'Tool is above the original slot.' },
  PLACE_PART_BACK: { id: 'PLACE_PART_BACK', command: 'Place machined part', explanation: 'The processed part is returned to its original cavity.', expectedResult: 'Slot becomes machined.' },
}

/** Logical-step guard independent from animation frames and transport reconnects. */
export class StepModeController {
  private enabled = false
  private active: LearningCheckpoint | null = null
  private consumedCheckpointId: string | null = null
  private history: LearningCheckpoint[] = []

  get isEnabled(): boolean { return this.enabled }
  get current(): LearningCheckpoint | null { return this.active }
  get previous(): LearningCheckpoint | null { return this.history.length > 1 ? this.history[this.history.length - 2]! : null }

  enable(): void { this.enabled = true; this.consumedCheckpointId = null }
  disable(): void { this.enabled = false; this.active = null; this.consumedCheckpointId = null }
  restart(): void { this.active = null; this.consumedCheckpointId = null; this.history = [] }

  /** Returns true only once when a meaningful new checkpoint is reached. */
  observe(phase: PalletWorkflowPhase): boolean {
    if (!this.enabled) return false
    const checkpoint = CHECKPOINTS[phase]
    if (!checkpoint || this.active?.id === checkpoint.id) return false
    this.active = checkpoint
    this.history.push(checkpoint)
    this.consumedCheckpointId = null
    return true
  }

  /** Claims the current checkpoint once. Repeated commands are safely ignored. */
  next(): boolean {
    if (!this.enabled || !this.active || this.consumedCheckpointId === this.active.id) return false
    this.consumedCheckpointId = this.active.id
    return true
  }
}
