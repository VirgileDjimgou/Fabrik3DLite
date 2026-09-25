/**
 * Deterministic CNC machining-cycle state machine for the reference cell (S39).
 *
 * The machine is framework-free and time-driven by the caller (`update(dt)`), so
 * its phases, interlocks and timings are unit-testable without Three.js or Vue.
 * `LargeCNCMachine.vue` renders the state; the signal binding derives read-only
 * I/O from it. The renderer is never the source of truth.
 *
 * Interlocks (simulated teaching behaviour, not a certified safety function):
 * - the spindle cannot be at speed while the door is open;
 * - the door cannot close once clamping has started;
 * - a cycle can only start from `LOAD_READY` (door fully open, part loaded);
 * - an emergency stop or latched fault refuses every command and freezes the cycle.
 */

/** Nominal simulated spindle speed while cutting (rpm). */
export const SPINDLE_NOMINAL_RPM = 8_000
/** Nominal simulated feed while cutting (mm/min). */
export const FEED_NOMINAL_MM_PER_MIN = 250

/** Coarse machine state kept compatible with the pre-S39 workflow contract. */
export type CncCoarseState = 'IDLE' | 'LOADING' | 'MACHINING' | 'UNLOADING'

/** Fine-grained cycle phases used for visuals, signals and diagnostics. */
export type CncCyclePhase =
  | 'IDLE'
  | 'LOAD_OPENING'
  | 'LOAD_READY'
  | 'LOAD_CLOSING'
  | 'DOOR_CLOSING'
  | 'CLAMPING'
  | 'SPINDLE_RAMP_UP'
  | 'FEED'
  | 'SPINDLE_RAMP_DOWN'
  | 'UNCLAMPING'
  | 'CYCLE_COMPLETE'
  | 'UNLOAD_OPENING'
  | 'UNLOAD_READY'

export interface CncCycleTimings {
  /** Seconds for the loading door to travel fully open or closed. */
  doorTravelSeconds: number
  /** Fixture clamp engagement time. */
  clampSeconds: number
  /** Spindle spin-up ramp. */
  spindleRampUpSeconds: number
  /** Actual cutting feed time. */
  feedSeconds: number
  /** Spindle spin-down ramp. */
  spindleRampDownSeconds: number
  /** Fixture release time. */
  unclampSeconds: number
}

export const DEFAULT_CNC_CYCLE_TIMINGS: CncCycleTimings = {
  doorTravelSeconds: 0.8,
  clampSeconds: 0.5,
  spindleRampUpSeconds: 1.0,
  feedSeconds: 1.7,
  spindleRampDownSeconds: 0.6,
  unclampSeconds: 0.4,
}

/** Phases where the spindle may be turning. */
const SPINDLE_PHASES = new Set<CncCyclePhase>(['SPINDLE_RAMP_UP', 'FEED', 'SPINDLE_RAMP_DOWN'])
/** Phases where the fixture is (or is becoming) clamped. */
const CLAMP_PHASES = new Set<CncCyclePhase>([
  'CLAMPING', 'SPINDLE_RAMP_UP', 'FEED', 'SPINDLE_RAMP_DOWN', 'UNCLAMPING',
])
/** Phases that map to the coarse `MACHINING` state. */
const MACHINING_PHASES = new Set<CncCyclePhase>([
  'DOOR_CLOSING', 'CLAMPING', 'SPINDLE_RAMP_UP', 'FEED', 'SPINDLE_RAMP_DOWN', 'UNCLAMPING',
])
/** Phases that map to the coarse `UNLOADING` state. */
const UNLOADING_PHASES = new Set<CncCyclePhase>(['CYCLE_COMPLETE', 'UNLOAD_OPENING', 'UNLOAD_READY'])

