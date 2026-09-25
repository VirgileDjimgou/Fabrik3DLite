import type { TimeTravelMode } from './types'

/**
 * Read-only enforcement for replay (S41).
 *
 * The isolation gate is a hard, code-level barrier, not a UI convention. While
 * replay is active, `guardProtocolWrite` and `guardAuthorityAcquire` return a
 * blocked result *before* the wrapped function runs, so an OPC UA, MQTT or
 * Modbus write and a control-authority acquisition are impossible by
 * construction. Every blocked attempt is recorded for diagnostics.
 */

export const REPLAY_READ_ONLY_CODE = 'authority_replay_read_only' as const

export type ReplayProtocol = 'opcua' | 'mqtt' | 'modbus'

export interface ReplayIsolationAttempt {
  operation: string
  protocol: ReplayProtocol | null
  target: string | null
  code: string
  timestamp: string
}

export interface GuardedCall<T> {
  blocked: boolean
  code: string | null
  value: T | null
}

export class ReplayIsolationGate {
  private replayActive = false
  private readonly attemptList: ReplayIsolationAttempt[] = []

  constructor(private readonly clock: () => string = () => new Date().toISOString()) {}

  get isActive(): boolean {
    return this.replayActive
  }

  enterReplay(): void {
    this.replayActive = true
  }

  exitReplay(): void {
    this.replayActive = false
  }

  /** Runs `operation` only when replay is inactive; otherwise blocks and records the attempt. */
  guard<T>(operation: string, run: () => T, meta: { protocol?: ReplayProtocol; target?: string } = {}): GuardedCall<T> {
    if (!this.replayActive) return { blocked: false, code: null, value: run() }
    this.recordBlocked(operation, meta.protocol ?? null, meta.target ?? null)
    return { blocked: true, code: REPLAY_READ_ONLY_CODE, value: null }
  }

  guardProtocolWrite<T>(protocol: ReplayProtocol, target: string, write: () => T): GuardedCall<T> {
    return this.guard(`write:${protocol}`, write, { protocol, target })
  }

  guardAuthorityAcquire<T>(scope: string, acquire: () => T): GuardedCall<T> {
    return this.guard('authority:acquire', acquire, { target: scope })
  }

  get attempts(): readonly ReplayIsolationAttempt[] {
    return [...this.attemptList]
  }

  get blockedCount(): number {
    return this.attemptList.length
  }

  reset(): void {
    this.attemptList.length = 0
    this.replayActive = false
  }

  private recordBlocked(operation: string, protocol: ReplayProtocol | null, target: string | null): void {
    this.attemptList.push({ operation, protocol, target, code: REPLAY_READ_ONLY_CODE, timestamp: this.clock() })
  }
}

/** The three connector write doors the simulator could ever call, wrapped by the gate. */
export interface ProtocolWriteRequest {
  protocol: ReplayProtocol
  target: string
  payload: unknown
}

export type ProtocolWriteFn = (request: ProtocolWriteRequest) => Promise<boolean>

/**
 * A guarded connector writer. Callers hold only this object, so while replay is
 * active every protocol write is refused before reaching the underlying writer.
 */
export class GuardedProtocolWriter {
  constructor(
    private readonly gate: ReplayIsolationGate,
    private readonly writer: ProtocolWriteFn,
  ) {}

  async write(request: ProtocolWriteRequest): Promise<boolean> {
    const result = this.gate.guardProtocolWrite(request.protocol, request.target, () => this.writer(request))
    if (result.blocked) return false
    return (await result.value) ?? false
  }
}

/**
 * Explicit operation mode (LIVE / SIMULATION / REPLAY) with the replay read-only
 * gate wired to it. Entering replay always activates the gate; exiting always
 * deactivates it and restores the previous non-replay mode.
 */
export class TimeTravelModeGate {
  private currentMode: TimeTravelMode
  private modeBeforeReplay: Exclude<TimeTravelMode, 'replay'>

  constructor(
    private readonly isolation: ReplayIsolationGate,
    initialMode: Exclude<TimeTravelMode, 'replay'> = 'simulation',
  ) {
    this.currentMode = initialMode
    this.modeBeforeReplay = initialMode
  }

  get mode(): TimeTravelMode {
    return this.currentMode
  }

  get isReplay(): boolean {
    return this.currentMode === 'replay'
  }

  /** Enters replay and hard-activates the read-only gate. */
  enterReplay(): void {
    if (this.currentMode !== 'replay') this.modeBeforeReplay = this.currentMode
    this.currentMode = 'replay'
    this.isolation.enterReplay()
  }

  /** Exits replay, releasing the gate and restoring the previous live/simulation mode. */
  exitReplay(restoredMode?: Exclude<TimeTravelMode, 'replay'>): Exclude<TimeTravelMode, 'replay'> {
    const restored = restoredMode ?? this.modeBeforeReplay
    this.isolation.exitReplay()
    this.currentMode = restored
    return restored
  }

  setMode(mode: Exclude<TimeTravelMode, 'replay'>): void {
    if (this.currentMode === 'replay') {
      this.exitReplay(mode)
      return
    }
    this.currentMode = mode
  }
}
