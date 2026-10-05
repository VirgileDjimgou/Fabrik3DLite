/**
 * S58 reusable Three.js scenario host.
 *
 * This host is owned by the simulator runtime, not by a Vue component. It owns
 * the scenario's 3D scene graph and deterministic scenario state and exposes an
 * explicit lifecycle: `bind`/`initialize`, `loadVisuals`, `switch` and
 * `dispose`. Scenario composition is data-driven from a `ScenarioSceneBinding`:
 * each `CellDefinition` equipment instance is acquired from the shared
 * `EquipmentAssetRuntime`, positioned from its SI transform and released
 * deterministically on switch/dispose.
 *
 * Visual assets are render-only and never become authority for state, events,
 * collision or telemetry.
 */

import * as THREE from 'three'
import type { Vector3Meters } from '../equipment/types'
import {
  MATERIAL_FLOW_EQUIPMENT_DEFINITIONS,
  SINGLE_CONVEYOR_EQUIPMENT_DEFINITIONS,
  definitionLookupFrom,
  resolveCellAttachments,
  type AttachmentDiagnostic,
  type AttachmentWorldAnchor,
  type EquipmentDefinitionLookup,
} from '../equipment'
import { INDUSTRIAL_INFRASTRUCTURE_DEFINITIONS, INFRASTRUCTURE_ANCHORS } from '../safety'
import type { AssetRuntimeInstance, EquipmentAssetRuntime } from '../equipment/assets'
import { measureSceneResources, type SceneRenderMetrics } from '../equipment/assets/sceneMetrics'
import {
  createMaterialFlowVisual,
  registerMaterialFlowProceduralAssets,
  resolveEquipmentAssetId,
} from '../equipment/visuals/materialFlowVisuals'
import { buildFactoryEnvironment, disposeFactoryEnvironment } from '../equipment/visuals/factoryEnvironment'
import {
  applyEquipmentShadowFlags,
  applyEquipmentSurfaceTextures,
  createContactShadow,
  disposeContactShadow,
} from '../equipment/visuals/equipmentGrounding'
import { ScenarioCellAnimator, type ScenarioCellSnapshot } from './ScenarioCellAnimator'
import { RobotVisualBinding } from '../robot/RobotVisualBinding'
import { createDefaultRobotCatalog } from '../robot/catalog'
import { ScenarioRobotMotionAdapter, type ScenarioRobotMotionSnapshot } from './ScenarioRobotMotionAdapter'
import { createScenarioMotionPlan, hasScenarioRobotMotion } from './scenarioRobotMotion'
import {
  applyScenarioProgress,
  createCellVisualState,
  reduceCellVisualState,
  type CellVisualState,
} from './cellVisualState'
import { createScenarioEventProgram, idleScenarioProgress, type ScenarioEventProgram } from './runtimeBinding'
import { ScenarioRunner } from './runner'
import {
  buildScenarioProcess,
  ScenarioProcessDriver,
  type ScenarioProcessDefinition,
  type ScenarioProcessSnapshot,
} from './scenarioProcess'
import type { ScenarioSceneBinding } from './sceneBinding'
import type { SceneCameraView } from '../scenes/types'
import type { ScenarioEvent, ScenarioProgress } from './types'

export type ScenarioRuntimeHostStatus = 'idle' | 'loading' | 'ready' | 'disposed'

export interface ScenarioRuntimeHostOptions {
  assetRuntime: EquipmentAssetRuntime
  /** Builds the procedural visual for an equipment class. Defaults to the shared factory. */
  createProcedural?: (definitionId: string, dimensions?: Vector3Meters) => THREE.Object3D
  /** Injectable clock for deterministic load-time measurement in tests. */
  now?: () => number
  /** Builds the shared factory environment; set to `null` to omit it (tests/tools). */
  createEnvironment?: ((binding: ScenarioSceneBinding) => THREE.Object3D | null) | null
  /** S73 equipment definition lookup used to resolve declared anchors/ports. */
  definitionLookup?: EquipmentDefinitionLookup
  /** S73 world/infrastructure anchors an instance may attach to. */
  worldAnchors?: readonly AttachmentWorldAnchor[]
}