/** Stable ordinal for the `cnc-1.CycleStep` signal. Monotonic within one cycle. */
const CYCLE_STEP: Record<CncCyclePhase, number> = {
  IDLE: 0,
  LOAD_OPENING: 1,
  LOAD_READY: 2,
  LOAD_CLOSING: 2,
  DOOR_CLOSING: 3,
  CLAMPING: 4,
  SPINDLE_RAMP_UP: 5,
  FEED: 6,
  SPINDLE_RAMP_DOWN: 7,
  UNCLAMPING: 8,
  CYCLE_COMPLETE: 8,
  UNLOAD_OPENING: 9,
  UNLOAD_READY: 9,
}

/** Total cutting-cycle duration (door close → cycle complete) for the given timings. */
export function totalMachiningSeconds(timings: CncCycleTimings = DEFAULT_CNC_CYCLE_TIMINGS): number {
  return timings.doorTravelSeconds + timings.clampSeconds + timings.spindleRampUpSeconds
    + timings.feedSeconds + timings.spindleRampDownSeconds + timings.unclampSeconds
}

/**
 * Rescales the feed time so the whole machining cycle matches a requested
 * duration, keeping every other phase fixed. Used to honour the component's
 * `machiningDuration` prop without changing workflow transitions.
 */
export function timingsForMachiningDuration(
  durationSeconds: number,
  base: CncCycleTimings = DEFAULT_CNC_CYCLE_TIMINGS,
): CncCycleTimings {
  const fixed = base.doorTravelSeconds + base.clampSeconds + base.spindleRampUpSeconds
    + base.spindleRampDownSeconds + base.unclampSeconds
  const feedSeconds = Math.max(0.1, durationSeconds - fixed)
  return { ...base, feedSeconds }
}

export interface CncCycleSnapshot {
  phase: CncCyclePhase
  coarseState: CncCoarseState
  doorPosition: number
  doorOpen: boolean
  doorClosed: boolean
  doorLocked: boolean
  fixtureClamped: boolean
  partPresent: boolean
  spindleSpeed: number
  spindleAtSpeed: boolean
  feedRate: number
  feedActive: boolean
  coolantOn: boolean
  cycleStep: number
  emergencyStop: boolean
  faulted: boolean
}

export class CncCycleMachine {
  private currentPhase: CncCyclePhase = 'IDLE'
  private phaseElapsed = 0
  private door = 0
  private clamped = false
  private loaded = false
  private stopped = false
  private fault = false
  private readonly timings: CncCycleTimings

  /** Fires on every phase change with the new phase. */
  onPhaseChanged: ((phase: CncCyclePhase) => void) | null = null
  /** Fires once when the cutting cycle completes and unloading begins. */
  onCycleComplete: (() => void) | null = null

  constructor(timings: Partial<CncCycleTimings> = {}) {
    this.timings = { ...DEFAULT_CNC_CYCLE_TIMINGS, ...timings }
  }

  get phase(): CncCyclePhase { return this.currentPhase }
  get timingsSnapshot(): CncCycleTimings { return { ...this.timings } }
  get emergencyStop(): boolean { return this.stopped }
  get faulted(): boolean { return this.fault }
  get doorPosition(): number { return this.door }
  get partPresent(): boolean { return this.loaded }
  get fixtureClamped(): boolean { return this.clamped }

  /** Coarse, backward-compatible machine state used by the pallet workflow. */
  get coarseState(): CncCoarseState {
    if (UNLOADING_PHASES.has(this.currentPhase)) return 'UNLOADING'
    if (MACHINING_PHASES.has(this.currentPhase)) return 'MACHINING'
    if (this.currentPhase === 'IDLE') return 'IDLE'
    return 'LOADING'
  }

  get doorOpen(): boolean { return this.door >= 1 }
  get doorClosed(): boolean { return this.door <= 0 }
  /** Door interlock: locked whenever the door is fully closed and no stop is active. */
  get doorLocked(): boolean { return this.doorClosed && !this.stopped && !this.fault }

