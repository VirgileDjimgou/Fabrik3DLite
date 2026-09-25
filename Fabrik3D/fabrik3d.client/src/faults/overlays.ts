/**
 * Deterministic fault-overlay engine (S38).
 *
 * An overlay is an explicit, inspectable, removable disturbance applied at the
 * signal layer (or the equipment observer layer for physical faults). Overlays
 * never mutate the stored canonical signal definition: the registry keeps the
 * pristine sample and the overlay chain is applied on read/publish.
 *
 * Determinism:
 * - every stochastic class (noise, intermittent, drift) derives its pattern from
 *   a seeded PRNG, so identical seed + inputs reproduce the exact sequence;
 * - the PRNG is a pure function of (seed, signalId, tick index), so evaluation
 *   order and reloads never change the result;
 * - no `Math.random`, no wall-clock dependency inside the transforms.
 *
 * Composition precedence (documented, highest wins):
 *   1. disconnected / communications-loss  (link lost, safe value + bad quality)
 *   2. forced-true / forced-false          (hard override)
 *   3. frozen-value                        (latched value)
 *   4. inverted                            (polarity)
 *   5. delayed                             (time shift)
 *   6. intermittent                        (seeded dropout)
 *   7. noisy-analog                        (seeded additive noise)
 *   8. drift                               (seeded monotonic offset)
 *   9. degraded-quality                    (quality downgrade only)
 * When two overlays of the same class affect one signal, the most recently
 * activated one wins and a warning diagnostic is surfaced.
 */

import type { SignalQuality, SignalValue } from '../signals/types'
import { getOverlayFaultDefinition } from './overlayCatalog'
import type {
  FaultOverlay,
  OverlayApplication,
  OverlayDiagnostic,
  OverlayFaultType,
} from './types'

/** Documented precedence order; lower index wins. */
export const OVERLAY_PRECEDENCE: readonly OverlayFaultType[] = [
  'disconnected',
  'communications-loss',
  'forced-true',
  'forced-false',
  'frozen-value',
  'inverted',
  'delayed',
  'intermittent',
  'noisy-analog',
  'drift',
  'degraded-quality',
  // Equipment/observer-layer classes never transform a signal value; they are
  // listed last so the precedence order stays total over the whole catalog.
  'actuator-jam',
  'actuator-slow-response',
  'motor-overload',
  'vacuum-loss',
  'sensor-contamination',
]

const PRECEDENCE_INDEX = new Map<OverlayFaultType, number>(OVERLAY_PRECEDENCE.map((type, index) => [type, index]))

/** Default magnitudes/periods, documented per class. */
export const OVERLAY_DEFAULTS = {
  noiseMagnitude: 0.05,
  driftMagnitude: 0.01,
  intermittentPeriodMs: 1_000,
  intermittentDutyCycle: 0.5,
  delayMs: 500,
  slowResponseFactor: 2,
} as const

