/**
 * S59 pure scenario cell visual state.
 *
 * A `CellVisualState` is a deterministic, render-agnostic description of what an
 * existing scenario cell should visibly show. It is derived from the same
 * authoritative scenario events the `ScenarioRunner` consumes, so the visible
 * state can never diverge from scenario truth without failing a test. It carries
 * no Three.js objects: `ScenarioCellAnimator` is the only place that touches the
 * scene graph, and it never feeds anything back into scenario state.
 *
 * Fault, jam/recovery and safety conditions are explicit fields derived from the
 * scenario's declared fault injections and its expected-event sequence. They are
 * visible states, not new scenario truth.
 */

import { SCENARIO_CATALOG } from './catalog'
import { cellKindForScenario, type ScenarioCellKind } from './cellComposition'
import type { ScenarioEvent, ScenarioProgress, ScenarioStatus } from './types'

export type { ScenarioCellKind } from './cellComposition'

export const CELL_VISUAL_STATE_SCHEMA_VERSION = '1.0' as const

export type CellLifecycle = 'idle' | 'running' | 'completed' | 'failed'

export type PartStage = 'idle' | 'infeed' | 'inspect' | 'diverted' | 'jammed' | 'recovered'
export type StackLight = 'green' | 'amber' | 'red'

export interface CellVisualState {
  schemaVersion: typeof CELL_VISUAL_STATE_SCHEMA_VERSION
  scenarioId: string
  kind: ScenarioCellKind
  lifecycle: CellLifecycle
  /** 0..1 normalised progress of the deterministic scenario program. */
  programProgress: number

  // Vision sorting
  partStage: PartStage
  inspectionActive: boolean
  classification: 'accepted' | 'rejected' | null
  diverterExtended: boolean
  jam: boolean
  acceptedParts: number
  rejectedParts: number

  // Robot palletizing
  gripperHolding: boolean
  vacuumLoss: boolean
  layerPlaced: number
  palletComplete: boolean

  // Assembly / inspection
  clamped: boolean
  partPresent: boolean
  reworkRequired: boolean

  // Safety training
  gateOpen: boolean
  scannerMuted: boolean
  emergencyStop: boolean
  stackLight: StackLight

  // Common
  fault: boolean
  recovered: boolean
}

function baseState(scenarioId: string, kind: ScenarioCellKind): CellVisualState {
  return {
    schemaVersion: CELL_VISUAL_STATE_SCHEMA_VERSION,
    scenarioId,
    kind,
    lifecycle: 'idle',
    programProgress: 0,
    partStage: 'idle',
    inspectionActive: false,
    classification: null,
    diverterExtended: false,
    jam: false,
    acceptedParts: 0,
    rejectedParts: 0,
    gripperHolding: false,
    vacuumLoss: false,
    layerPlaced: 0,
    palletComplete: false,
    clamped: false,
    partPresent: false,
    reworkRequired: false,
    gateOpen: false,
    scannerMuted: false,
    emergencyStop: false,
    stackLight: 'green',
    fault: false,
    recovered: false,
  }
}

/**
 * Idle visible state for a scenario. Faulted scenarios start from their declared
 * fault-injection visible condition (conveyor blockage, vacuum loss or an unsafe
 * safety-training cell) so the abnormal situation is visible before recovery.
 */
export function createCellVisualState(scenarioId: string): CellVisualState {
  const kind = cellKindForScenario(scenarioId)
  const state = baseState(scenarioId, kind)
  const faults = new Set(SCENARIO_CATALOG.find(scenario => scenario.id === scenarioId)?.faultInjections ?? [])

  if (kind === 'vision-sorting') {
    state.partStage = 'idle'
    if (faults.has('conveyor-blockage')) {
      state.jam = true
      state.fault = true
      state.partStage = 'jammed'
      state.stackLight = 'red'
    } else {
      state.stackLight = 'green'
    }
  } else if (kind === 'robot-palletizing') {
    state.stackLight = 'green'
    if (scenarioId === 'palletizing-vacuum-recovery' || faults.has('communication-loss')) {
      state.vacuumLoss = true
      state.fault = true
      state.stackLight = 'amber'
    }
  } else if (kind === 'assembly-inspection') {
    state.partPresent = true
    state.stackLight = 'green'
  } else if (kind === 'robot-safety-training') {
    // The exercise starts from an unsafe, access-open condition the operator must recover.
    state.gateOpen = true
    state.scannerMuted = true
    state.emergencyStop = true
    state.stackLight = 'red'
    state.fault = true
    state.partStage = 'idle'
  } else {
    state.stackLight = 'green'
  }
  return state
}

/**
 * Reduces one authoritative scenario event into a new visible state. Unknown
 * events are ignored so the visual layer stays decoupled from future scenarios.
 */
export function reduceCellVisualState(state: CellVisualState, event: ScenarioEvent): CellVisualState {
  const next: CellVisualState = { ...state }
  switch (event.type) {
    case 'scenario.ready':
      next.lifecycle = 'running'
      if (next.kind === 'vision-sorting' && !next.jam) next.partStage = 'infeed'
      return next

    case 'sorting.complete':
      next.partStage = 'diverted'
      next.inspectionActive = true
      next.classification = 'accepted'
      next.acceptedParts = Math.max(1, next.acceptedParts)
      next.diverterExtended = false
      next.jam = false
      next.fault = false
      next.stackLight = 'green'
      return next

    case 'sorting.recovered':
      // The jammed part is cleared through the reject lane and the cell is recovered.
      next.partStage = 'recovered'
      next.classification = 'rejected'
      next.diverterExtended = true
      next.jam = false
      next.fault = false
      next.rejectedParts = Math.max(1, next.rejectedParts)
      next.recovered = true
      next.stackLight = 'green'
      return next

    case 'palletizing.complete':
      next.gripperHolding = false
      next.layerPlaced = Math.max(1, next.layerPlaced)
      next.palletComplete = true
      next.vacuumLoss = false
      next.stackLight = 'green'
      return next

    case 'palletizing.recovered':
      next.vacuumLoss = false
      next.gripperHolding = false
      next.fault = false
      next.recovered = true
      next.stackLight = 'green'
      return next

    case 'assembly.complete':
      next.partPresent = true
      next.clamped = false
      next.reworkRequired = false
      next.recovered = true
      next.stackLight = 'green'
      return next

    case 'safety.restarted':
      next.gateOpen = false
      next.scannerMuted = false
      next.emergencyStop = false
      next.fault = false
      next.recovered = true
      next.stackLight = 'green'
      return next

    case 'scenario.recovered':
      next.lifecycle = 'completed'
      next.inspectionActive = false
      next.recovered = true
      return next

    default:
      return next
  }
}

function lifecycleFromStatus(status: ScenarioStatus): CellLifecycle {
  return status
}

/** Applies authoritative runner progress to the lifecycle and program progress. */
export function applyScenarioProgress(state: CellVisualState, progress: ScenarioProgress): CellVisualState {
  return {
    ...state,
    lifecycle: lifecycleFromStatus(progress.status),
    programProgress: Math.max(0, Math.min(1, progress.progressPercent / 100)),
  }
}

/** True when a fault/jam/safety condition should be visibly signalled. */
export function hasVisibleFault(state: CellVisualState): boolean {
  return state.fault || state.jam || state.vacuumLoss || state.emergencyStop
}

/** True when the state represents a completed scenario with recovery. */
export function isRecovered(state: CellVisualState): boolean {
  return state.recovered && state.lifecycle === 'completed'
}