  get spindleSpeed(): number {
    const t = this.timings
    if (this.currentPhase === 'SPINDLE_RAMP_UP') {
      return SPINDLE_NOMINAL_RPM * clamp01(this.phaseElapsed / t.spindleRampUpSeconds)
    }
    if (this.currentPhase === 'FEED') return SPINDLE_NOMINAL_RPM
    if (this.currentPhase === 'SPINDLE_RAMP_DOWN') {
      return SPINDLE_NOMINAL_RPM * (1 - clamp01(this.phaseElapsed / t.spindleRampDownSeconds))
    }
    return 0
  }

  get spindleAtSpeed(): boolean {
    return this.currentPhase === 'FEED' && this.spindleSpeed >= SPINDLE_NOMINAL_RPM * 0.98
  }

  get feedRate(): number { return this.currentPhase === 'FEED' ? FEED_NOMINAL_MM_PER_MIN : 0 }
  get feedActive(): boolean { return this.currentPhase === 'FEED' }
  get coolantOn(): boolean { return this.currentPhase === 'FEED' }
  get cycleStep(): number { return CYCLE_STEP[this.currentPhase] }

  snapshot(): CncCycleSnapshot {
    return {
      phase: this.currentPhase,
      coarseState: this.coarseState,
      doorPosition: this.door,
      doorOpen: this.doorOpen,
      doorClosed: this.doorClosed,
      doorLocked: this.doorLocked,
      fixtureClamped: this.clamped,
      partPresent: this.loaded,
      spindleSpeed: round(this.spindleSpeed),
      spindleAtSpeed: this.spindleAtSpeed,
      feedRate: this.feedRate,
      feedActive: this.feedActive,
      coolantOn: this.coolantOn,
      cycleStep: this.cycleStep,
      emergencyStop: this.stopped,
      faulted: this.fault,
    }
  }

  // ── Commands (all return false when the current state forbids them) ──

  /** Opens the loading door and starts a load sequence. Only valid from `IDLE`. */
  loadPart(): boolean {
    if (!this.canAcceptCommands() || this.currentPhase !== 'IDLE') return false
    this.setPhase('LOAD_OPENING')
    return true
  }

  /** Closes the door and starts the clamp → spindle → feed → unclamp cycle. */
  startMachining(): boolean {
    if (!this.canAcceptCommands() || this.currentPhase !== 'LOAD_READY') return false
    this.loaded = true
    this.setPhase('DOOR_CLOSING')
    return true
  }

  /** Finishes unloading and returns to `IDLE`; the interlock keeps other states closed. */
  unloadComplete(): boolean {
    if (!this.canAcceptCommands()) return false
    if (!UNLOADING_PHASES.has(this.currentPhase)) return false
    this.loaded = false
    this.setPhase('IDLE')
    return true
  }

  /** Explicit door command consistent with the pre-S39 component API. */
  commandDoor(open: boolean): boolean {
    if (!this.canAcceptCommands()) return false
    if (open) {
      if (this.currentPhase === 'IDLE') return this.loadPart()
      if (UNLOADING_PHASES.has(this.currentPhase) || this.currentPhase === 'LOAD_OPENING' || this.currentPhase === 'LOAD_READY') return true
      return false
    }
    if (this.currentPhase === 'IDLE') return true
    if (this.currentPhase === 'LOAD_OPENING' || this.currentPhase === 'LOAD_READY') {
      this.setPhase('LOAD_CLOSING')
      return true
    }
    return false
  }

  /** Latches or releases the simulated emergency stop. Release requires `reset()`. */
  setEmergencyStop(active: boolean): void {
    if (this.stopped === active) return
    this.stopped = active
    if (active) {
      this.clamped = false
      this.loaded = false
    }
  }

  /** Latches or clears a simulated machine fault. Clearing returns the machine to `IDLE`. */
  setFault(active: boolean): void {
    if (this.fault === active) return
    this.fault = active
    if (active) {
      this.clamped = false
    } else {
      this.reset()
    }
  }

