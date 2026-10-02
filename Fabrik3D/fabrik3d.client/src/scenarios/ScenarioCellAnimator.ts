/**
 * S59 scenario cell animator.
 *
 * Render-only bridge that applies a `CellVisualState` (derived from authoritative
 * scenario events) to the procedural equipment visuals of a scenario cell. It
 * never reads scenario truth back out of meshes: the state is pushed in by
 * `ScenarioRuntimeHost`, which observes the same deterministic `ScenarioRunner`
 * events that define the scenario outcome.
 *
 * The animator owns no scenario state, no collision authority and no telemetry.
 * It only changes colours and the transforms of declared state-bearing nodes, and
 * interpolates part/gate/clamp motion from an explicit, deterministic clock so
 * tests can step it without a WebGL context.
 */

import * as THREE from 'three'
import type { Vector3Meters } from '../equipment/types'
import type { CellLifecycle, CellVisualState, ScenarioCellKind, StackLight } from './cellVisualState'

/** Minimal view of a loaded equipment visual; mirrors `ScenarioEquipmentVisual`. */
export interface AnimatableEquipment {
  equipmentId: string
  definitionId: string
  object: THREE.Object3D
}

export interface ScenarioCellSnapshot {
  kind: ScenarioCellKind
  lifecycle: CellLifecycle
  faultVisible: boolean
  stackLight: StackLight
  /** Vision sorting */
  partPosition: Vector3Meters | null
  inspectionActive: boolean
  diverterExtension: number
  classification: 'accepted' | 'rejected' | null
  acceptedBinSignal: string | null
  rejectBinSignal: string | null
  /** Robot palletizing */
  gripperHolding: boolean
  vacuumLoss: boolean
  placedLayers: number
  activeBoxPosition: Vector3Meters | null
  /** Assembly / inspection */
  clamped: boolean
  clampAngle: number
  partPresent: boolean
  reworkVisible: boolean
  /** Safety training */
  gateOpen: boolean
  gateOpenAmount: number
  scannerMuted: boolean
  emergencyStop: boolean
  estopPressedAmount: number
}

const SIGNAL_RED = 0xc0392b
const SIGNAL_GREEN = 0x2fa864
const SIGNAL_AMBER = 0xd8a51f
const SIGNAL_DARK = 0x20262a
const SENSOR_BLUE = 0x9fe3ff

const STACK_COLORS: Record<StackLight, number> = { green: SIGNAL_GREEN, amber: SIGNAL_AMBER, red: SIGNAL_RED }

/** Transition duration used to interpolate visible motion from one state to the next. */
export const CELL_ANIMATION_TRANSITION_SECONDS = 1.2

const GATE_SLIDE_METERS = 1.1
const DIVERTER_STROKE_METERS = 0.28
const ESTOP_PRESS_METERS = 0.03

interface VisionTrack {
  start: Vector3Meters
  inspect: Vector3Meters
  accept: Vector3Meters
  reject: Vector3Meters
  jam: Vector3Meters
}

const VISION_TRACK: VisionTrack = {
  start: { x: -1.8, y: 0.6, z: 0 },
  inspect: { x: -0.8, y: 0.6, z: 0 },
  accept: { x: 0.95, y: 0.44, z: -0.85 },
  reject: { x: 0.95, y: 0.44, z: 0.85 },
  jam: { x: -0.05, y: 0.6, z: 0 },
}

const BOX_TRACK = {
  infeed: { x: -2.6, y: 0.55, z: -1.3 },
  pick: { x: -1.4, y: 1.15, z: -0.9 },
  place: { x: 0.8, y: 0.66, z: -0.9 },
}

export class ScenarioCellAnimator {
  private readonly byClass = new Map<string, THREE.Object3D[]>()
  private readonly nodeCache = new Map<THREE.Object3D, Map<string, THREE.Object3D | null>>()
  private readonly bases = new Map<THREE.Object3D, THREE.Vector3>()
  private currentState: CellVisualState | null = null
  private previousState: CellVisualState | null = null
  private elapsed = CELL_ANIMATION_TRANSITION_SECONDS
  private disposed = false

  constructor(equipment: readonly AnimatableEquipment[]) {
    for (const item of equipment) {
      const list = this.byClass.get(item.definitionId) ?? []
      list.push(item.object)
      this.byClass.set(item.definitionId, list)
    }
  }

  get state(): CellVisualState | null { return this.currentState }

