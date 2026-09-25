/**
 * Procedural CNC machining-centre visual for the reference cell (S39).
 *
 * The geometry is deliberately renderer-only: it exposes semantic nodes
 * (`door:loading`, `spindle:main`, `fixture:chuck`, `signal:stack-light`, …) and
 * a pure `apply(state)` mapping. It never owns runtime behavior; the deterministic
 * `CncCycleMachine` remains authoritative and the component subscribes to it.
 *
 * Materials use a coherent painted-steel / stainless / safety-yellow / glass
 * palette with believable roughness and metalness for an industrial demo.
 */

import * as THREE from 'three'

/** Height of the sliding loading door when fully closed (m). */
export const CNC_DOOR_REST_Y = 1.0
/** Door travel between fully closed and fully open (m). */
export const CNC_DOOR_TRAVEL_Y = 0.85

export interface CncMachineVisualState {
  doorPosition: number
  fixtureClamped: boolean
  spindleSpeed: number
  spindleAtSpeed: boolean
  feedActive: boolean
  coolantOn: boolean
  /** `IDLE | LOADING | MACHINING | UNLOADING`, used only for the stack light. */
  coarseState: string
  online: boolean
}

export interface CncMachineVisualNodes {
  door: THREE.Mesh
  spindle: THREE.Group
  chuck: THREE.Mesh
  jawLeft: THREE.Mesh
  jawRight: THREE.Mesh
  feedTable: THREE.Mesh
  panelScreen: THREE.Mesh
  stackLight: THREE.Mesh
  stackLightGreen: THREE.Mesh
  stackLightAmber: THREE.Mesh
  stackLightRed: THREE.Mesh
}

export interface CncMachineVisual {
  group: THREE.Group
  nodes: CncMachineVisualNodes
  apply(state: CncMachineVisualState): void
  dispose(): void
}

const NOMINAL_RPM = 8_000