  /** Returns the machine to a deterministic safe idle state. */
  reset(): void {
    this.stopped = false
    this.fault = false
    this.clamped = false
    this.loaded = false
    this.door = 0
    this.phaseElapsed = 0
    this.setPhase('IDLE')
  }

  // ── Frame update ─────────────────────────────────────────────────

  /** Advances the machine by `dt` seconds. Frozen while stopped or faulted. */
  update(dt: number): void {
    if (!(dt > 0)) return
    if (this.stopped || this.fault) return
    this.moveDoor(dt)
    this.phaseElapsed += dt

    switch (this.currentPhase) {
      case 'IDLE':
      case 'LOAD_READY':
      case 'UNLOAD_READY':
        break
      case 'LOAD_OPENING':
        if (this.doorOpen) this.setPhase('LOAD_READY')
        break
      case 'LOAD_CLOSING':
        if (this.doorClosed) this.setPhase('IDLE')
        break
      case 'DOOR_CLOSING':
        if (this.doorClosed) this.setPhase('CLAMPING')
        break
      case 'CLAMPING':
        if (this.phaseElapsed >= this.timings.clampSeconds) {
          this.clamped = true
          this.setPhase('SPINDLE_RAMP_UP')
        }
        break
      case 'SPINDLE_RAMP_UP':
        if (this.phaseElapsed >= this.timings.spindleRampUpSeconds) this.setPhase('FEED')
        break
      case 'FEED':
        if (this.phaseElapsed >= this.timings.feedSeconds) this.setPhase('SPINDLE_RAMP_DOWN')
        break
      case 'SPINDLE_RAMP_DOWN':
        if (this.phaseElapsed >= this.timings.spindleRampDownSeconds) this.setPhase('UNCLAMPING')
        break
      case 'UNCLAMPING':
        if (this.phaseElapsed >= this.timings.unclampSeconds) {
          this.clamped = false
          this.setPhase('CYCLE_COMPLETE')
          this.onCycleComplete?.()
        }
        break
      case 'CYCLE_COMPLETE':
        this.setPhase('UNLOAD_OPENING')
        break
      case 'UNLOAD_OPENING':
        if (this.doorOpen) this.setPhase('UNLOAD_READY')
        break
    }
  }

  // ── Internal ─────────────────────────────────────────────────────

  private canAcceptCommands(): boolean {
    return !this.stopped && !this.fault
  }

  private moveDoor(dt: number): void {
    const target = this.doorTarget()
    const step = dt / Math.max(0.01, this.timings.doorTravelSeconds)
    if (this.door < target) this.door = Math.min(target, this.door + step)
    else if (this.door > target) this.door = Math.max(target, this.door - step)
  }

  private doorTarget(): number {
    switch (this.currentPhase) {
      case 'LOAD_OPENING':
      case 'LOAD_READY':
      case 'UNLOAD_OPENING':
      case 'UNLOAD_READY':
        return 1
      default:
        return 0
    }
  }

  private setPhase(next: CncCyclePhase): void {
    if (this.currentPhase === next) return
    this.currentPhase = next
    this.phaseElapsed = 0
    this.onPhaseChanged?.(next)
  }
}

function clamp01(value: number): number {
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000
}

/** True when a phase is part of an active machining cycle. */
export function isMachiningPhase(phase: CncCyclePhase): boolean {
  return MACHINING_PHASES.has(phase) || UNLOADING_PHASES.has(phase)
}

/** True when the spindle may be turning in the given phase. */
export function isSpindlePhase(phase: CncCyclePhase): boolean {
  return SPINDLE_PHASES.has(phase)
}

/** True when the fixture is expected to hold a part in the given phase. */
export function isClampPhase(phase: CncCyclePhase): boolean {
  return CLAMP_PHASES.has(phase)
}
