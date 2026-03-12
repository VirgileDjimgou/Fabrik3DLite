import { type RobotController } from './RobotController'
import { type PartManager, type MetalPartData, type PartShape } from './PartManager'
import { type CellLayoutConfig, DEFAULT_CELL_CONFIG } from './CellLayoutConfig'
import {
  HOME_POSE,
  getPickApproachPose,
  getPickTargetPose,
  getCncApproachPose,
  getCncInsertPose,
  getCncRetrievePose,
  getFinishedPlaceApproachPose,
  getFinishedPlacePose,
} from './WorkspaceTargets'

// ── Workflow phases (granular) ─────────────────────────────────────

export type MachiningPhase =
  | 'IDLE'
  | 'MOVE_ABOVE_PICK'
  | 'DESCEND_TO_PICK'
  | 'PICK_PART'
  | 'LIFT_FROM_PICK'
  | 'MOVE_TO_CNC_APPROACH'
  | 'OPEN_CNC_DOOR'
  | 'MOVE_TO_CNC_INSERT'
  | 'LOAD_PART'
  | 'RETRACT_FROM_CNC'
  | 'CLOSE_CNC_DOOR'
  | 'MACHINING'
  | 'OPEN_CNC_DOOR_RETRIEVE'
  | 'MOVE_TO_CNC_RETRIEVE'
  | 'RETRIEVE_PART'
  | 'LIFT_FROM_CNC'
  | 'MOVE_TO_FINISHED_APPROACH'
  | 'DESCEND_TO_FINISHED'
  | 'PLACE_PART'
  | 'LIFT_FROM_FINISHED'
  | 'COMPLETE'

// ── Callbacks provided by the host component ───────────────────────

export interface MachiningCallbacks {
  /** Called when a part is picked from the raw table. */
  onPartPicked: (part: MetalPartData) => void
  /** Called when a part is placed on the finished table. */
  onPartPlaced: (part: MetalPartData, worldPos: [number, number, number]) => void
  /** Called when a part is marked as machined. */
  onPartMachined: (part: MetalPartData) => void
  /** Open the CNC door (animate). Returns true if accepted. */
  openCNCDoor: () => boolean
  /** Close CNC door and start machining. Returns true if accepted. */
  startCNCMachining: () => boolean
  /** Signal CNC unload complete. */
  cncUnloadComplete: () => void
  /** Returns the next free slot on the finished table. */
  getFinishedSlot: (shape: PartShape) => [number, number, number] | null
  /** Query CNC state. */
  getCNCState: () => string
}

// ── Workflow state machine ─────────────────────────────────────────

/**
 * Full pick → CNC-machine → place workflow for one part at a time.
 *
 * Call `update()` every frame. The workflow advances automatically
 * when robot motions and CNC operations complete.  Target joint
 * poses are derived from actual part / slot positions via
 * WorkspaceTargets so each motion looks spatially coherent.
 */
export class MachiningWorkflow {
  phase: MachiningPhase = 'IDLE'
  partsCompleted = 0

  /** Fires whenever the phase changes. */
  onPhaseChanged: ((phase: MachiningPhase) => void) | null = null
  /** Fires when one full cycle (pick → machine → place) is done. */
  onCycleComplete: ((part: MetalPartData) => void) | null = null
  /** Fires when all available parts have been processed. */
  onAllComplete: (() => void) | null = null

  private readonly controller: RobotController
  private readonly partManager: PartManager
  private readonly cb: MachiningCallbacks
  private readonly cfg: CellLayoutConfig

  private activePart: MetalPartData | null = null
  private activeSlot: [number, number, number] | null = null
  private waitUntil = 0
  private running = false

