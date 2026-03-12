import { type RobotController } from './RobotController'

export type PickPlacePhase =
  | 'idle'
  | 'move-above-pick'
  | 'move-down-pick'
  | 'close-gripper'
  | 'move-up-pick'
  | 'move-above-place'
  | 'move-down-place'
  | 'open-gripper'
  | 'move-up-place'
  | 'done'

export interface PickPlaceConfig {
  abovePickAngles: number[]
  pickAngles: number[]
  abovePlaceAngles: number[]
  placeAngles: number[]
  moveDuration?: number
  gripDuration?: number
}

const DEFAULT_MOVE_DURATION = 1.0
const DEFAULT_GRIP_DURATION = 0.3

/**
 * Orchestrates a pick-and-place cycle on a RobotController.
 *
 * Usage:
 * ```ts
 * const planner = new PickPlacePlanner(controller, config)
 * planner.start()
 * // in animation loop:
 * planner.update()
 * ```
 */
export class PickPlacePlanner {
  phase: PickPlacePhase = 'idle'
  gripperClosed = false

  private readonly controller: RobotController
  private readonly config: Required<PickPlaceConfig>
  private waitUntil = 0

  /** Callback when the gripper state changes. */
  onGripperChange: ((closed: boolean) => void) | null = null
  /** Callback when the cycle completes. */
  onCycleComplete: (() => void) | null = null

  constructor(controller: RobotController, config: PickPlaceConfig) {
    this.controller = controller
    this.config = {
      ...config,
      moveDuration: config.moveDuration ?? DEFAULT_MOVE_DURATION,
      gripDuration: config.gripDuration ?? DEFAULT_GRIP_DURATION,
    }
  }

  /** Begin the pick-and-place sequence. */
  start(): void {
    this.phase = 'move-above-pick'
    this.controller.moveJoints(this.config.abovePickAngles, this.config.moveDuration)
  }

  /** Call every frame after controller.update(). */
  update(): void {
    if (this.phase === 'idle' || this.phase === 'done') return
    if (this.controller.isMoving) return

    const now = performance.now() / 1000

    switch (this.phase) {
      case 'move-above-pick':
        this.phase = 'move-down-pick'
        this.controller.moveJoints(this.config.pickAngles, this.config.moveDuration * 0.5)
        break

      case 'move-down-pick':
        this.phase = 'close-gripper'
        this.gripperClosed = true
        this.onGripperChange?.(true)
        this.waitUntil = now + this.config.gripDuration
        break

      case 'close-gripper':
        if (now >= this.waitUntil) {
          this.phase = 'move-up-pick'
          this.controller.moveJoints(this.config.abovePickAngles, this.config.moveDuration * 0.5)
        }
        break

      case 'move-up-pick':
        this.phase = 'move-above-place'
        this.controller.moveJoints(this.config.abovePlaceAngles, this.config.moveDuration)
        break

      case 'move-above-place':
        this.phase = 'move-down-place'
        this.controller.moveJoints(this.config.placeAngles, this.config.moveDuration * 0.5)
        break

      case 'move-down-place':
        this.phase = 'open-gripper'
        this.gripperClosed = false
        this.onGripperChange?.(false)
        this.waitUntil = now + this.config.gripDuration
        break

      case 'open-gripper':
        if (now >= this.waitUntil) {
          this.phase = 'move-up-place'
          this.controller.moveJoints(this.config.abovePlaceAngles, this.config.moveDuration * 0.5)
        }
        break

      case 'move-up-place':
        this.phase = 'done'
        this.onCycleComplete?.()
        break
    }
  }
}
