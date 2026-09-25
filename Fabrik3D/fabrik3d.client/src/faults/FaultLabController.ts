/**
 * Instructor fault-lab controller (S38).
 *
 * Owns the active overlay set, applies it deterministically, records raise/clear
 * events in the timeline with correlation ids, and enforces the authority
 * boundary: injection is refused when the affected equipment is under external
 * authority, and no code path here can write to a connector.
 *
 * The controller is pure with respect to the canonical signal definitions: it
 * only reads them and produces overlay applications. Removing an overlay restores
 * the exact pre-fault value/quality because the registry sample is never mutated.
 */

import type { SignalQuality, SignalValue } from '../signals/types'
import { TimelineRecorder, type TimelineContext } from '../timeline/TimelineRecorder'
import { getOverlayFaultDefinition } from './overlayCatalog'
import {
  applyOverlays,
  equipmentOverlayActive,
  slowResponseFactor,
  type OverlayEvaluationContext,
} from './overlays'
import type {
  FaultOverlay,
  FaultSource,
  OverlayApplication,
  OverlayDiagnostic,
  OverlayFaultType,
} from './types'

export interface ActivateOverlayRequest {
  type: OverlayFaultType
  equipmentId: string
  signalIds?: string[]
  source?: FaultSource
  seed?: number
  magnitude?: number
  periodMs?: number
  delayMs?: number
}

export interface OverlayActivationResult {
  accepted: boolean
  overlay: FaultOverlay | null
  diagnostics: OverlayDiagnostic[]
}

export interface FaultLabAuthority {
  /** True when the simulator may drive the given equipment (local simulation). */
  canInject(equipmentId: string): boolean
  /** Human-readable reason when injection is blocked. */
  blockedReason(equipmentId: string): string
}

/** Default authority: local simulation always allowed (no external controller). */
export const LOCAL_SIMULATION_AUTHORITY: FaultLabAuthority = {
  canInject: () => true,
  blockedReason: () => '',
}

export class FaultLabController {
  private sequence = 0
  private readonly overlays = new Map<string, FaultOverlay>()
  private readonly latchedValues = new Map<string, SignalValue>()
  private readonly delayBuffers = new Map<string, Array<{ at: number; value: SignalValue; quality: SignalQuality }>>()
  private tick = 0

  constructor(
    private readonly timeline: TimelineRecorder,
    private readonly authority: FaultLabAuthority = LOCAL_SIMULATION_AUTHORITY,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly nowMs: () => number = () => Date.now(),
  ) {}

  get activeOverlays(): readonly FaultOverlay[] {
    return [...this.overlays.values()]
  }

  getOverlay(id: string): FaultOverlay | undefined {
    return this.overlays.get(id)
  }

  /** Activates an overlay. Refused (with a diagnostic) when authority is external. */
  activate(request: ActivateOverlayRequest, context: TimelineContext): OverlayActivationResult {
    const definition = getOverlayFaultDefinition(request.type)
    const diagnostics: OverlayDiagnostic[] = []

    if (!this.authority.canInject(request.equipmentId)) {
      const reason = this.authority.blockedReason(request.equipmentId)
      diagnostics.push({
        severity: 'error',
        code: 'injection-blocked-by-authority',
        message: reason || `Injection is blocked for '${request.equipmentId}' while an external authority is active.`,
      })
      this.timeline.record('fault-action', 'warning', { ...context, equipmentId: request.equipmentId }, {
        action: 'inject-blocked', type: request.type, simulated: true, reason: diagnostics[0]!.message,
      })
      return { accepted: false, overlay: null, diagnostics }
    }

    const signalIds = [...(request.signalIds ?? [])]
    if (definition.layer === 'signal' && signalIds.length === 0) {
      diagnostics.push({
        severity: 'error',
        code: 'missing-target-signal',
        message: `Signal fault '${request.type}' requires at least one target signal.`,
      })
      return { accepted: false, overlay: null, diagnostics }
    }

    const overlay: FaultOverlay = {
      id: `overlay-${++this.sequence}`,
      type: request.type,
      layer: definition.layer,
      severity: definition.severity,
      source: request.source ?? 'instructor',
      equipmentId: request.equipmentId,
      signalIds,
      seed: request.seed ?? 1,
      startedAt: this.now(),
      magnitude: request.magnitude,
      periodMs: request.periodMs,
      delayMs: request.delayMs,
      sessionId: context.sessionId,
      correlationId: context.correlationId,
    }
    this.overlays.set(overlay.id, overlay)
    this.timeline.record('alarm', definition.severity, { ...context, equipmentId: request.equipmentId }, {
      faultId: overlay.id, type: overlay.type, layer: overlay.layer, source: overlay.source,
      signalIds, seed: overlay.seed, simulated: true,
    })
    return { accepted: true, overlay, diagnostics }
  }