  constructor(
    controller: RobotController,
    partManager: PartManager,
    callbacks: MachiningCallbacks,
    config?: Partial<CellLayoutConfig>,
  ) {
    this.controller = controller
    this.partManager = partManager
    this.cb = callbacks
    this.cfg = {
      positions: { ...DEFAULT_CELL_CONFIG.positions, ...config?.positions },
      heights:   { ...DEFAULT_CELL_CONFIG.heights,   ...config?.heights },
      timing:    { ...DEFAULT_CELL_CONFIG.timing,    ...config?.timing },
    }
  }

  /** Start processing the next available part (or the first one). */
  start(): void {
    this.running = true
    this.startNextPart()
  }

  /** Pause the workflow after the current motion completes. */
  stop(): void {
    this.running = false
  }

  get isRunning(): boolean {
    return this.running
  }

  // ── Shorthand timing ─────────────────────────────────────────

  private get t() {
    return this.cfg.timing
  }

  // ── Core update (call every frame) ───────────────────────────

  update(): void {
    if (this.phase === 'IDLE' || this.phase === 'COMPLETE') return
    if (this.controller.isMoving) return // wait for current motion

    const now = performance.now() / 1000

    switch (this.phase) {
      // ────────── Pick from raw table ──────────────────────────

      case 'MOVE_ABOVE_PICK':
        // Robot arrived above the part → descend vertically
        this.setPhase('DESCEND_TO_PICK')
        this.controller.moveJoints(
          getPickTargetPose(this.activePart!, this.cfg),
          this.t.approachDuration,
        )
        break

      case 'DESCEND_TO_PICK':
        // At part level → close gripper
        this.setPhase('PICK_PART')
        if (this.activePart) {
          this.partManager.pick(this.activePart.id)
          this.cb.onPartPicked(this.activePart)
        }
        this.waitUntil = now + this.t.gripDuration
        break

      case 'PICK_PART':
        if (now < this.waitUntil) return
        // Lift vertically from the table
        this.setPhase('LIFT_FROM_PICK')
        this.controller.moveJoints(
          getPickApproachPose(this.activePart!, this.cfg),
          this.t.approachDuration,
        )
        break

      // ────────── Travel to CNC ────────────────────────────────

      case 'LIFT_FROM_PICK':
        this.setPhase('MOVE_TO_CNC_APPROACH')
        this.controller.moveJoints(
          getCncApproachPose(),
          this.t.travelDuration,
        )
        break

      case 'MOVE_TO_CNC_APPROACH':
        // Arrived in front of CNC → open door
        this.setPhase('OPEN_CNC_DOOR')
        this.cb.openCNCDoor()
        this.waitUntil = now + this.t.doorWait
        break

      case 'OPEN_CNC_DOOR':
        if (now < this.waitUntil) return
        // Door open → descend into the CNC chamber
        this.setPhase('MOVE_TO_CNC_INSERT')
        this.controller.moveJoints(
          getCncInsertPose(),
          this.t.approachDuration,
        )
        break

      case 'MOVE_TO_CNC_INSERT':
        // Release part inside CNC
        this.setPhase('LOAD_PART')
        this.waitUntil = now + this.t.gripDuration
        break

      case 'LOAD_PART':
        if (now < this.waitUntil) return
        // Retract from CNC chamber
        this.setPhase('RETRACT_FROM_CNC')
        this.controller.moveJoints(
          getCncApproachPose(),
          this.t.approachDuration,
        )
        break

      case 'RETRACT_FROM_CNC':
        // Close door and start machining
        this.setPhase('CLOSE_CNC_DOOR')
        this.cb.startCNCMachining()
        this.waitUntil = now + this.t.machiningDuration
        break

      // ────────── Machining ────────────────────────────────────

      case 'CLOSE_CNC_DOOR':
        // Move to a neutral safe pose while machining proceeds
        this.setPhase('MACHINING')
        this.controller.moveJoints(HOME_POSE, this.t.travelDuration)
        break

      case 'MACHINING':
        if (now < this.waitUntil) return
        if (this.cb.getCNCState() !== 'UNLOADING') return
        // Machining done → move back to CNC
        this.setPhase('OPEN_CNC_DOOR_RETRIEVE')
        this.controller.moveJoints(
          getCncApproachPose(),
          this.t.travelDuration,
        )
        break

      // ────────── Retrieve from CNC ────────────────────────────

      case 'OPEN_CNC_DOOR_RETRIEVE':
        // Arrived at CNC front → descend to retrieve
        this.setPhase('MOVE_TO_CNC_RETRIEVE')
        this.controller.moveJoints(
          getCncRetrievePose(),
          this.t.approachDuration,
        )
        break

      case 'MOVE_TO_CNC_RETRIEVE':
        // Close gripper on the machined part
        this.setPhase('RETRIEVE_PART')
        if (this.activePart) {
          this.partManager.markAsMachined(this.activePart.id)
          this.cb.onPartMachined(this.activePart)
        }
        this.cb.cncUnloadComplete()
        this.waitUntil = now + this.t.gripDuration
        break

      case 'RETRIEVE_PART':
        if (now < this.waitUntil) return
        // Lift out of CNC
        this.setPhase('LIFT_FROM_CNC')
        this.controller.moveJoints(
          getCncApproachPose(),
          this.t.approachDuration,
        )
        break

      // ────────── Place on finished table ──────────────────────

      case 'LIFT_FROM_CNC':
        // Reserve a slot now so the poses can target it
        if (this.activePart) {
          this.activeSlot = this.cb.getFinishedSlot(this.activePart.shape)
        }
        if (!this.activeSlot) {
          // Table is full – finish
          this.setPhase('COMPLETE')
          this.onAllComplete?.()
          return
        }
        this.setPhase('MOVE_TO_FINISHED_APPROACH')
        this.controller.moveJoints(
          getFinishedPlaceApproachPose(this.activeSlot, this.cfg),
          this.t.travelDuration,
        )
        break

      case 'MOVE_TO_FINISHED_APPROACH':
        // Descend to table surface
        this.setPhase('DESCEND_TO_FINISHED')
        this.controller.moveJoints(
          getFinishedPlacePose(this.activeSlot!, this.cfg),
          this.t.approachDuration,
        )
        break

      case 'DESCEND_TO_FINISHED':
        // Open gripper – release part
        this.setPhase('PLACE_PART')
        if (this.activePart && this.activeSlot) {
          this.cb.onPartPlaced(this.activePart, this.activeSlot)
        }
        this.waitUntil = now + this.t.gripDuration
        break

      case 'PLACE_PART':
        if (now < this.waitUntil) return
        // Lift away from the finished table
        this.setPhase('LIFT_FROM_FINISHED')
        this.controller.moveJoints(
          getFinishedPlaceApproachPose(this.activeSlot!, this.cfg),
          this.t.approachDuration,
        )
        break

      case 'LIFT_FROM_FINISHED':
        // Cycle complete
        if (this.activePart) {
          this.onCycleComplete?.(this.activePart)
          this.partsCompleted++
        }
        this.activePart = null
        this.activeSlot = null
        this.finishCycle()
        break
    }
  }

  // ── Internal helpers ─────────────────────────────────────────

  private setPhase(p: MachiningPhase): void {
    this.phase = p
    this.onPhaseChanged?.(p)
  }

  private startNextPart(): void {
    const next = this.partManager.getNextAvailable()
    if (!next) {
      this.setPhase('COMPLETE')
      this.onAllComplete?.()
      return
    }

    this.activePart = next
    this.activeSlot = null
    this.setPhase('MOVE_ABOVE_PICK')
    this.controller.moveJoints(
      getPickApproachPose(next, this.cfg),
      this.t.travelDuration,
    )
  }

  private finishCycle(): void {
    if (!this.running) {
      this.setPhase('IDLE')
      return
    }
    this.setPhase('IDLE')
    setTimeout(() => {
      if (this.running) this.startNextPart()
    }, 0)
  }
}
