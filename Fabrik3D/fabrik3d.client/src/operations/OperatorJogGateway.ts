import { ManualJogController } from './ManualJogController'
import type { MotionSafetyEngine } from '../safety/motionSafety'

/**
 * Minimal joint workspace contract the gateway needs. It is satisfied by {@link RobotController}
 * without importing Vue or Three.js, so the gateway stays unit-testable.
 */
export interface JoggableRobot {
  readonly jointAngles: number[]
  setJointAngle(axis: number, radians: number): void
}

/** One normalized jog intent delivered from the operator HMI through the server. */
export interface JogIntent {
  action: string
  joint: string
  direction: number
  deadManToken?: string | null
  correlationId?: string
}

export interface JogGatewayOptions {
  /** True while the server says an operator holds command authority for this cell. */
  isAuthorityOwned: () => boolean
  /** True while the local operating mode allows manual jog (manual-training). */
  isModeCompatible: () => boolean
  /** True when the twin is showing a read-only replay; jog must be impossible. */
  isReplay: () => boolean
  now?: () => number
  timeoutMs?: number
}

export interface JogOutcome {
  accepted: boolean
  reason: string | null
}

export const JogReason = {
  Replay: 'authority_replay_read_only',
  Mode: 'mode_not_compatible',
  Authority: 'authority_not_acquired',
  DeadMan: 'dead_man_required',
  Joint: 'invalid_joint',
  Direction: 'invalid_direction',
  Safety: 'motion_blocked',
  Released: 'operator-release',
} as const

function parseJoint(joint: string | undefined): number {
  if (!joint) return -1
  const value = joint.trim().replace(/^j/i, '')
  const number = Number.parseInt(value, 10)
  return Number.isInteger(number) && number >= 1 && number <= 6 ? number - 1 : -1
}

/**
 * Operator jog gateway (S53). It reuses the existing {@link ManualJogController} dead-man/limit/
 * timeout path and the existing {@link MotionSafetyEngine} collision/interlock checks; it adds the
 * mode, authority, replay and dead-man-token gates so a remote HMI jog can never bypass them.
 */
export class OperatorJogGateway {
  private readonly jog: ManualJogController
  private activeToken: string | null = null
  private lastReason: string | null = null

  constructor(
    private readonly robot: JoggableRobot,
    safety: MotionSafetyEngine,
    private readonly options: JogGatewayOptions,
  ) {
    this.jog = new ManualJogController(
      () => this.robot.jointAngles,
      (axis, value) => this.robot.setJointAngle(axis, value),
      safety,
      options.now ?? (() => performance.now()),
      options.timeoutMs ?? 500,
    )
  }

  get isActive(): boolean {
    return this.activeToken !== null
  }

  get reason(): string | null {
    return this.lastReason
  }

  /** Applies one server-authorized intent. Returns whether it was accepted and why. */
  apply(intent: JogIntent): JogOutcome {
    if (intent.action === 'release') {
      this.stop(JogReason.Released)
      return { accepted: true, reason: null }
    }

    if (this.options.isReplay()) return this.reject(JogReason.Replay)
    if (!this.options.isModeCompatible()) return this.reject(JogReason.Mode)
    if (!this.options.isAuthorityOwned()) return this.reject(JogReason.Authority)
    if (!intent.deadManToken) return this.reject(JogReason.DeadMan)

    const axis = parseJoint(intent.joint)
    if (axis < 0) return this.reject(JogReason.Joint)
    if (intent.direction !== 1 && intent.direction !== -1) return this.reject(JogReason.Direction)

    this.activeToken = intent.deadManToken
    this.lastReason = null
    this.jog.press(axis, intent.direction)
    return { accepted: true, reason: null }
  }

  /** Advances an active jog by one step; releases automatically on timeout or blocked motion. */
  tick(stepRadians = 0.02): boolean {
    if (this.activeToken === null) return false
    const moved = this.jog.tick(stepRadians)
    if (!moved) {
      this.activeToken = null
      this.lastReason = JogReason.Safety
    }
    return moved
  }

  /** Stops any active jog and records why. Used on release, disconnect or authority loss. */
  stop(reason: string): void {
    this.jog.release()
    this.activeToken = null
    this.lastReason = reason
  }

  private reject(reason: string): JogOutcome {
    this.jog.release()
    this.activeToken = null
    this.lastReason = reason
    return { accepted: false, reason }
  }
}