  /** Pushes a new visible state. Resets the interpolation clock when it changes. */
  setState(state: CellVisualState): void {
    if (this.disposed) return
    if (this.currentState && statesEqual(this.currentState, state)) {
      this.currentState = state
      return
    }
    this.previousState = this.currentState
    this.currentState = state
    this.elapsed = 0
    this.apply()
  }

  /** Advances the deterministic transition clock and applies the interpolated state. */
  tick(deltaSeconds: number): void {
    if (this.disposed || !this.currentState) return
    this.elapsed = Math.max(0, this.elapsed + Math.max(0, deltaSeconds))
    this.apply()
  }

  /** True once the current state transition has fully settled. */
  get settled(): boolean {
    return this.elapsed >= CELL_ANIMATION_TRANSITION_SECONDS
  }

  dispose(): void {
    this.disposed = true
    this.byClass.clear()
    this.nodeCache.clear()
    this.bases.clear()
  }

  /** Reads the applied visible values back from the scene graph for tests/evidence. */
  snapshot(): ScenarioCellSnapshot {
    const state = this.currentState
    const kind = state?.kind ?? 'cnc-machine-tending'
    const t = this.transitionFactor()
    const visionPart = this.activePart('configurable-part')
    const box = this.first('carton')
    const gate = this.first('interlocked-gate')
    const gateNode = gate ? this.node(gate, 'gate') : null
    const estop = this.first('emergency-stop')
    const estopButton = estop ? this.node(estop, 'button') : null
    const clamp = this.first('toggle-clamp')
    const clampHandle = clamp ? this.node(clamp, 'handle') : null
    const bins = this.byClass.get('storage-bin') ?? []
    const diverter = this.first('diverter-pusher')
    const pusher = diverter ? this.node(diverter, 'pusher') : null

    return {
      kind,
      lifecycle: state?.lifecycle ?? 'idle',
      faultVisible: Boolean(state && (state.fault || state.jam || state.vacuumLoss || state.emergencyStop)),
      stackLight: state?.stackLight ?? 'green',
      partPosition: visionPart ? toVector(visionPart.position) : null,
      inspectionActive: Boolean(state?.inspectionActive),
      diverterExtension: pusher ? clamp01((pusher.position.x - this.baseOf(pusher).x) / DIVERTER_STROKE_METERS) : this.diverterExtension(t),
      classification: state?.classification ?? null,
      acceptedBinSignal: bins[0] ? colorOf(this.node(bins[0], 'opening')) : null,
      rejectBinSignal: bins[1] ? colorOf(this.node(bins[1], 'opening')) : null,
      gripperHolding: Boolean(state?.gripperHolding),
      vacuumLoss: Boolean(state?.vacuumLoss),
      placedLayers: state?.layerPlaced ?? 0,
      activeBoxPosition: box ? toVector(box.position) : null,
      clamped: Boolean(state?.clamped),
      clampAngle: clampHandle ? clampHandle.rotation.z : 0,
      partPresent: Boolean(state?.partPresent),
      reworkVisible: Boolean(state?.reworkRequired),
      gateOpen: Boolean(state?.gateOpen),
      gateOpenAmount: gateNode ? clamp01((gateNode.position.x - this.baseOf(gateNode).x) / GATE_SLIDE_METERS) : 0,
      scannerMuted: Boolean(state?.scannerMuted),
      emergencyStop: Boolean(state?.emergencyStop),
      estopPressedAmount: estopButton ? clamp01((this.baseOf(estopButton).y - estopButton.position.y) / ESTOP_PRESS_METERS) : 0,
    }
  }

  private transitionFactor(): number {
    return Math.min(1, Math.max(0, this.elapsed / CELL_ANIMATION_TRANSITION_SECONDS))
  }

  private apply(): void {
    const state = this.currentState
    if (!state) return
    this.applyStackLight(state)
    switch (state.kind) {
      case 'vision-sorting':
        this.applyVisionSorting(state)
        return
      case 'robot-palletizing':
        this.applyPalletizing(state)
        return
      case 'assembly-inspection':
        this.applyAssembly(state)
        return
      case 'robot-safety-training':
        this.applySafety(state)
        return
      default:
        return
    }
  }

