import * as THREE from 'three'
import type { CncMachineVisual, CncMachineVisualNodes, CncMachineVisualState } from './cncMachineVisual'
import { CNC_DOOR_REST_Y, CNC_DOOR_TRAVEL_Y } from './cncMachineVisual'

/**
 * Binds the generated `hero-cnc-machine-v1` GLB to the same authoritative
 * `CncMachineVisualState` the procedural S39 visual consumes. It owns no
 * runtime state: `CncCycleMachine` remains the single source of truth and this
 * binder only maps a snapshot onto semantic nodes.
 *
 * If a required node is missing the binder reports it through `missingNodes`
 * and the caller falls back to the procedural visual, so a broken asset can
 * never stop the simulation.
 */
export interface CncGlbBinding {
  group: THREE.Group
  nodes: CncMachineVisualNodes
  missingNodes: string[]
  apply(state: CncMachineVisualState): void
  dispose(): void
}

const NOMINAL_RPM = 8_000

function semanticId(object: THREE.Object3D): string {
  return typeof object.userData?.semanticId === 'string' ? object.userData.semanticId : object.name
}

function findNode(root: THREE.Object3D, id: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null
  root.traverse((child) => {
    if (!found && semanticId(child) === id) found = child
  })
  return found
}

function asMesh(node: THREE.Object3D | null): THREE.Mesh | null {
  return node instanceof THREE.Mesh ? node : null
}

function asObject(node: THREE.Object3D | null): THREE.Object3D | null {
  return node ?? null
}

function setLamp(mesh: THREE.Mesh | null, on: boolean, color: number): void {
  if (!mesh) return
  const material = mesh.material
  if (!(material instanceof THREE.MeshStandardMaterial)) return
  material.color.set(on ? color : 0x2c3236)
  material.emissive.set(on ? color : 0x0a0c0d)
  material.emissiveIntensity = on ? 0.7 : 0.1
}

function clamp01(value: number): number {
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

/** Builds a binding over an already-cloned GLB root. */
export function bindCncGlbVisual(root: THREE.Object3D): CncGlbBinding {
  const group = root as THREE.Group
  const missingNodes: string[] = []

  const require = <T extends THREE.Object3D>(id: string, cast: (node: THREE.Object3D | null) => T | null): T | null => {
    const node = cast(findNode(group, id))
    if (!node) missingNodes.push(id)
    return node
  }

  const door = require('door:loading', asMesh)
  const spindle = require('spindle:main', asObject)
  const chuck = require('fixture:chuck', asMesh)
  const jawLeft = require('fixture:jaw-left', asMesh)
  const jawRight = require('fixture:jaw-right', asMesh)
  const feedTable = require('axis:feed', asMesh)
  const panelScreen = require('signal:panel-screen', asMesh)
  const stackLightGreen = require('signal:stack-light', asMesh)
  const stackLightAmber = require('signal:stack-light-amber', asMesh)
  const stackLightRed = require('signal:stack-light-red', asMesh)

  const nodes: CncMachineVisualNodes = {
    door: door ?? new THREE.Mesh(),
    // `spindle` is typed as a Group by the procedural visual; the GLB may
    // expose it as a Group or a Mesh, both of which support rotation.z.
    spindle: (spindle as THREE.Group | null) ?? new THREE.Group(),
    chuck: chuck ?? new THREE.Mesh(),
    jawLeft: jawLeft ?? new THREE.Mesh(),
    jawRight: jawRight ?? new THREE.Mesh(),
    feedTable: feedTable ?? new THREE.Mesh(),
    panelScreen: panelScreen ?? new THREE.Mesh(),
    stackLight: stackLightGreen ?? new THREE.Mesh(),
    stackLightGreen: stackLightGreen ?? new THREE.Mesh(),
    stackLightAmber: stackLightAmber ?? new THREE.Mesh(),
    stackLightRed: stackLightRed ?? new THREE.Mesh(),
  }

  const doorRestY = door?.position.y ?? CNC_DOOR_REST_Y
  const feedRestZ = feedTable?.position.z ?? 0
  const jawRestX = jawLeft ? Math.abs(jawLeft.position.x) : 0.22

  const apply = (state: CncMachineVisualState): void => {
    if (door) door.position.y = doorRestY + clamp01(state.doorPosition) * CNC_DOOR_TRAVEL_Y

    const jawOffset = state.fixtureClamped ? 0.05 : jawRestX
    if (jawLeft) jawLeft.position.x = -jawOffset
    if (jawRight) jawRight.position.x = jawOffset

    if (feedTable) feedTable.position.z = feedRestZ + (state.feedActive ? 0.03 : 0)

    setLamp(stackLightGreen, state.online && state.coarseState === 'IDLE', 0x1fa85a)
    setLamp(stackLightAmber, state.online && (state.coarseState === 'LOADING' || state.coarseState === 'UNLOADING'), 0xd6a400)
    setLamp(stackLightRed, state.online && state.coarseState === 'MACHINING', 0xd64040)

    if (panelScreen && panelScreen.material instanceof THREE.MeshStandardMaterial) {
      const screenColor = state.online
        ? (state.coarseState === 'MACHINING' ? 0x1f6f3a : state.coarseState === 'IDLE' ? 0x003322 : 0x4a3a06)
        : 0x14181b
      panelScreen.material.color.set(screenColor)
      panelScreen.material.emissive.set(screenColor)
    }

    if (spindle) {
      spindle.rotation.z += Math.min(state.spindleSpeed, NOMINAL_RPM) / NOMINAL_RPM * 0.6
      if (spindle.rotation.z > Math.PI * 2) spindle.rotation.z -= Math.PI * 2
    }
  }

  const dispose = (): void => {
    group.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      child.geometry.dispose()
      const material = child.material
      if (Array.isArray(material)) material.forEach((item) => item.dispose())
      else material.dispose()
    })
  }

  return { group, nodes, missingNodes, apply, dispose }
}

/** Adapts a GLB binding to the `CncMachineVisual` interface used by the component. */
export function cncGlbVisual(binding: CncGlbBinding): CncMachineVisual {
  return {
    group: binding.group,
    nodes: binding.nodes,
    apply: binding.apply,
    dispose: binding.dispose,
  }
}