/** Deterministic 32-bit hash of a string (FNV-1a). */
export function hashString(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/**
 * Deterministic PRNG (mulberry32). Pure function of its 32-bit seed; the same
 * seed always yields the same sequence, independent of platform or call order.
 */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Stable per-signal seed so one overlay produces independent patterns per signal. */
export function overlaySignalSeed(overlay: FaultOverlay, signalId: string): number {
  return (hashString(`${overlay.id}:${signalId}`) ^ (overlay.seed >>> 0)) >>> 0
}

/** Deterministic sample of a seeded pattern at a given tick index. */
export function seededSample(seed: number, tick: number): number {
  const random = createSeededRandom((seed + Math.imul(tick, 0x9e3779b1)) >>> 0)
  return random()
}

export interface OverlayEvaluationContext {
  signalId: string
  /** Monotonic tick index used by seeded patterns; must be deterministic. */
  tick: number
  /** Injectable clock in milliseconds for delayed/intermittent windows. */
  nowMs: number
  /** Canonical safe value used by disconnected/intermittent classes. */
  safeValue: SignalValue
  /** True when the signal is numeric (noise/drift only apply to numbers). */
  numeric: boolean
}

interface OverlayOutcome {
  value: SignalValue
  quality: SignalQuality
  modified: boolean
}

function isNumeric(value: SignalValue): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function applyOne(
  overlay: FaultOverlay,
  value: SignalValue,
  quality: SignalQuality,
  context: OverlayEvaluationContext,
): OverlayOutcome {
  const definition = getOverlayFaultDefinition(overlay.type)
  const seed = overlaySignalSeed(overlay, context.signalId)
  switch (overlay.type) {
    case 'disconnected':
    case 'communications-loss':
      return { value: context.safeValue, quality: 'bad', modified: true }
    case 'forced-true':
      return { value: true, quality, modified: true }
    case 'forced-false':
      return { value: false, quality, modified: true }
    case 'frozen-value':
      // The caller latches the first observed value; here we simply keep it.
      return { value, quality, modified: true }
    case 'inverted':
      return typeof value === 'boolean'
        ? { value: !value, quality, modified: true }
        : { value, quality, modified: false }
    case 'delayed':
      // The caller supplies the delayed value through the delay buffer; the
      // transform itself is a pass-through so the buffer owns the shift.
      return { value, quality, modified: true }
    case 'intermittent': {
      const period = overlay.periodMs ?? OVERLAY_DEFAULTS.intermittentPeriodMs
      const phase = ((context.nowMs % period) + period) % period
      const duty = OVERLAY_DEFAULTS.intermittentDutyCycle
      const jitter = seededSample(seed, context.tick) * 0.2 - 0.1
      const dropped = phase / period < duty + jitter
      return dropped
        ? { value: context.safeValue, quality: 'uncertain', modified: true }
        : { value, quality, modified: false }
    }
    case 'noisy-analog': {
      if (!definition.numericOnly || !context.numeric || !isNumeric(value)) {
        return { value, quality, modified: false }
      }
      const magnitude = overlay.magnitude ?? OVERLAY_DEFAULTS.noiseMagnitude
      const noise = (seededSample(seed, context.tick) * 2 - 1) * magnitude
      return { value: value + noise, quality, modified: true }
    }
    case 'drift': {
      if (!definition.numericOnly || !context.numeric || !isNumeric(value)) {
        return { value, quality, modified: false }
      }
      const magnitude = overlay.magnitude ?? OVERLAY_DEFAULTS.driftMagnitude
      const offset = magnitude * context.tick
      return { value: value + offset, quality, modified: true }
    }
    case 'degraded-quality':
      return { value, quality: quality === 'good' ? 'uncertain' : quality, modified: true }
    default:
      return { value, quality, modified: false }
  }
}

/**
 * Applies the overlay chain to one signal sample. Pure: it never mutates the
 * overlay list or the canonical definition. `latchedValues` carries the frozen
 * value per overlay so the caller can persist it across ticks.
 *
 * Precedence: the highest-precedence value/quality transform wins. Lower
 * precedence transforms are skipped (and reported as a warning) so a hard
 * override such as `forced-true` is never undone by a lower-precedence
 * `inverted`. `degraded-quality` is quality-only and always stacks.
 */
export function applyOverlays(
  overlays: readonly FaultOverlay[],
  value: SignalValue,
  quality: SignalQuality,
  context: OverlayEvaluationContext,
  latchedValues: Map<string, SignalValue> = new Map(),
): OverlayApplication {
  const diagnostics: OverlayDiagnostic[] = []
  const relevant = overlays
    .filter((overlay) => overlay.signalIds.includes(context.signalId))
    .sort((left, right) => {
      const byPrecedence = (PRECEDENCE_INDEX.get(left.type) ?? 99) - (PRECEDENCE_INDEX.get(right.type) ?? 99)
      if (byPrecedence !== 0) return byPrecedence
      // Same class: the most recently activated overlay wins.
      return right.startedAt.localeCompare(left.startedAt)
    })

  const seenTypes = new Set<OverlayFaultType>()
  let currentValue = value
  let currentQuality = quality
  let modified = false
  let winnerApplied = false
  const appliedOverlayIds: string[] = []

  for (const overlay of relevant) {
    if (seenTypes.has(overlay.type)) {
      diagnostics.push({
        severity: 'warning',
        code: 'overlay-conflict',
        message: `Multiple '${overlay.type}' overlays affect '${context.signalId}'; the most recent one wins.`,
        overlayId: overlay.id,
        signalId: context.signalId,
      })
      continue
    }
    seenTypes.add(overlay.type)

    // Quality-only class stacks on top of the winning value transform.
    if (overlay.type === 'degraded-quality') {
      const outcome = applyOne(overlay, currentValue, currentQuality, context)
      if (outcome.modified) {
        currentQuality = outcome.quality
        modified = true
        appliedOverlayIds.push(overlay.id)
      }
      continue
    }

    // A value/quality transform already won: lower-precedence ones are skipped.
    if (winnerApplied) {
      diagnostics.push({
        severity: 'warning',
        code: 'overlay-precedence',
        message: `Overlay '${overlay.type}' on '${context.signalId}' is superseded by a higher-precedence overlay.`,
        overlayId: overlay.id,
        signalId: context.signalId,
      })
      continue
    }

    if (overlay.type === 'frozen-value') {
      if (!latchedValues.has(overlay.id)) latchedValues.set(overlay.id, currentValue)
      currentValue = latchedValues.get(overlay.id)!
      modified = true
      winnerApplied = true
      appliedOverlayIds.push(overlay.id)
      continue
    }

    const outcome = applyOne(overlay, currentValue, currentQuality, context)
    if (outcome.modified) {
      currentValue = outcome.value
      currentQuality = outcome.quality
      modified = true
      winnerApplied = true
      appliedOverlayIds.push(overlay.id)
    }
  }

  return { value: currentValue, quality: currentQuality, modified, appliedOverlayIds, diagnostics }
}

/** True when any active overlay targets the given equipment at the observer layer. */
export function equipmentOverlayActive(overlays: readonly FaultOverlay[], equipmentId: string, type?: OverlayFaultType): boolean {
  return overlays.some((overlay) => overlay.layer === 'equipment' && overlay.equipmentId === equipmentId && (!type || overlay.type === type))
}

/** Documented slow-response factor for the actuator-slow-response class. */
export function slowResponseFactor(overlays: readonly FaultOverlay[], equipmentId: string): number {
  const active = overlays.some((overlay) => overlay.type === 'actuator-slow-response' && overlay.equipmentId === equipmentId)
  return active ? OVERLAY_DEFAULTS.slowResponseFactor : 1
}