  private applyStackLight(state: CellVisualState): void {
    const light = this.first('stack-light')
    if (!light) return
    for (const [node, color] of [['red', SIGNAL_RED], ['amber', SIGNAL_AMBER], ['green', SIGNAL_GREEN]] as const) {
      const mesh = this.node(light, node)
      if (mesh) emissive(mesh, node === state.stackLight ? STACK_COLORS[state.stackLight] : SIGNAL_DARK)
    }
  }

  private applyVisionSorting(state: CellVisualState): void {
    const part = this.activePart('configurable-part')
    if (part) {
      const from = visionPartTarget(this.previousState ?? state)
      const to = visionPartTarget(state)
      const t = this.transitionFactor()
      part.position.set(lerp(from.x, to.x, t), lerp(from.y, to.y, t), lerp(from.z, to.z, t))
    }

    const station = this.first('vision-inspection-station')
    if (station) {
      emissive(this.node(station, 'inspection-light'), state.inspectionActive ? SIGNAL_GREEN : SIGNAL_DARK)
      emissive(this.node(station, 'lens'), state.inspectionActive ? SIGNAL_GREEN : SENSOR_BLUE)
      emissive(this.node(station, 'camera'), state.jam ? SIGNAL_RED : SIGNAL_DARK)
    }
    const sensor = this.first('photoelectric-sensor')
    if (sensor) emissive(this.node(sensor, 'lens'), state.jam ? SIGNAL_RED : SIGNAL_GREEN)
    const reader = this.first('barcode-rfid-reader')
    if (reader) emissive(this.node(reader, 'window'), state.inspectionActive ? SIGNAL_GREEN : SENSOR_BLUE)

    const diverter = this.first('diverter-pusher')
    if (diverter) {
      const pusher = this.node(diverter, 'pusher')
      if (pusher) pusher.position.x = this.baseOf(pusher).x + this.diverterExtension(this.transitionFactor()) * DIVERTER_STROKE_METERS
    }
    const bins = this.byClass.get('storage-bin') ?? []
    if (bins[0]) emissive(this.node(bins[0], 'opening'), state.acceptedParts > 0 ? SIGNAL_GREEN : SIGNAL_DARK)
    if (bins[1]) emissive(this.node(bins[1], 'opening'), state.rejectedParts > 0 ? SIGNAL_RED : SIGNAL_DARK)
  }

  private applyPalletizing(state: CellVisualState): void {
    const box = this.first('carton')
    if (box) {
      const from = boxTarget(this.previousState ?? state)
      const to = boxTarget(state)
      const t = this.transitionFactor()
      box.position.set(lerp(from.x, to.x, t), lerp(from.y, to.y, t), lerp(from.z, to.z, t))
    }
    const gripper = this.first('vacuum-gripper')
    if (gripper) {
      emissive(this.node(gripper, 'interface'), state.vacuumLoss ? SIGNAL_RED : state.gripperHolding ? SIGNAL_GREEN : SIGNAL_DARK)
    }
    const pallets = this.byClass.get('euro-pallet') ?? []
    if (pallets[1]) emissive(this.node(pallets[1], 'pallet'), state.palletComplete ? SIGNAL_GREEN : SIGNAL_DARK)
    const lightCurtain = this.first('light-curtain')
    if (lightCurtain) emissive(this.node(lightCurtain, 'field'), state.vacuumLoss ? SIGNAL_RED : SENSOR_BLUE)
  }

  private applyAssembly(state: CellVisualState): void {
    for (const clamp of this.byClass.get('toggle-clamp') ?? []) {
      const handle = this.node(clamp, 'handle')
      if (handle) handle.rotation.z = state.clamped ? -0.6 : 0
    }
    const sensor = this.first('part-presence-sensor')
    if (sensor) emissive(this.node(sensor, 'sensor'), state.partPresent ? SIGNAL_GREEN : SIGNAL_DARK)
    const reader = this.first('barcode-rfid-reader')
    if (reader) emissive(this.node(reader, 'window'), state.reworkRequired ? SIGNAL_RED : state.partPresent ? SIGNAL_GREEN : SENSOR_BLUE)
    const buffers = this.byClass.get('outfeed-buffer') ?? []
    if (buffers[0]) emissive(this.node(buffers[0], 'deck'), state.reworkRequired ? SIGNAL_RED : SIGNAL_DARK)
  }