export interface ScenarioEquipmentVisual {
  equipmentId: string
  definitionId: string
  object: THREE.Object3D
  source: 'glb' | 'procedural'
  diagnostic?: string
}

export interface ScenarioRuntimeMetrics extends SceneRenderMetrics {
  equipmentCount: number
  /** Wall-clock visual load time; not a GPU measurement. */
  loadMs: number
}

export interface ScenarioCameraLike {
  position: { set(x: number, y: number, z: number): void }
  lookAt(target: Vector3Meters): void
}

export class ScenarioRuntimeHost {
  readonly root = new THREE.Group()
  private readonly instances: AssetRuntimeInstance[] = []
  private readonly visuals: ScenarioEquipmentVisual[] = []
  private readonly contactShadows: THREE.Mesh[] = []
  private readonly createProcedural: (definitionId: string, dimensions?: Vector3Meters) => THREE.Object3D
  private readonly createEnvironment: ((binding: ScenarioSceneBinding) => THREE.Object3D | null) | null
  private readonly assetRuntime: EquipmentAssetRuntime
  private readonly now: () => number
  private readonly definitionLookup: EquipmentDefinitionLookup
  private readonly worldAnchors: readonly AttachmentWorldAnchor[]
  private lastAttachmentDiagnostics: AttachmentDiagnostic[] = []

  private currentBinding: ScenarioSceneBinding | null = null
  private environment: THREE.Object3D | null = null
  private runner: ScenarioRunner | null = null
  private program: ScenarioEventProgram = { run: [], recovery: [] }
  private processDefinition: ScenarioProcessDefinition | null = null
  private processDriver: ScenarioProcessDriver | null = null
  private status: ScenarioRuntimeHostStatus = 'idle'
  private cellState: CellVisualState = createCellVisualState('__unbound__')
  private animator: ScenarioCellAnimator | null = null
  private robotMotion: ScenarioRobotMotionAdapter | null = null
  private robotDiagnostic: string | null = null
  private robotWorldPosition: Vector3Meters = { x: 0, y: 0, z: 0 }
  private robotWorldRotationY = 0
  private carriedWorkpiece: { object: THREE.Object3D; base: Vector3Meters } | null = null
  private lastMetrics: ScenarioRuntimeMetrics = { equipmentCount: 0, meshes: 0, triangles: 0, drawCalls: 0, textures: 0, loadMs: 0 }