  /**
   * Deactivates an overlay. Unknown or already-cleared ids are a no-op with a
   * diagnostic, never an exception.
   */
  deactivate(id: string, context: TimelineContext): OverlayDiagnostic[] {
    const overlay = this.overlays.get(id)
    if (!overlay) {
      return [{ severity: 'warning', code: 'unknown-overlay', message: `Overlay '${id}' is not active; nothing to clear.`, overlayId: id }]
    }
    overlay.endedAt = this.now()
    this.overlays.delete(id)
    this.latchedValues.delete(id)
    this.delayBuffers.delete(id)
    this.timeline.record('fault-action', 'info', { ...context, equipmentId: overlay.equipmentId }, {
      faultId: id, action: 'clear', type: overlay.type, simulated: true,
    })
    return []
  }

  /** Clears every active overlay (used by scenario reset). */
  clearAll(context: TimelineContext): void {
    for (const id of [...this.overlays.keys()]) this.deactivate(id, context)
  }

  /** True when an equipment-layer overlay targets the equipment. */
  isEquipmentFaulted(equipmentId: string, type?: OverlayFaultType): boolean {
    return equipmentOverlayActive(this.activeOverlays, equipmentId, type)
  }

  /** Documented motion-duration multiplier for the slow-response class. */
  motionFactor(equipmentId: string): number {
    return slowResponseFactor(this.activeOverlays, equipmentId)
  }

  /**
   * True when an active signal overlay owns this signal. The signal binding
   * then refuses an external command before it reaches the runtime, so a fault
   * overlay can never become an arbitrary write path into live machinery.
   */
  blocksCommand(signalId: string): boolean {
    return this.activeOverlays.some((overlay) => overlay.layer === 'signal' && overlay.signalIds.includes(signalId))
  }

  /**
   * Applies the overlay chain to a signal sample. The canonical definition is
   * never touched; the caller keeps the pristine sample in the registry.
   */
  apply(signalId: string, value: SignalValue, quality: SignalQuality, safeValue: SignalValue, numeric: boolean): OverlayApplication {
    const context: OverlayEvaluationContext = {
      signalId,
      tick: this.tick,
      nowMs: this.nowMs(),
      safeValue,
      numeric,
    }
    const delayed = this.applyDelay(signalId, value, quality, context)
    return applyOverlays(this.activeOverlays, delayed.value, delayed.quality, context, this.latchedValues)
  }

  /** Advances the deterministic tick used by seeded patterns. */
  advanceTick(): void {
    this.tick += 1
  }

  get currentTick(): number {
    return this.tick
  }

  /**
   * Delay buffer for the `delayed` class. When no delay overlay targets the
   * signal the value passes through unchanged.
   */
  private applyDelay(signalId: string, value: SignalValue, quality: SignalQuality, context: OverlayEvaluationContext): { value: SignalValue; quality: SignalQuality } {
    const delayOverlay = this.activeOverlays.find((overlay) => overlay.type === 'delayed' && overlay.signalIds.includes(signalId))
    if (!delayOverlay) return { value, quality }
    const delayMs = delayOverlay.delayMs ?? 500
    const buffer = this.delayBuffers.get(signalId) ?? []
    buffer.push({ at: context.nowMs, value, quality })
    const cutoff = context.nowMs - delayMs
    while (buffer.length > 1 && buffer[0]!.at < cutoff) buffer.shift()
    this.delayBuffers.set(signalId, buffer)
    const oldest = buffer[0]!
    return { value: oldest.value, quality: oldest.quality }
  }
}
