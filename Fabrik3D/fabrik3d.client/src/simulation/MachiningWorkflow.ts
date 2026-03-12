import { type RobotController } from './RobotController'
import { type PartManager, type MetalPartData, type PartShape } from './PartManager'

// ── Workflow phases ────────────────────────────────────────────────

export type MachiningPhase =
  | 'IDLE'
  | 'MOVE_TO_PICK'
  | 'PICKING'
  | 'MOVE_UP_FROM_PICK'
  | 'MOVE_TO_CNC'
  | 'OPEN_CNC_DOOR'
  | 'LOAD_PART'
  | 'CLOSE_CNC_DOOR'
  | 'MACHINING'
  | 'OPEN_CNC_DOOR_RETRIEVE'
  | 'RETRIEVE_PART'
  | 'MOVE_UP_FROM_CNC'
  | 'MOVE_TO_FINISHED_TABLE'
  | 'PLACING'
  | 'MOVE_UP_FROM_PLACE'
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

// ── Robot joint poses ──────────────────────────────────────────────

export interface MachiningPoses {
  /** Home / neutral pose */
  home: number[]
  /** Above the raw-parts table (approach) */
  abovePick: number[]
  /** Down at the raw-parts table (grasp) */
  pick: number[]
  /** Above the CNC loading zone (approach) */
  aboveCNC: number[]
  /** At the CNC loading position (insert / retrieve) */
  atCNC: number[]
  /** Above the finished-parts table (approach) */
  abovePlace: number[]
  /** Down at the finished-parts table (release) */
  place: number[]
}

const DEFAULT_POSES: MachiningPoses = {
  home:       [0,     0,     0,    0,  0,    0],
  abovePick:  [0.8,  -0.2,   0.3,  0,  0,    0],
  pick:       [0.8,   0.1,   0.5,  0, -0.3,  0],
  aboveCNC:   [-0.8, -0.2,   0.3,  0,  0,    0],
  atCNC:      [-0.8,  0.1,   0.5,  0, -0.3,  0],
  abovePlace: [0,    -0.3,   0.3,  1.5, 0,   0],
  place:      [0,     0.0,   0.5,  1.5,-0.3,  0],
}

// ── Timing config ──────────────────────────────────────────────────

export interface MachiningTiming {
  moveDuration: number
  approachDuration: number
  gripDuration: number
  doorWait: number
  machiningDuration: number
}

const DEFAULT_TIMING: MachiningTiming = {
  moveDuration: 3,
  approachDuration: 1.5,
  gripDuration: 1,
  doorWait: 1,
  machiningDuration: 5,
}

// ── Workflow state machine ─────────────────────────────────────────

