import type { LocalizedText } from '../scenarios/types'

/**
 * Scenario-level instructional faults (S13). These pause the workflow and ask
 * for an explicit acknowledge/reset/retry recovery journey.
 */
export const FAULT_TYPES = [
  'collision-risk', 'unreachable-target', 'cnc-fault', 'conveyor-blockage',
  'missing-pallet', 'stale-heartbeat', 'communication-loss',
] as const

export type FaultType = (typeof FAULT_TYPES)[number]

/**
 * Signal-level fault classes (S38). Each one is an explicit overlay applied at
 * the signal layer; it never mutates the stored canonical signal definition.
 */
export const SIGNAL_FAULT_TYPES = [
  'forced-true', 'forced-false', 'frozen-value', 'disconnected', 'degraded-quality',
  'intermittent', 'delayed', 'noisy-analog', 'drift', 'inverted',
] as const

export type SignalFaultType = (typeof SIGNAL_FAULT_TYPES)[number]

/**
 * Equipment-level fault classes (S38). These alter runtime behaviour through the
 * existing equipment interfaces (observer layer) rather than rewriting signals.
 */
export const EQUIPMENT_FAULT_TYPES = [
  'actuator-jam', 'actuator-slow-response', 'motor-overload', 'vacuum-loss',
  'sensor-contamination', 'communications-loss',
] as const

export type EquipmentFaultType = (typeof EQUIPMENT_FAULT_TYPES)[number]

/** Every fault class the S38 overlay engine understands. */
export const OVERLAY_FAULT_TYPES = [...SIGNAL_FAULT_TYPES, ...EQUIPMENT_FAULT_TYPES] as const
export type OverlayFaultType = (typeof OVERLAY_FAULT_TYPES)[number]

export type FaultSeverity = 'warning' | 'error' | 'critical'
export type FaultSource = 'scenario' | 'instructor'

/** Where an overlay is applied: the signal value/quality or the equipment observer. */
export type FaultLayer = 'signal' | 'equipment'

export interface FaultDefinition {
  type: FaultType
  severity: FaultSeverity
  equipmentId: string
  title: LocalizedText
  recoveryInstructions: LocalizedText
  /** Acknowledge before either retry or reset can be requested. */
  requiresAcknowledgement: boolean
  /** A physical/logical reset is required before retry is permitted. */
  requiresReset: boolean
  pauseWorkflow: boolean
}

export interface ActiveFault extends FaultDefinition {
  id: string
  source: FaultSource
  sessionId: string
  correlationId: string
  raisedAt: string
  acknowledgedAt?: string
  resetAt?: string
}

export type FaultAction = 'acknowledge' | 'reset' | 'retry'

/**
 * Documentation entry for an S38 overlay fault class. It describes the layer,
 * the deterministic transform, the default severity and the recovery guidance.
 */
export interface OverlayFaultDefinition {
  type: OverlayFaultType
  layer: FaultLayer
  severity: FaultSeverity
  title: LocalizedText
  description: LocalizedText
  recoveryInstructions: LocalizedText
  /** True when the transform consumes a deterministic seeded pattern. */
  stochastic: boolean
  /** True when the fault is only meaningful for numeric signals. */
  numericOnly: boolean
}

/**
 * An explicit, inspectable, removable overlay. It is separate from the canonical
 * signal definition and carries its own activation window and seed.
 */
export interface FaultOverlay {
  id: string
  type: OverlayFaultType
  layer: FaultLayer
  severity: FaultSeverity
  source: FaultSource
  /** Equipment the overlay targets; used for authority gating and diagnostics. */
  equipmentId: string
  /** Signal ids the overlay affects. Empty for pure equipment/observer faults. */
  signalIds: string[]
  /** Deterministic seed for stochastic patterns (noise/intermittent/drift). */
  seed: number
  /** ISO timestamp when the overlay was activated. */
  startedAt: string
  /** ISO timestamp when the overlay was deactivated, when known. */
  endedAt?: string
  /** Optional magnitude/parameter for the transform (documented per class). */
  magnitude?: number
  /** Optional period in milliseconds for intermittent/delayed patterns. */
  periodMs?: number
  /** Optional delay in milliseconds for the delayed class. */
  delayMs?: number
  sessionId: string
  correlationId: string
}

export interface OverlayDiagnostic {
  severity: 'warning' | 'error'
  code: string
  message: string
  overlayId?: string
  signalId?: string
}

/** Result of applying the overlay chain to one signal sample. */
export interface OverlayApplication {
  value: boolean | number | string
  quality: import('../signals/types').SignalQuality
  /** True when at least one overlay changed the value or quality. */
  modified: boolean
  /** Overlay ids that contributed, in application order. */
  appliedOverlayIds: string[]
  diagnostics: OverlayDiagnostic[]
}