  constructor(options: ScenarioRuntimeHostOptions) {
    this.assetRuntime = options.assetRuntime
    this.createProcedural = options.createProcedural ?? createMaterialFlowVisual
    this.now = options.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()))
    this.createEnvironment = options.createEnvironment === undefined
      ? (binding) => buildFactoryEnvironment({
        sizeMeters: binding.scenePreset.environment.floorSizeMeters,
        cellId: binding.scenarioId,
        variant: binding.environmentLevel,
      })
      : options.createEnvironment
    this.definitionLookup = options.definitionLookup ?? definitionLookupFrom([
      ...MATERIAL_FLOW_EQUIPMENT_DEFINITIONS,
      ...SINGLE_CONVEYOR_EQUIPMENT_DEFINITIONS,
      ...INDUSTRIAL_INFRASTRUCTURE_DEFINITIONS,
    ])
    this.worldAnchors = options.worldAnchors ?? INFRASTRUCTURE_ANCHORS
    this.root.name = 'scenario-runtime-root'
  }

  get state(): ScenarioRuntimeHostStatus { return this.status }
  get binding(): ScenarioSceneBinding | null { return this.currentBinding }
  get equipmentVisuals(): readonly ScenarioEquipmentVisual[] { return this.visuals }
  /** Authoritative-derived visible state of the bound scenario cell. */
  get visualState(): CellVisualState { return this.cellState }
  /** S67 deterministic process definition of the bound scenario, or null. */
  get process(): ScenarioProcessDefinition | null { return this.processDefinition }
  /** S67 current deterministic process state, or null when unbound. */
  get processState(): ScenarioProcessSnapshot | null { return this.processDriver?.snapshot() ?? null }
  /** S73 structured diagnostics from the last attachment resolution (empty when all resolved). */
  get attachmentDiagnostics(): readonly AttachmentDiagnostic[] { return this.lastAttachmentDiagnostics }

  /**
   * Binds a resolved scenario and constructs its deterministic runner. This is
   * the scenario-state initialisation step of a switch; it is synchronous so the
   * scenario can start without waiting for a visual load.
   */
  bind(binding: ScenarioSceneBinding): ScenarioProgress {
    this.disposeVisuals()
    this.currentBinding = binding
    this.program = binding.scenario ? createScenarioEventProgram(binding.scenario) : { run: [], recovery: [] }
    this.processDefinition = binding.scenario ? buildScenarioProcess(binding.scenario) : null
    this.processDriver = null
    this.runner = binding.scenario ? new ScenarioRunner(binding.scenario) : null
    this.status = 'idle'
    this.lastAttachmentDiagnostics = []
    this.cellState = applyScenarioProgress(createCellVisualState(binding.scenarioId), this.progress())
    this.lastMetrics = { equipmentCount: 0, meshes: 0, triangles: 0, drawCalls: 0, textures: 0, loadMs: 0 }
    return this.progress()
  }

  initialize(): ScenarioProgress {
    return this.currentBinding ? this.bind(this.currentBinding) : this.progress()
  }

  /** Starts the scenario and runs the whole run phase in one deterministic step. */
  run(): ScenarioProgress {
    if (!this.runner) return this.progress()
    if (this.runner.getState().status === 'idle') this.runner.start()
    if (this.processDefinition) {
      // Continuous mode: the Run command is the acknowledgement, so the process
      // fast-forwards its bounded run phase on the simulation clock and emits
      // every stage event in declared order.
      const driver = new ScenarioProcessDriver(this.processDefinition, { continuous: true })
      this.processDriver = driver
      for (const event of driver.drainRunPhase()) this.observe(event)
    } else {
      for (const event of this.program.run) this.observe(event)
    }
    return this.progress()
  }

  /** Applies the recovery/acknowledgement events. */
  recover(): ScenarioProgress {
    this.processDriver?.complete()
    for (const event of this.program.recovery) this.observe(event)
    return this.progress()
  }

  /**
   * S67: starts the scenario process in guided/paced mode. Stage progression is
   * driven by `tick()` on the simulation clock; in guided mode a declared fault
   * pauses the process until `acknowledgeProcessFault()`.
   */
  startProcess(options: { continuous?: boolean } = {}): ScenarioProcessSnapshot | null {
    if (!this.runner || !this.processDefinition) return null
    this.runner.reset()
    this.runner.start()
    // Restart the visible state from the scenario's declared idle state so a
    // paced/stepped replay starts from exactly the same deterministic position.
    this.cellState = applyScenarioProgress(createCellVisualState(this.currentBinding?.scenarioId ?? ''), this.progress())
    this.animator?.setState(this.cellState)
    this.robotMotion?.observeState(this.cellState)
    const driver = new ScenarioProcessDriver(this.processDefinition, {
      continuous: options.continuous ?? false,
      onEvent: event => this.observe(event),
    })
    this.processDriver = driver
    driver.start()
    return driver.snapshot()
  }

  /** S67 Step Mode: advances exactly one deterministic process stage. */
  stepProcess(): ScenarioProcessSnapshot | null {
    return this.processDriver ? this.processDriver.step() : null
  }

  /** S67: pauses a paced process without losing its deterministic position. */
  pauseProcess(): ScenarioProcessSnapshot | null {
    return this.processDriver ? this.processDriver.pause() : null
  }

  /** S67: resumes a paused paced process. */
  resumeProcess(): ScenarioProcessSnapshot | null {
    return this.processDriver ? this.processDriver.resume() : null
  }

  /** S67: acknowledges a fault and resumes from the defined recovery point. */
  acknowledgeProcessFault(): ScenarioProcessSnapshot | null {
    return this.processDriver ? this.processDriver.acknowledgeFault() : null
  }

  /** Applies arbitrary events in order; used by equivalence tests and integrations. */
  apply(events: readonly ScenarioEvent[]): ScenarioProgress {
    for (const event of events) this.observe(event)
    return this.progress()
  }

  /** Observes one event in both the scenario runner (authority) and the visual reducer. */
  private observe(event: ScenarioEvent): void {
    this.runner?.observe(event)
    this.cellState = applyScenarioProgress(reduceCellVisualState(this.cellState, event), this.progress())
    this.animator?.setState(this.cellState)
    // The robot adapter consumes the same authoritative-derived state; it never
    // writes scenario truth back and only requests motion the scenario declared.
    this.robotMotion?.observeState(this.cellState)
  }

  /** Steps the deterministic visual transition clock. Render-only; never mutates scenario state. */
  tick(deltaSeconds: number): void {
    // S67: the paced process advances on deterministic simulation time and only
    // emits its declared stage events. A fast-forwarded (continuous) run is
    // already at its acknowledgement boundary, so this is a no-op then.
    this.processDriver?.tick(deltaSeconds)
    this.animator?.tick(deltaSeconds)
    // Robot motion advances on deterministic simulation time, never render frames.
    this.robotMotion?.tick(deltaSeconds)
    // S75: the animator mirrors the authoritative joint pose for bounded
    // dress-pack secondary motion; it never feeds geometry back into state.
    if (this.robotMotion) this.animator?.setRobotPose(this.robotMotion.jointAngles)
    this.syncCarriedWorkpiece()
  }

  /** Applied visible values read back from the scene graph; `null` before visuals load. */
  visualSnapshot(): ScenarioCellSnapshot | null {
    return this.animator?.snapshot() ?? null
  }

  /** S66 robot motion state, or `null` for a cell without robot motion. */
  robotSnapshot(): ScenarioRobotMotionSnapshot | null {
    return this.robotMotion?.snapshot() ?? null
  }

  /** Current J1…J6 angles owned by the existing controller (empty before binding). */
  robotJointAngles(): number[] {
    return this.robotMotion ? [...this.robotMotion.jointAngles] : []
  }

  /** Diagnostic recorded when the robot visual could not be bound (render-only). */
  get robotMotionDiagnostic(): string | null { return this.robotDiagnostic }

  progress(): ScenarioProgress {
    if (this.runner) return this.runner.getState()
    return idleScenarioProgress(this.currentBinding?.scenario ?? null, this.currentBinding?.scenarioId ?? '')
  }

  /**
   * Positions a camera from the bound scenario/scene data and returns the
   * framing target. S69: an optional derived view selects the overview (default),
   * operator or workcell framing; an unknown view falls back to the primary
   * default so the camera is never left unpositioned.
   */
  placeCamera(camera: ScenarioCameraLike, view: SceneCameraView = 'overview'): Vector3Meters {
    const framed = this.currentBinding?.cameraPresets?.[view] ?? this.currentBinding?.camera
    const position = framed?.position ?? { x: 5, y: 4, z: 6 }
    const target = framed?.target ?? { x: 0, y: 0.7, z: 0 }
    camera.position.set(position.x, position.y, position.z)
    camera.lookAt(target)
    return target
  }

  /**
   * Loads one visual per cell equipment instance into the root group. Unknown
   * classes degrade to the generic procedural visual with a diagnostic; a
   * missing asset never blocks scenario state.
   */
  async loadVisuals(): Promise<ScenarioRuntimeMetrics> {
    const binding = this.currentBinding
    if (!binding || this.status === 'disposed') return this.lastMetrics
    this.status = 'loading'
    const started = this.now()
    registerMaterialFlowProceduralAssets(this.assetRuntime.getRegistry())
    // S68: the coherent factory ground layer is loaded first so equipment sits on
    // it. It is render-only and never becomes collision or scenario truth.
    if (!this.environment && this.createEnvironment) {
      this.environment = this.createEnvironment(binding)
      if (this.environment) this.root.add(this.environment)
    }
    // S73: declared anchors/ports are authoritative for placement. The declared
    // transform is the compatibility fallback and is used unchanged when no
    // attachment is declared or when resolution fails closed with a diagnostic.
    const attachmentResolution = resolveCellAttachments(binding.cell, this.definitionLookup, { worldAnchors: this.worldAnchors })
    this.lastAttachmentDiagnostics = attachmentResolution.diagnostics
    for (const equipment of binding.cell.equipment) {
      const placement = attachmentResolution.byEquipmentId.get(equipment.id)!.transform
      const instance = await this.assetRuntime.acquire(resolveEquipmentAssetId(equipment.definitionId), {
        proceduralFallback: () => this.createProcedural(equipment.definitionId),
        distanceMeters: 8,
      })
      const object = instance.root
      if (!object.name) object.name = `equipment:${equipment.id}`
      object.userData.equipmentId = equipment.id
      object.position.set(placement.position.x, placement.position.y, placement.position.z)
      object.rotation.y = placement.rotation.y
      // S72 grounding: shadow flags are enforced on every source (GLB and
      // procedural), generated label/screen nodes receive procedural surfaces and
      // a deterministic contact decal anchors the equipment to the floor. All of
      // this is render-only and never becomes collision, state or telemetry truth.
      applyEquipmentShadowFlags(object)
      applyEquipmentSurfaceTextures(object)
      const contactShadow = createContactShadow({
        radius: contactShadowRadiusFor(object),
        name: `grounding:contact-shadow:${equipment.id}`,
      })
      object.add(contactShadow)
      this.contactShadows.push(contactShadow)
      this.root.add(object)
      this.instances.push(instance)
      this.visuals.push({
        equipmentId: equipment.id,
        definitionId: equipment.definitionId,
        object,
        source: instance.source,
        diagnostic: instance.diagnostic,
      })
    }
    this.status = 'ready'
    this.lastMetrics = {
      equipmentCount: this.visuals.length,
      ...measureSceneResources(this.root),
      loadMs: Math.max(0, this.now() - started),
    }
    // The animator binds the authoritative-derived visible state onto the freshly
    // loaded visuals. It is render-only and never feeds state back to the runner.
    this.animator?.dispose()
    this.animator = new ScenarioCellAnimator(this.visuals.map(visual => ({
      equipmentId: visual.equipmentId,
      definitionId: visual.definitionId,
      object: visual.object,
    })))
    this.animator.setState(this.cellState)
    this.bindRobotMotion()
    if (this.robotMotion) this.animator.setRobotPose(this.robotMotion.jointAngles)
    return this.lastMetrics
  }

  /**
   * S66: binds an authoritative `RobotController` to the loaded scene robot and
   * the declared scenario motion plan. The robot controller owns J1…J6; the
   * visual binding only mirrors them and the scenario requests motion through the
   * adapter. A visual without semantic joints degrades gracefully with a
   * diagnostic and never blocks scenario execution.
   */
  private bindRobotMotion(): void {
    this.robotMotion = null
    this.robotDiagnostic = null
    this.carriedWorkpiece = null
    const kind = this.cellState.kind
    if (!hasScenarioRobotMotion(kind)) return
    const robotVisual = this.visuals.find(visual => visual.definitionId === 'fanuc-like-6axis')
    if (!robotVisual) {
      this.robotDiagnostic = `Cell '${kind}' has no 'fanuc-like-6axis' robot visual to bind.`
      return
    }
    const assetId = resolveEquipmentAssetId(robotVisual.definitionId)
    const registry = this.assetRuntime.getRegistry()
    const registered = registry.has(assetId) ? registry.get(assetId) : null
    const rig = registered && registered.source === 'glb' ? registered.manifest.robotRig : undefined
    let binding: RobotVisualBinding | null = null
    try {
      binding = new RobotVisualBinding(robotVisual.object, rig)
    } catch (error) {
      this.robotDiagnostic = `Robot visual binding unavailable: ${error instanceof Error ? error.message : String(error)}`
    }
    const equipment = this.currentBinding?.cell.equipment.find(item => item.id === robotVisual.equipmentId)
    this.robotWorldPosition = equipment?.transform.position ?? { x: 0, y: 0, z: 0 }
    this.robotWorldRotationY = equipment?.transform.rotation.y ?? 0
    const plan = createScenarioMotionPlan(kind)
    const profile = createDefaultRobotCatalog().getRobot(plan.robotProfileId)
    this.robotMotion = new ScenarioRobotMotionAdapter({ plan, profile, visualBinding: binding })
    this.robotMotion.observeState(this.cellState)
  }

  /** Definition class of the workpiece a moving robot carries, per cell kind. */
  private carriedWorkpieceDefinition(): string | null {
    switch (this.cellState.kind) {
      case 'robot-palletizing': return 'carton'
      case 'assembly-inspection': return 'configurable-part'
      default: return null
    }
  }

  /**
   * Render-only synchronization: while the adapter reports the workpiece held,
   * the active workpiece visual follows the robot tool tip derived from the
   * controller joints. It never feeds geometry back into scenario state. On
   * release in the assembly cell the part settles onto its resting fixture;
   * palletizing keeps the existing animator authority over the carton.
   */
  private syncCarriedWorkpiece(): void {
    const motion = this.robotMotion
    if (!motion) return
    const definitionId = this.carriedWorkpieceDefinition()
    if (!definitionId) return
    const workpiece = this.visuals.find(visual => visual.definitionId === definitionId)
    if (!workpiece) return
    const snapshot = motion.snapshot()
    if (snapshot.carrying) {
      const tool = motion.toolPosition()
      if (!tool) return
      this.carriedWorkpiece ??= {
        object: workpiece.object,
        base: { x: workpiece.object.position.x, y: workpiece.object.position.y, z: workpiece.object.position.z },
      }
      const cos = Math.cos(this.robotWorldRotationY)
      const sin = Math.sin(this.robotWorldRotationY)
      workpiece.object.position.set(
        this.robotWorldPosition.x + tool.x * cos + tool.z * sin,
        this.robotWorldPosition.y + tool.y,
        this.robotWorldPosition.z - tool.x * sin + tool.z * cos,
      )
      return
    }
    if (this.carriedWorkpiece && this.cellState.kind === 'assembly-inspection') {
      workpiece.object.position.set(this.carriedWorkpiece.base.x, this.carriedWorkpiece.base.y, this.carriedWorkpiece.base.z)
    }
    this.carriedWorkpiece = null
  }

  /** Unloads the previous visual runtime, rebinds and loads the new cell. */
  async switch(binding: ScenarioSceneBinding): Promise<ScenarioRuntimeMetrics> {
    this.bind(binding)
    return this.loadVisuals()
  }

  metrics(): ScenarioRuntimeMetrics { return this.lastMetrics }

  /** Releases all instance-owned resources and detaches the root. Idempotent. */
  dispose(): void {
    if (this.status === 'disposed') return
    this.disposeVisuals()
    this.root.removeFromParent()
    this.status = 'disposed'
  }

  private disposeVisuals(): void {
    this.animator?.dispose()
    this.animator = null
    this.processDriver = null
    this.robotMotion = null
    this.robotDiagnostic = null
    this.carriedWorkpiece = null
    if (this.environment) {
      this.root.remove(this.environment)
      disposeFactoryEnvironment(this.environment)
      this.environment = null
    }
    for (const shadow of this.contactShadows) disposeContactShadow(shadow)
    this.contactShadows.length = 0
    for (const instance of this.instances) {
      if (instance.source === 'procedural') disposeProceduralResources(instance.root)
      instance.dispose()
    }
    this.instances.length = 0
    this.visuals.length = 0
    this.root.clear()
  }
}

/**
 * S72: derives a bounded contact-shadow radius from an equipment visual's
 * footprint, so large cabinets and small sensors both get a proportionate decal.
 */
export function contactShadowRadiusFor(object: THREE.Object3D): number {
  const bounds = new THREE.Box3().setFromObject(object)
  const size = new THREE.Vector3()
  bounds.getSize(size)
  const radius = Math.max(size.x, size.z) * 0.55
  if (!Number.isFinite(radius) || radius <= 0) return 0.7
  return Math.max(0.25, Math.min(2.0, radius))
}

/** Disposes instance-owned geometry and materials for procedural visuals. */
export function disposeProceduralResources(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    geometries.add(child.geometry)
    const list = Array.isArray(child.material) ? child.material : [child.material]
    for (const material of list) materials.add(material)
  })
  for (const geometry of geometries) geometry.dispose()
  for (const material of materials) material.dispose()
}
