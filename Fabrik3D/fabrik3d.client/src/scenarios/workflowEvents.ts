/**
 * Adapter that turns the pallet machining workflow's callbacks into
 * scenario events without changing workflow behavior.
 */

import type { PalletMachiningWorkflow } from '../simulation/PalletMachiningWorkflow'
import type { ScenarioEvent } from './types'

export const WORKFLOW_PHASE_EVENT = 'workflow.phase'
export const WORKFLOW_RUN_STATE_EVENT = 'workflow.runState'
export const WORKFLOW_SLOT_COMPLETE_EVENT = 'workflow.slotComplete'
export const WORKFLOW_PALLET_COMPLETE_EVENT = 'workflow.palletComplete'

/**
 * Chains scenario event emission onto the workflow callbacks. The original
 * callbacks still fire, so outcomes are unchanged.
 */
export function bindWorkflowEvents(wf: PalletMachiningWorkflow, emit: (event: ScenarioEvent) => void): void {
  const origPhase = wf.onPhaseChanged
  wf.onPhaseChanged = (phase) => {
    origPhase?.(phase)
    emit({ type: WORKFLOW_PHASE_EVENT, phase })
  }
  const origRun = wf.onRunStateChanged
  wf.onRunStateChanged = (state) => {
    origRun?.(state)
    emit({ type: WORKFLOW_RUN_STATE_EVENT, state })
  }
  const origSlot = wf.onSlotComplete
  wf.onSlotComplete = (row, col) => {
    origSlot?.(row, col)
    emit({ type: WORKFLOW_SLOT_COMPLETE_EVENT, row, col })
  }
  const origPallet = wf.onPalletComplete
  wf.onPalletComplete = () => {
    origPallet?.()
    emit({ type: WORKFLOW_PALLET_COMPLETE_EVENT })
  }
}