/** Builds one independent CNC visual. Every material/geometry is instance-owned. */
export function buildCncMachineVisual(): CncMachineVisual {
  const group = new THREE.Group()
  group.name = 'LargeCNC'
  group.userData.semanticId = 'equipment:cnc'

  // ── Coherent PBR palette ─────────────────────────────────────────
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe8e9ea, metalness: 0.18, roughness: 0.44 })
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x333a3e, metalness: 0.62, roughness: 0.34 })
  const chamberMat = new THREE.MeshStandardMaterial({ color: 0x181b1d, metalness: 0.22, roughness: 0.82 })
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x2a3a44, metalness: 0.72, roughness: 0.12, transparent: true, opacity: 0.42,
  })
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x2a2f33, metalness: 0.34, roughness: 0.5 })
  const hazardMat = new THREE.MeshStandardMaterial({ color: 0xd6a400, metalness: 0.2, roughness: 0.6 })
  const rubberMat = new THREE.MeshStandardMaterial({ color: 0x1c1f21, metalness: 0.05, roughness: 0.92 })
  const steelMat = new THREE.MeshStandardMaterial({ color: 0xaeb6bc, metalness: 0.85, roughness: 0.22 })
  const screenMat = new THREE.MeshStandardMaterial({ color: 0x002211, emissive: 0x002211, emissiveIntensity: 0.5 })
  const coolantMat = new THREE.MeshStandardMaterial({ color: 0x2f6f8f, emissive: 0x0b2533, emissiveIntensity: 0.35 })

  // ── Main body ────────────────────────────────────────────────────
  const bodyW = 2.0, bodyH = 2.2, bodyD = 1.6
  const body = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, bodyD), bodyMat)
  body.position.set(0, bodyH / 2, 0)
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  const top = new THREE.Mesh(new THREE.BoxGeometry(bodyW + 0.06, 0.12, bodyD + 0.06), trimMat)
  top.position.set(0, bodyH + 0.06, 0)
  top.castShadow = true
  group.add(top)

  const base = new THREE.Mesh(new THREE.BoxGeometry(bodyW + 0.1, 0.1, bodyD + 0.1), trimMat)
  base.position.set(0, 0.05, 0)
  base.castShadow = true
  group.add(base)

  // Warning stripe along the base front makes access boundaries legible.
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(bodyW + 0.1, 0.05, 0.02), hazardMat)
  stripe.name = 'marking:warning-stripe'
  stripe.position.set(0, 0.14, bodyD / 2 + 0.06)
  group.add(stripe)

  // ── Front door and chamber ───────────────────────────────────────
  const doorW = 0.9, doorH = 1.0
  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.08, doorH + 0.08, 0.05), trimMat)
  doorFrame.position.set(0, 1.0, bodyD / 2 + 0.005)
  group.add(doorFrame)

  const door = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.02), glassMat)
  door.name = 'door:loading'
  door.userData.semanticId = 'door:loading'
  door.position.set(0, CNC_DOOR_REST_Y, bodyD / 2 + 0.02)
  group.add(door)

  const chamber = new THREE.Mesh(new THREE.BoxGeometry(doorW - 0.1, doorH - 0.1, 0.4), chamberMat)
  chamber.position.set(0, 1.0, bodyD / 2 - 0.22)
  group.add(chamber)

  // ── Spindle, fixture and feed axis ───────────────────────────────
  const spindle = new THREE.Group()
  spindle.name = 'spindle:main'
  spindle.userData.semanticId = 'spindle:main'
  spindle.position.set(0, 1.45, bodyD / 2 - 0.42)
  const spindleHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.32, 18), trimMat)
  spindleHousing.rotation.x = Math.PI / 2
  spindle.add(spindleHousing)
  const tool = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.02, 0.22, 12), steelMat)
  tool.rotation.x = Math.PI / 2
  tool.position.z = 0.19
  spindle.add(tool)
  group.add(spindle)

  const feedTable = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.34), steelMat)
  feedTable.name = 'axis:feed'
  feedTable.userData.semanticId = 'axis:feed'
  feedTable.position.set(0, 0.72, bodyD / 2 - 0.39)
  feedTable.castShadow = true
  group.add(feedTable)

  const chuck = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.1, 16), trimMat)
  chuck.name = 'fixture:chuck'
  chuck.userData.semanticId = 'fixture:chuck'
  chuck.rotation.x = Math.PI / 2
  chuck.position.set(0, 0.72, bodyD / 2 - 0.39)
  group.add(chuck)

  // Two jaws translate inward/outward to visualise clamp/unclamp honestly.
  const jawLeft = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.16), steelMat)
  jawLeft.name = 'fixture:jaw-left'
  jawLeft.userData.semanticId = 'fixture:jaw-left'
  jawLeft.position.set(-0.22, 0.72, bodyD / 2 - 0.39)
  group.add(jawLeft)
  const jawRight = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.16), steelMat)
  jawRight.name = 'fixture:jaw-right'
  jawRight.userData.semanticId = 'fixture:jaw-right'
  jawRight.position.set(0.22, 0.72, bodyD / 2 - 0.39)
  group.add(jawRight)

  // Simulated coolant nozzle; only its indicator is state-driven.
  const coolant = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 8), coolantMat)
  coolant.name = 'coolant:nozzle'
  coolant.position.set(0.2, 1.28, bodyD / 2 - 0.3)
  group.add(coolant)

  // ── Control panel ────────────────────────────────────────────────
  const panelGroup = new THREE.Group()
  panelGroup.position.set(bodyW / 2 + 0.02, 1.5, bodyD / 2 - 0.3)
  panelGroup.rotation.y = -Math.PI / 8
  panelGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.35), panelMat))

  const panelScreen = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.28, 0.22), screenMat)
  panelScreen.name = 'signal:panel-screen'
  panelScreen.position.set(0.03, 0.05, 0)
  panelGroup.add(panelScreen)

  const estopBase = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 16), hazardMat)
  estopBase.rotation.z = Math.PI / 2
  estopBase.position.set(0.045, -0.16, 0.1)
  panelGroup.add(estopBase)
  const estop = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.03, 16),
    new THREE.MeshStandardMaterial({ color: 0xd64040, emissive: 0x3a0a0a, emissiveIntensity: 0.5, metalness: 0.2, roughness: 0.5 }),
  )
  estop.name = 'safety:emergency-stop'
  estop.rotation.z = Math.PI / 2
  estop.position.set(0.06, -0.16, 0.1)
  panelGroup.add(estop)
  group.add(panelGroup)

  const label = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.09, 0.01), strokeMaterial(0xf4f6f7))
  label.name = 'label:equipment'
  label.position.set(-0.5, 1.9, bodyD / 2 + 0.005)
  group.add(label)

  // ── Stack light (green / amber / red, individually driven) ───────
  const stackLightGreen = stackLamp(0x1fa85a)
  stackLightGreen.name = 'signal:stack-light'
  stackLightGreen.userData.semanticId = 'signal:stack-light'
  stackLightGreen.position.set(0, bodyH + 0.15, 0)
  group.add(stackLightGreen)
  const stackLightAmber = stackLamp(0xd6a400)
  stackLightAmber.name = 'signal:stack-light-amber'
  stackLightAmber.position.set(0.14, bodyH + 0.15, 0)
  group.add(stackLightAmber)
  const stackLightRed = stackLamp(0xd64040)
  stackLightRed.name = 'signal:stack-light-red'
  stackLightRed.position.set(-0.14, bodyH + 0.15, 0)
  group.add(stackLightRed)

  // ── Side vents and chip tray ─────────────────────────────────────
  for (let index = 0; index < 5; index += 1) {
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.5), steelMat)
    vent.position.set(-bodyW / 2 - 0.005, 1.2 + index * 0.1, 0)
    group.add(vent)
  }
  const tray = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.2), rubberMat)
  tray.position.set(0, 0.13, bodyD / 2 + 0.12)
  tray.castShadow = true
  group.add(tray)

  const nodes: CncMachineVisualNodes = {
    door, spindle, chuck, jawLeft, jawRight, feedTable, panelScreen,
    stackLight: stackLightGreen, stackLightGreen, stackLightAmber, stackLightRed,
  }

  const apply = (state: CncMachineVisualState): void => {
    const progress = clamp01(state.doorPosition)
    door.position.y = CNC_DOOR_REST_Y + progress * CNC_DOOR_TRAVEL_Y

    // Jaws close onto the part when clamped; clamped travel is 0.05 m per side.
    const jawOffset = state.fixtureClamped ? 0.05 : 0.22
    jawLeft.position.x = -jawOffset
    jawRight.position.x = jawOffset

    // Feed table advances toward the spindle only while feeding.
    feedTable.position.z = (bodyD / 2 - 0.39) + (state.feedActive ? 0.03 : 0)

    setLamp(stackLightGreen, state.online && state.coarseState === 'IDLE', 0x1fa85a)
    setLamp(stackLightAmber, state.online && (state.coarseState === 'LOADING' || state.coarseState === 'UNLOADING'), 0xd6a400)
    setLamp(stackLightRed, state.online && state.coarseState === 'MACHINING', 0xd64040)

    const screenColor = state.online
      ? (state.coarseState === 'MACHINING' ? 0x1f6f3a : state.coarseState === 'IDLE' ? 0x003322 : 0x4a3a06)
      : 0x14181b
    screenMat.color.set(screenColor)
    screenMat.emissive.set(screenColor)

    coolantMat.emissiveIntensity = state.coolantOn ? 0.9 : 0.2
    spindle.rotation.z += Math.min(state.spindleSpeed, NOMINAL_RPM) / NOMINAL_RPM * 0.6
    if (spindle.rotation.z > Math.PI * 2) spindle.rotation.z -= Math.PI * 2
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

  // Initial deterministic visual state: closed door, open jaws, idle lamps.
  apply({
    doorPosition: 0, fixtureClamped: false, spindleSpeed: 0, spindleAtSpeed: false,
    feedActive: false, coolantOn: false, coarseState: 'IDLE', online: true,
  })

  return { group, nodes, apply, dispose }
}

function stackLamp(color: number): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.045, 0.11, 16),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, metalness: 0.1, roughness: 0.35 }),
  )
}

function strokeMaterial(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, metalness: 0.1, roughness: 0.7 })
}

function setLamp(mesh: THREE.Mesh, on: boolean, color: number): void {
  const material = mesh.material as THREE.MeshStandardMaterial
  material.color.set(on ? color : 0x2c3236)
  material.emissive.set(on ? color : 0x0a0c0d)
  material.emissiveIntensity = on ? 0.7 : 0.1
}

function clamp01(value: number): number {
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}
