import type { LocalizedText } from '../scenarios/types'

export const FAULT_TYPES = [
  'collision-risk', 'unreachable-target', 'cnc-fault', 'conveyor-blockage',
  'missing-pallet', 'stale-heartbeat', 'communication-loss',
] as const

export type FaultType = (typeof FAULT_TYPES)[number]
export type FaultSeverity = 'warning' | 'error' | 'critical'
export type FaultSource = 'scenario' | 'instructor'

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