  private applySafety(state: CellVisualState): void {
    const gate = this.first('interlocked-gate')
    if (gate) {
      const panel = this.node(gate, 'gate')
      if (panel) panel.position.x = this.baseOf(panel).x + this.gateOpenAmount(state) * GATE_SLIDE_METERS
      emissive(this.node(gate, 'interlock'), state.gateOpen ? SIGNAL_RED : SIGNAL_GREEN)
    }
    const scanner = this.first('area-scanner')
    if (scanner) emissive(this.node(scanner, 'window'), state.scannerMuted ? SIGNAL_AMBER : SIGNAL_GREEN)
    const estop = this.first('emergency-stop')
    if (estop) {
      const button = this.node(estop, 'button')
      if (button) {
        button.position.y = this.baseOf(button).y - (state.emergencyStop ? ESTOP_PRESS_METERS : 0)
        emissive(button, state.emergencyStop ? SIGNAL_DARK : SIGNAL_RED)
      }
    }
    for (const zone of this.byClass.get('safety-zone') ?? []) {
      emissive(this.node(zone, 'zone-floor'), state.emergencyStop || state.fault ? SIGNAL_RED : SIGNAL_AMBER)
    }
  }

  private diverterExtension(t: number): number {
    const state = this.currentState
    if (!state || state.kind !== 'vision-sorting') return 0
    const from = this.previousState?.diverterExtended ? 1 : 0
    const to = state.diverterExtended ? 1 : 0
    return from + (to - from) * t
  }

  private gateOpenAmount(state: CellVisualState): number {
    const from = this.previousState?.kind === 'robot-safety-training' && this.previousState.gateOpen ? 1 : 0
    const to = state.gateOpen ? 1 : 0
    return from + (to - from) * this.transitionFactor()
  }

  private baseOf(node: THREE.Object3D): THREE.Vector3 {
    let base = this.bases.get(node)
    if (!base) {
      base = node.position.clone()
      this.bases.set(node, base)
    }
    return base
  }

  private activePart(definitionId: string): THREE.Object3D | null {
    return this.byClass.get(definitionId)?.[0] ?? null
  }

  private first(definitionId: string): THREE.Object3D | null {
    return this.byClass.get(definitionId)?.[0] ?? null
  }

  private node(object: THREE.Object3D, semanticId: string): THREE.Object3D | null {
    let cache = this.nodeCache.get(object)
    if (!cache) {
      cache = new Map()
      this.nodeCache.set(object, cache)
    }
    if (cache.has(semanticId)) return cache.get(semanticId) ?? null
    let found: THREE.Object3D | null = object.getObjectByName(semanticId) ?? null
    if (!found) {
      object.traverse((child) => {
        if (!found && child.userData?.semanticId === semanticId) found = child
      })
    }
    cache.set(semanticId, found)
    return found
  }
}

function visionPartTarget(state: CellVisualState): Vector3Meters {
  switch (state.partStage) {
    case 'idle':
      return VISION_TRACK.start
    case 'infeed':
    case 'inspect':
      return VISION_TRACK.inspect
    case 'jammed':
      return VISION_TRACK.jam
    case 'recovered':
      return VISION_TRACK.reject
    case 'diverted':
    default:
      return state.classification === 'rejected' ? VISION_TRACK.reject : VISION_TRACK.accept
  }
}

function boxTarget(state: CellVisualState): Vector3Meters {
  if (state.vacuumLoss) return BOX_TRACK.infeed
  if (state.palletComplete) return { ...BOX_TRACK.place, y: BOX_TRACK.place.y + Math.max(0, state.layerPlaced - 1) * 0.32 }
  if (state.lifecycle === 'running') return BOX_TRACK.pick
  return BOX_TRACK.infeed
}

function statesEqual(a: CellVisualState, b: CellVisualState): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function toVector(position: THREE.Vector3): Vector3Meters {
  return { x: position.x, y: position.y, z: position.z }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function asMesh(node: THREE.Object3D | null): THREE.Mesh | null {
  return node instanceof THREE.Mesh ? node : null
}

function colorOf(node: THREE.Object3D | null): string | null {
  const mesh = asMesh(node)
  const material = mesh && !Array.isArray(mesh.material) ? mesh.material : null
  if (!material || !('color' in material)) return null
  return `#${(material as THREE.MeshStandardMaterial).color.getHexString()}`
}

function emissive(node: THREE.Object3D | null, hex: number): void {
  const mesh = asMesh(node)
  if (!mesh) return
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
  if (!material) return
  const standard = material as THREE.MeshStandardMaterial
  if (standard.emissive) standard.emissive.setHex(hex)
  if (standard.color) standard.color.setHex(hex)
}