/**
 * Full pick → CNC-machine → place workflow for one part at a time.
 *
 * Call `update()` every frame. The workflow advances automatically
 * when robot motions and CNC operations complete.
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
  private readonly poses: MachiningPoses
  private readonly timing: MachiningTiming

  private activePart: MetalPartData | null = null
  private waitUntil = 0
  private running = false

  constructor(
    controller: RobotController,
    partManager: PartManager,
    callbacks: MachiningCallbacks,
    poses?: Partial<MachiningPoses>,
    timing?: Partial<MachiningTiming>,
  ) {
    this.controller = controller
    this.partManager = partManager
    this.cb = callbacks
    this.poses = { ...DEFAULT_POSES, ...poses }
    this.timing = { ...DEFAULT_TIMING, ...timing }
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

  // ── Core update (call every frame) ───────────────────────────

  update(): void {
    if (this.phase === 'IDLE' || this.phase === 'COMPLETE') return
    if (this.controller.isMoving) return // wait for current motion

    const now = performance.now() / 1000

    switch (this.phase) {
      // ── Pick from raw table ─────────────────────────────────
      case 'MOVE_TO_PICK':
        this.setPhase('PICKING')
        this.controller.moveJoints(this.poses.pick, this.timing.approachDuration)
        break

      case 'PICKING':
        // Gripper closes around the part
        if (this.activePart) {
          this.partManager.pick(this.activePart.id)
          this.cb.onPartPicked(this.activePart)
        }
        this.waitUntil = now + this.timing.gripDuration
        this.setPhase('MOVE_UP_FROM_PICK')
        break

      case 'MOVE_UP_FROM_PICK':
        if (now < this.waitUntil) return
        this.controller.moveJoints(this.poses.abovePick, this.timing.approachDuration)
        this.setPhase('MOVE_TO_CNC')
        break

      // ── Load into CNC ───────────────────────────────────────
      case 'MOVE_TO_CNC':
        this.controller.moveJoints(this.poses.aboveCNC, this.timing.moveDuration)
        this.setPhase('OPEN_CNC_DOOR')
        break

      case 'OPEN_CNC_DOOR':
        this.cb.openCNCDoor()
        this.waitUntil = now + this.timing.doorWait
        this.setPhase('LOAD_PART')
        break

      case 'LOAD_PART':
        if (now < this.waitUntil) return
        this.controller.moveJoints(this.poses.atCNC, this.timing.approachDuration)
        this.setPhase('CLOSE_CNC_DOOR')
        break

      case 'CLOSE_CNC_DOOR':
        // Part released inside CNC
        this.controller.moveJoints(this.poses.aboveCNC, this.timing.approachDuration)
        this.setPhase('MACHINING')
        break

      case 'MACHINING':
        // Start machining (door closes automatically)
        this.cb.startCNCMachining()
        this.waitUntil = now + this.timing.machiningDuration
        this.setPhase('OPEN_CNC_DOOR_RETRIEVE')
        break

      case 'OPEN_CNC_DOOR_RETRIEVE':
        if (now < this.waitUntil) return
        // Wait for CNC to finish and reach UNLOADING state
        if (this.cb.getCNCState() !== 'UNLOADING') return
        this.controller.moveJoints(this.poses.atCNC, this.timing.approachDuration)
        this.setPhase('RETRIEVE_PART')
        break

      case 'RETRIEVE_PART':
        // Gripper picks the machined part back up
        if (this.activePart) {
          this.partManager.markAsMachined(this.activePart.id)
          this.cb.onPartMachined(this.activePart)
        }
        this.cb.cncUnloadComplete()
        this.waitUntil = now + this.timing.gripDuration
        this.setPhase('MOVE_UP_FROM_CNC')
        break

      case 'MOVE_UP_FROM_CNC':
        if (now < this.waitUntil) return
        this.controller.moveJoints(this.poses.aboveCNC, this.timing.approachDuration)
        this.setPhase('MOVE_TO_FINISHED_TABLE')
        break

      // ── Place on finished table ─────────────────────────────
      case 'MOVE_TO_FINISHED_TABLE':
        this.controller.moveJoints(this.poses.abovePlace, this.timing.moveDuration)
        this.setPhase('PLACING')
        break

      case 'PLACING':
        this.controller.moveJoints(this.poses.place, this.timing.approachDuration)
        this.setPhase('MOVE_UP_FROM_PLACE')
        break

      case 'MOVE_UP_FROM_PLACE':
        // Release part onto the finished table
        if (this.activePart) {
          const slot = this.cb.getFinishedSlot(this.activePart.shape)
          if (slot) {
            this.cb.onPartPlaced(this.activePart, slot)
          }
          this.onCycleComplete?.(this.activePart)
          this.partsCompleted++
        }
        this.activePart = null
        this.controller.moveJoints(this.poses.abovePlace, this.timing.approachDuration)
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
    this.setPhase('MOVE_TO_PICK')
    this.controller.moveJoints(this.poses.abovePick, this.timing.moveDuration)
  }

  private finishCycle(): void {
    if (!this.running) {
      this.setPhase('IDLE')
      return
    }
    // After robot returns up, start the next part
    // We use a micro-delay via IDLE check on next update
    this.setPhase('IDLE')
    // Queue up the next part on next frame
    setTimeout(() => {
      if (this.running) this.startNextPart()
    }, 0)
  }
}
