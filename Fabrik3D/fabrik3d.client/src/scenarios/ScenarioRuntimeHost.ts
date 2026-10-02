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
import type { AssetRuntimeInstance, EquipmentAssetRuntime } from '../equipment/assets'
import { measureSceneResources, type SceneRenderMetrics } from '../equipment/assets/sceneMetrics'
import {
  createMaterialFlowVisual,
  registerMaterialFlowProceduralAssets,
  resolveEquipmentAssetId,
} from '../equipment/visuals/materialFlowVisuals'
import { ScenarioCellAnimator, type ScenarioCellSnapshot } from './ScenarioCellAnimator'
import {
  applyScenarioProgress,
  createCellVisualState,
  reduceCellVisualState,
  type CellVisualState,
} from './cellVisualState'
import { createScenarioEventProgram, idleScenarioProgress, type ScenarioEventProgram } from './runtimeBinding'
import { ScenarioRunner } from './runner'
import type { ScenarioSceneBinding } from './sceneBinding'
import type { ScenarioEvent, ScenarioProgress } from './types'

export type ScenarioRuntimeHostStatus = 'idle' | 'loading' | 'ready' | 'disposed'

export interface ScenarioRuntimeHostOptions {
  assetRuntime: EquipmentAssetRuntime
  /** Builds the procedural visual for an equipment class. Defaults to the shared factory. */
  createProcedural?: (definitionId: string, dimensions?: Vector3Meters) => THREE.Object3D
  /** Injectable clock for deterministic load-time measurement in tests. */
  now?: () => number
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
  private readonly createProcedural: (definitionId: string, dimensions?: Vector3Meters) => THREE.Object3D
  private readonly assetRuntime: EquipmentAssetRuntime
  private readonly now: () => number

  private currentBinding: ScenarioSceneBinding | null = null
  private runner: ScenarioRunner | null = null
  private program: ScenarioEventProgram = { run: [], recovery: [] }
  private status: ScenarioRuntimeHostStatus = 'idle'
  private cellState: CellVisualState = createCellVisualState('__unbound__')
  private animator: ScenarioCellAnimator | null = null
  private lastMetrics: ScenarioRuntimeMetrics = { equipmentCount: 0, meshes: 0, triangles: 0, drawCalls: 0, textures: 0, loadMs: 0 }

  constructor(options: ScenarioRuntimeHostOptions) {
    this.assetRuntime = options.assetRuntime
    this.createProcedural = options.createProcedural ?? createMaterialFlowVisual
    this.now = options.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()))
    this.root.name = 'scenario-runtime-root'
  }

  get state(): ScenarioRuntimeHostStatus { return this.status }
  get binding(): ScenarioSceneBinding | null { return this.currentBinding }
  get equipmentVisuals(): readonly ScenarioEquipmentVisual[] { return this.visuals }
  /** Authoritative-derived visible state of the bound scenario cell. */
  get visualState(): CellVisualState { return this.cellState }

  /**
   * Binds a resolved scenario and constructs its deterministic runner. This is
   * the scenario-state initialisation step of a switch; it is synchronous so the
   * scenario can start without waiting for a visual load.
   */
  bind(binding: ScenarioSceneBinding): ScenarioProgress {
    this.disposeVisuals()
    this.currentBinding = binding
    this.program = binding.scenario ? createScenarioEventProgram(binding.scenario) : { run: [], recovery: [] }
    this.runner = binding.scenario ? new ScenarioRunner(binding.scenario) : null
    this.status = 'idle'
    this.cellState = applyScenarioProgress(createCellVisualState(binding.scenarioId), this.progress())
    this.lastMetrics = { equipmentCount: 0, meshes: 0, triangles: 0, drawCalls: 0, textures: 0, loadMs: 0 }
    return this.progress()
  }

  initialize(): ScenarioProgress {
    return this.currentBinding ? this.bind(this.currentBinding) : this.progress()
  }

  /** Starts the scenario and applies the run-phase events. Idempotent enough to call without `initialize`. */
  run(): ScenarioProgress {
    if (!this.runner) return this.progress()
    if (this.runner.getState().status === 'idle') this.runner.start()
    for (const event of this.program.run) this.observe(event)
    return this.progress()
  }

  /** Applies the recovery/acknowledgement events. */
  recover(): ScenarioProgress {
    for (const event of this.program.recovery) this.observe(event)
    return this.progress()
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
  }

  /** Steps the deterministic visual transition clock. Render-only; never mutates scenario state. */
  tick(deltaSeconds: number): void {
    this.animator?.tick(deltaSeconds)
  }

  /** Applied visible values read back from the scene graph; `null` before visuals load. */
  visualSnapshot(): ScenarioCellSnapshot | null {
    return this.animator?.snapshot() ?? null
  }

  progress(): ScenarioProgress {
    if (this.runner) return this.runner.getState()
    return idleScenarioProgress(this.currentBinding?.scenario ?? null, this.currentBinding?.scenarioId ?? '')
  }

  /** Positions a camera from the bound scenario/scene data and returns the framing target. */
  placeCamera(camera: ScenarioCameraLike): Vector3Meters {
    const framed = this.currentBinding?.camera
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
    for (const equipment of binding.cell.equipment) {
      const instance = await this.assetRuntime.acquire(resolveEquipmentAssetId(equipment.definitionId), {
        proceduralFallback: () => this.createProcedural(equipment.definitionId),
        distanceMeters: 8,
      })
      const object = instance.root
      if (!object.name) object.name = `equipment:${equipment.id}`
      object.userData.equipmentId = equipment.id
      object.position.set(equipment.transform.position.x, equipment.transform.position.y, equipment.transform.position.z)
      object.rotation.y = equipment.transform.rotation.y
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
    return this.lastMetrics
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
    for (const instance of this.instances) {
      if (instance.source === 'procedural') disposeProceduralResources(instance.root)
      instance.dispose()
    }
    this.instances.length = 0
    this.visuals.length = 0
    this.root.clear()
  }
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
