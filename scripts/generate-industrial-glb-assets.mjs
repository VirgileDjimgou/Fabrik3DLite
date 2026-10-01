/*
 * Reproducibly generates the small, license-safe GLB source assets used by
 * S22. Run from repository root: npm run assets:generate.
 *
 * These are intentionally generic industrial assets, not OEM reproductions.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import * as THREE from '../Fabrik3D/fabrik3d.client/node_modules/three/build/three.module.js'
import { GLTFExporter } from '../Fabrik3D/fabrik3d.client/node_modules/three/examples/jsm/exporters/GLTFExporter.js'

class NodeFileReader {
  result = null
  onloadend = null
  onerror = null

  readAsArrayBuffer(blob) {
    blob.arrayBuffer()
      .then((result) => {
        this.result = result
        this.onloadend?.({ target: this })
      })
      .catch((error) => this.onerror?.(error))
  }
}

if (!globalThis.FileReader) globalThis.FileReader = NodeFileReader

const root = process.cwd()
const publicRoot = path.join(root, 'Fabrik3D', 'fabrik3d.client', 'public', 'assets', 'equipment')
const steel = new THREE.MeshStandardMaterial({ color: 0x39424b, metalness: 0.78, roughness: 0.33 })
const darkSteel = new THREE.MeshStandardMaterial({ color: 0x15191d, metalness: 0.72, roughness: 0.28 })
const beltRubber = new THREE.MeshStandardMaterial({ color: 0x181b1f, metalness: 0.08, roughness: 0.78 })
const safetyYellow = new THREE.MeshStandardMaterial({ color: 0xd69b00, metalness: 0.18, roughness: 0.48 })
const sensorGreen = new THREE.MeshStandardMaterial({ color: 0x1fa653, emissive: 0x083b19, emissiveIntensity: 0.45, roughness: 0.35 })
const palletBlue = new THREE.MeshStandardMaterial({ color: 0x27557a, metalness: 0.42, roughness: 0.46 })
const robotPaint = new THREE.MeshStandardMaterial({ color: 0xf06a19, metalness: 0.48, roughness: 0.3 })
const robotLightPaint = new THREE.MeshStandardMaterial({ color: 0xf18a32, metalness: 0.42, roughness: 0.34 })
const labelWhite = new THREE.MeshStandardMaterial({ color: 0xe7edf2, metalness: 0.1, roughness: 0.5 })

// ── S55 hero-cell palette ─────────────────────────────────────────
// Conservative, reusable PBR values shared by the generated hero CNC machine
// and its surrounding cell dressing. Hex values are also documented in
// docs/architecture/HERO_REFERENCE_CELL.md so the contract is reviewable.
const machineBody = new THREE.MeshStandardMaterial({ color: 0xe8e9ea, metalness: 0.18, roughness: 0.44 })
const machineTrim = new THREE.MeshStandardMaterial({ color: 0x333a3e, metalness: 0.62, roughness: 0.34 })
const machineChamber = new THREE.MeshStandardMaterial({ color: 0x181b1d, metalness: 0.22, roughness: 0.82 })
const machineGlass = new THREE.MeshStandardMaterial({ color: 0x2a3a44, metalness: 0.72, roughness: 0.12, transparent: true, opacity: 0.42 })
const panelDark = new THREE.MeshStandardMaterial({ color: 0x2a2f33, metalness: 0.34, roughness: 0.5 })
const hazard = new THREE.MeshStandardMaterial({ color: 0xd6a400, metalness: 0.2, roughness: 0.6 })
const rubber = new THREE.MeshStandardMaterial({ color: 0x1c1f21, metalness: 0.05, roughness: 0.92 })
const stainless = new THREE.MeshStandardMaterial({ color: 0xaeb6bc, metalness: 0.85, roughness: 0.22 })
const screenGreen = new THREE.MeshStandardMaterial({ color: 0x002211, emissive: 0x002211, emissiveIntensity: 0.5, metalness: 0.1, roughness: 0.5 })
const coolantBlue = new THREE.MeshStandardMaterial({ color: 0x2f6f8f, emissive: 0x0b2533, emissiveIntensity: 0.35, metalness: 0.3, roughness: 0.4 })
const cabinetPaint = new THREE.MeshStandardMaterial({ color: 0x52616a, metalness: 0.45, roughness: 0.5 })
const guardMesh = new THREE.MeshStandardMaterial({ color: 0x6d7780, metalness: 0.35, roughness: 0.5 })
const concrete = new THREE.MeshStandardMaterial({ color: 0x596064, metalness: 0.02, roughness: 0.96 })
const workLight = new THREE.MeshStandardMaterial({ color: 0xf6f3e6, emissive: 0xf6f3e6, emissiveIntensity: 0.85, metalness: 0.1, roughness: 0.4 })
const signalRed = new THREE.MeshStandardMaterial({ color: 0xd64040, emissive: 0x3a0a0a, emissiveIntensity: 0.5, metalness: 0.2, roughness: 0.5 })
const rackBlue = new THREE.MeshStandardMaterial({ color: 0x27557a, metalness: 0.42, roughness: 0.46 })

function mesh(group, name, geometry, material, position = [0, 0, 0], rotation = [0, 0, 0]) {
  const value = new THREE.Mesh(geometry, material)
  value.name = name
  value.userData.semanticId = name
  value.position.set(...position)
  value.rotation.set(...rotation)
  value.castShadow = true
  value.receiveShadow = true
  group.add(value)
  return value
}

function group(parent, name) {
  const value = new THREE.Group()
  value.name = name
  value.userData.semanticId = name
  parent.add(value)
  return value
}

function conveyor(low = false) {
  const rootGroup = new THREE.Group()
  rootGroup.name = 'equipment-root'
  const length = 6
  const beltWidth = 0.60
  const surfaceY = 0.64
  const frame = group(rootGroup, 'frame:main')
  const half = length / 2

  for (const z of [-0.37, 0.37]) {
    mesh(frame, `frame:rail:${z}`, new THREE.BoxGeometry(length, 0.08, 0.05), steel, [0, 0.54, z])
    mesh(frame, `guard:rail:${z}`, new THREE.BoxGeometry(length, 0.12, 0.025), safetyYellow, [0, 0.70, z])
  }
  for (const x of (low ? [-2.5, 0, 2.5] : [-2.7, -0.9, 0.9, 2.7])) {
    for (const z of [-0.34, 0.34]) {
      mesh(frame, `leg:${x}:${z}`, new THREE.BoxGeometry(0.07, 0.53, 0.07), steel, [x, 0.265, z])
      mesh(frame, `foot:${x}:${z}`, new THREE.CylinderGeometry(0.07, 0.07, 0.015, 12), darkSteel, [x, 0.008, z])
    }
    mesh(frame, `crossmember:${x}`, new THREE.BoxGeometry(0.06, 0.06, 0.72), steel, [x, 0.48, 0])
  }

  const rollers = group(rootGroup, 'rollers')
  const rollerGeometry = new THREE.CylinderGeometry(0.047, 0.047, beltWidth, 12)
  rollerGeometry.rotateX(Math.PI / 2)
  const rollerCount = low ? 10 : 30
  for (let index = 0; index < rollerCount; index += 1) {
    const x = -2.85 + index * (5.7 / (rollerCount - 1))
    mesh(rollers, `roller:${index}`, rollerGeometry, darkSteel, [x, 0.586, 0])
  }

  const segments = group(rootGroup, 'belt:segments')
  const segmentCount = low ? 16 : 48
  for (let index = 0; index < segmentCount; index += 1) {
    const x = -2.94 + index * (5.88 / (segmentCount - 1))
    mesh(segments, `belt:segment:${index}`, new THREE.BoxGeometry(0.13, 0.012, beltWidth), beltRubber, [x, surfaceY, 0])
  }

  const drive = group(rootGroup, 'motor:main')
  mesh(drive, 'motor:body', new THREE.CylinderGeometry(0.12, 0.12, 0.34, 16), steel, [-2.84, 0.47, -0.52], [Math.PI / 2, 0, 0])
  mesh(drive, 'motor:gearbox', new THREE.BoxGeometry(0.18, 0.18, 0.16), darkSteel, [-2.84, 0.52, -0.39])
  for (const z of low ? [-0.37] : [-0.37, 0.37]) {
    mesh(rootGroup, `tensioner:${z}`, new THREE.CylinderGeometry(0.025, 0.025, 0.26, 10), steel, [2.93, 0.55, z], [0, 0, Math.PI / 2])
  }
  mesh(rootGroup, 'stop:robot-side', new THREE.BoxGeometry(0.08, 0.15, 0.62), safetyYellow, [0.36, 0.72, 0])

  for (const [id, x] of (low ? [['sensor:station', 0.0]] : [['sensor:infeed', -1.1], ['sensor:station', 0.0], ['sensor:outfeed', 1.5]])) {
    const sensor = group(rootGroup, id)
    mesh(sensor, `${id}:body`, new THREE.BoxGeometry(0.05, 0.11, 0.05), darkSteel, [x, 0.74, 0.39])
    mesh(sensor, `${id}:lens`, new THREE.SphereGeometry(0.018, 10, 8), sensorGreen, [x, 0.77, 0.36])
  }
  const inAnchor = group(rootGroup, 'anchor:material.in')
  inAnchor.position.set(-3, surfaceY, 0)
  const outAnchor = group(rootGroup, 'anchor:material.out')
  outAnchor.position.set(3, surfaceY, 0)
  return rootGroup
}

function palletStation(low = false) {
  const rootGroup = new THREE.Group()
  rootGroup.name = 'equipment-root'
  mesh(rootGroup, 'pallet:base', new THREE.BoxGeometry(0.60, 0.05, 0.60), palletBlue, [0, 0.025, 0])
  mesh(rootGroup, 'pallet:tray', new THREE.BoxGeometry(0.57, 0.025, 0.57), steel, [0, 0.0625, 0])
  for (const z of [-0.18, 0, 0.18]) mesh(rootGroup, `pallet:runner:${z}`, new THREE.BoxGeometry(0.56, 0.018, 0.05), darkSteel, [0, 0.009, z])
  for (const [w, d, x, z, name] of [
    [0.54, 0.02, 0, 0.27, 'rim:north'], [0.54, 0.02, 0, -0.27, 'rim:south'],
    [0.02, 0.54, 0.27, 0, 'rim:east'], [0.02, 0.54, -0.27, 0, 'rim:west'],
  ]) mesh(rootGroup, name, new THREE.BoxGeometry(w, 0.025, d), steel, [x, 0.0875, z])

  for (const [index, x, z] of (low ? [[1, -0.21, -0.21], [4, 0.21, 0.21]] : [[1, -0.21, -0.21], [2, 0.21, -0.21], [3, -0.21, 0.21], [4, 0.21, 0.21]])) {
    mesh(rootGroup, `fixture:locator:${index}`, new THREE.CylinderGeometry(0.018, 0.018, 0.045, 12), safetyYellow, [x, 0.11, z])
  }
  for (const [index, x, z, rotation] of (low ? [[1, -0.28, 0, 0], [2, 0.28, 0, 0]] : [[1, -0.28, 0, 0], [2, 0.28, 0, 0], [3, 0, -0.28, Math.PI / 2], [4, 0, 0.28, Math.PI / 2]])) {
    const clamp = group(rootGroup, `fixture:clamp:${index}`)
    mesh(clamp, `fixture:clamp-arm:${index}`, new THREE.BoxGeometry(0.09, 0.035, 0.035), darkSteel, [x, 0.12, z], [0, rotation, 0])
  }
  const sensor = group(rootGroup, 'sensor:presence')
  mesh(sensor, 'sensor:presence:body', new THREE.BoxGeometry(0.05, 0.09, 0.05), darkSteel, [0.31, 0.12, -0.22])
  mesh(sensor, 'sensor:presence:lens', new THREE.SphereGeometry(0.016, 10, 8), sensorGreen, [0.285, 0.14, -0.22])
  const grasp = group(rootGroup, 'anchor:robot.grasp')
  grasp.position.set(0, 0.12, 0)
  return rootGroup
}

// The pivot chain deliberately mirrors IndustrialRobot and the shared
// kinematics model. Meshes are generic industrial geometry, while the six
// semantic pivots are the stable contract used by RobotVisualBinding.
function professionalRobot(profile, low = false) {
  const rootGroup = new THREE.Group()
  rootGroup.name = 'equipment-root'
  rootGroup.userData.semanticId = 'equipment-root'
  rootGroup.scale.setScalar(profile.scale)
  const d = profile
  const base = group(rootGroup, 'frame:base')
  mesh(base, 'base:plate', new THREE.CylinderGeometry(0.55, 0.62, 0.06, 32), darkSteel, [0, 0.03, 0])
  mesh(base, 'base:pedestal', new THREE.CylinderGeometry(0.46, 0.5, 0.28, 32), robotPaint, [0, 0.17, 0])
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2
    mesh(base, `base:bolt:${index}`, new THREE.CylinderGeometry(0.025, 0.025, 0.025, 10), steel, [Math.cos(angle) * 0.48, 0.075, Math.sin(angle) * 0.48])
  }

  const j1 = group(rootGroup, 'joint:j1'); j1.position.set(0, d.baseHeight, 0)
  mesh(j1, 'joint-cover:j1', new THREE.CylinderGeometry(0.38, 0.42, 0.13, 28), robotLightPaint, [0, 0.02, 0])
  const j2 = group(j1, 'joint:j2'); j2.position.set(0, d.shoulderHeight, 0)
  mesh(j1, 'link:shoulder', new THREE.CylinderGeometry(0.3, 0.3, d.shoulderHeight * 0.88, 24), robotPaint, [0, d.shoulderHeight * 0.44, 0])
  mesh(j1, 'motor:j2', new THREE.CylinderGeometry(0.14, 0.14, 0.2, 16), darkSteel, [0.31, d.shoulderHeight * 0.7, 0], [0, 0, Math.PI / 2])
  mesh(j2, 'joint-cover:j2', new THREE.SphereGeometry(0.22, 20, 14), darkSteel)

  const j3 = group(j2, 'joint:j3'); j3.position.set(0, d.upperArmLength, 0)
  mesh(j2, 'link:upper-arm', new THREE.BoxGeometry(0.26, d.upperArmLength, 0.28), robotPaint, [0, d.upperArmLength / 2, 0])
  mesh(j2, 'link:upper-arm-panel', new THREE.BoxGeometry(0.275, d.upperArmLength * 0.72, 0.025), robotLightPaint, [0, d.upperArmLength * 0.52, 0.153])
  mesh(j2, 'motor:j3', new THREE.CylinderGeometry(0.125, 0.125, 0.18, 16), darkSteel, [-0.25, d.upperArmLength * 0.84, 0], [0, 0, Math.PI / 2])
  mesh(j3, 'joint-cover:j3', new THREE.CylinderGeometry(0.19, 0.22, 0.13, 18), darkSteel, [0, 0, 0], [Math.PI / 2, 0, 0])

  const j4 = group(j3, 'joint:j4'); j4.position.set(0, d.forearmLength, 0)
  mesh(j3, 'link:forearm', new THREE.BoxGeometry(0.21, d.forearmLength, 0.23), robotPaint, [0, d.forearmLength / 2, 0])
  mesh(j3, 'cable:external', new THREE.CylinderGeometry(0.025, 0.025, d.forearmLength * 0.82, 10), darkSteel, [0.15, d.forearmLength * 0.47, 0.12])
  mesh(j4, 'joint-cover:j4', new THREE.CylinderGeometry(0.14, 0.14, 0.23, 18), robotLightPaint, [0, 0, 0], [0, 0, Math.PI / 2])

  const j5 = group(j4, 'joint:j5')
  mesh(j5, 'joint-cover:j5', new THREE.SphereGeometry(0.13, 16, 12), darkSteel, [0, 0.08, 0])
  const j6 = group(j5, 'joint:j6'); j6.position.set(0, d.wristLength, 0)
  mesh(j6, 'joint-cover:j6', new THREE.CylinderGeometry(0.1, 0.1, 0.14, 16), robotLightPaint, [0, 0.02, 0], [0, 0, Math.PI / 2])
  const flange = group(j6, 'tool:flange'); flange.position.set(0, 0.09, 0)
  mesh(flange, 'flange:iso-50', new THREE.CylinderGeometry(0.085, 0.085, 0.035, 20), steel, [0, 0.017, 0])
  for (let index = 0; index < 6; index += 1) {
    const angle = (index / 6) * Math.PI * 2
    mesh(flange, `flange:bolt:${index}`, new THREE.CylinderGeometry(0.008, 0.008, 0.015, 8), darkSteel, [Math.cos(angle) * 0.057, 0.04, Math.sin(angle) * 0.057])
  }
  const tcp = group(flange, 'tool:tcp'); tcp.position.set(0, 0.06, 0)
  if (!low) {
    mesh(j1, 'label:axis-1', new THREE.BoxGeometry(0.08, 0.045, 0.005), labelWhite, [0.42, 0.02, 0])
    mesh(j2, 'label:warning', new THREE.BoxGeometry(0.1, 0.06, 0.006), safetyYellow, [0, 0.12, 0.225])
  }
  return rootGroup
}

// ── S55 flagship CNC machining centre ──────────────────────────────
// Geometry and semantic-node contract intentionally mirror
// src/equipment/visuals/cncMachineVisual.ts. A test asserts node-id parity so
// the generated GLB can never silently drift from the runtime binding.
function heroCncMachine(low = false) {
  const rootGroup = new THREE.Group()
  rootGroup.name = 'equipment-root'
  rootGroup.userData.semanticId = 'equipment:cnc'

  const bodyW = 2.0, bodyH = 2.2, bodyD = 1.6
  mesh(rootGroup, 'machine:body', new THREE.BoxGeometry(bodyW, bodyH, bodyD), machineBody, [0, bodyH / 2, 0])
  mesh(rootGroup, 'machine:roof', new THREE.BoxGeometry(bodyW + 0.06, 0.12, bodyD + 0.06), machineTrim, [0, bodyH + 0.06, 0])
  mesh(rootGroup, 'machine:plinth', new THREE.BoxGeometry(bodyW + 0.1, 0.1, bodyD + 0.1), machineTrim, [0, 0.05, 0])
  mesh(rootGroup, 'marking:warning-stripe', new THREE.BoxGeometry(bodyW + 0.1, 0.05, 0.02), hazard, [0, 0.14, bodyD / 2 + 0.06])

  const doorW = 0.9, doorH = 1.0
  mesh(rootGroup, 'door:frame', new THREE.BoxGeometry(doorW + 0.08, doorH + 0.08, 0.05), machineTrim, [0, 1.0, bodyD / 2 + 0.005])
  const door = mesh(rootGroup, 'door:loading', new THREE.BoxGeometry(doorW, doorH, 0.02), machineGlass, [0, 1.0, bodyD / 2 + 0.02])
  mesh(rootGroup, 'chamber:interior', new THREE.BoxGeometry(doorW - 0.1, doorH - 0.1, 0.4), machineChamber, [0, 1.0, bodyD / 2 - 0.22])
  if (!low) mesh(rootGroup, 'door:handle', new THREE.BoxGeometry(0.05, 0.28, 0.03), stainless, [0.4, 1.0, bodyD / 2 + 0.045])

  const spindle = group(rootGroup, 'spindle:main')
  spindle.position.set(0, 1.45, bodyD / 2 - 0.42)
  const spindleHousing = mesh(spindle, 'spindle:housing', new THREE.CylinderGeometry(0.13, 0.16, 0.32, low ? 10 : 18), machineTrim)
  spindleHousing.rotation.x = Math.PI / 2
  const spindleTool = mesh(spindle, 'spindle:tool', new THREE.CylinderGeometry(0.035, 0.02, 0.22, low ? 8 : 12), stainless)
  spindleTool.rotation.x = Math.PI / 2
  spindleTool.position.z = 0.19

  const feedTable = mesh(rootGroup, 'axis:feed', new THREE.BoxGeometry(0.46, 0.06, 0.34), stainless, [0, 0.72, bodyD / 2 - 0.39])
  const chuck = mesh(rootGroup, 'fixture:chuck', new THREE.CylinderGeometry(0.19, 0.19, 0.1, low ? 10 : 16), machineTrim, [0, 0.72, bodyD / 2 - 0.39])
  chuck.rotation.x = Math.PI / 2
  const jawLeft = mesh(rootGroup, 'fixture:jaw-left', new THREE.BoxGeometry(0.07, 0.09, 0.16), stainless, [-0.22, 0.72, bodyD / 2 - 0.39])
  const jawRight = mesh(rootGroup, 'fixture:jaw-right', new THREE.BoxGeometry(0.07, 0.09, 0.16), stainless, [0.22, 0.72, bodyD / 2 - 0.39])

  const coolant = mesh(rootGroup, 'coolant:nozzle', new THREE.CylinderGeometry(0.012, 0.012, 0.14, 8), coolantBlue, [0.2, 1.28, bodyD / 2 - 0.3])

  const panelGroup = group(rootGroup, 'panel:control')
  panelGroup.position.set(bodyW / 2 + 0.02, 1.5, bodyD / 2 - 0.3)
  panelGroup.rotation.y = -Math.PI / 8
  mesh(panelGroup, 'panel:body', new THREE.BoxGeometry(0.05, 0.5, 0.35), panelDark)
  const panelScreen = mesh(panelGroup, 'signal:panel-screen', new THREE.BoxGeometry(0.01, 0.28, 0.22), screenGreen, [0.03, 0.05, 0])
  mesh(panelGroup, 'safety:emergency-stop-base', new THREE.CylinderGeometry(0.045, 0.045, 0.02, 16), hazard, [0.045, -0.16, 0.1], [0, 0, Math.PI / 2])
  const estop = mesh(panelGroup, 'safety:emergency-stop', new THREE.CylinderGeometry(0.03, 0.03, 0.03, 16), signalRed, [0.06, -0.16, 0.1], [0, 0, Math.PI / 2])
  estop.name = 'safety:emergency-stop'

  mesh(rootGroup, 'label:equipment', new THREE.BoxGeometry(0.5, 0.09, 0.01), labelWhite, [-0.5, 1.9, bodyD / 2 + 0.005])

  const stackLightGreen = mesh(rootGroup, 'signal:stack-light', new THREE.CylinderGeometry(0.045, 0.045, 0.11, 16), new THREE.MeshStandardMaterial({ color: 0x1fa85a, emissive: 0x1fa85a, emissiveIntensity: 0.5, metalness: 0.1, roughness: 0.35 }), [0, bodyH + 0.15, 0])
  mesh(rootGroup, 'signal:stack-light-amber', new THREE.CylinderGeometry(0.045, 0.045, 0.11, 16), new THREE.MeshStandardMaterial({ color: 0xd6a400, emissive: 0xd6a400, emissiveIntensity: 0.5, metalness: 0.1, roughness: 0.35 }), [0.14, bodyH + 0.15, 0])
  mesh(rootGroup, 'signal:stack-light-red', new THREE.CylinderGeometry(0.045, 0.045, 0.11, 16), new THREE.MeshStandardMaterial({ color: 0xd64040, emissive: 0xd64040, emissiveIntensity: 0.5, metalness: 0.1, roughness: 0.35 }), [-0.14, bodyH + 0.15, 0])

  const ventCount = low ? 2 : 5
  for (let index = 0; index < ventCount; index += 1) {
    mesh(rootGroup, `machine:vent:${index}`, new THREE.BoxGeometry(0.03, 0.04, 0.5), stainless, [-bodyW / 2 - 0.005, 1.2 + index * 0.1, 0])
  }
  mesh(rootGroup, 'machine:chip-tray', new THREE.BoxGeometry(0.7, 0.06, 0.2), rubber, [0, 0.13, bodyD / 2 + 0.12])

  if (!low) {
    // Hero detailing: way covers, an operator-side work light, leveling feet,
    // a coolant return and a chip auger housing. Render-only, no runtime role.
    mesh(rootGroup, 'machine:way-cover-left', new THREE.BoxGeometry(0.3, 0.08, 0.5), machineTrim, [-0.35, 0.78, bodyD / 2 - 0.05])
    mesh(rootGroup, 'machine:way-cover-right', new THREE.BoxGeometry(0.3, 0.08, 0.5), machineTrim, [0.35, 0.78, bodyD / 2 - 0.05])
    mesh(rootGroup, 'machine:work-light', new THREE.BoxGeometry(0.5, 0.04, 0.16), workLight, [0, bodyH - 0.02, bodyD / 2 - 0.12])
    mesh(rootGroup, 'machine:coolant-return', new THREE.CylinderGeometry(0.03, 0.03, 1.1, 8), coolantBlue, [-bodyW / 2 - 0.04, 0.55, 0.3])
    for (const x of [-0.75, 0.75]) for (const z of [-0.6, 0.6]) {
      mesh(rootGroup, `machine:foot:${x}:${z}`, new THREE.CylinderGeometry(0.05, 0.05, 0.06, 10), machineTrim, [x, 0.03, z])
    }
  }

  return rootGroup
}

// ── S55 hero-cell dressing ─────────────────────────────────────────
// Additive industrial environment detail (chip handling, work-in-process
// buffering, work lighting, cable drops and cell bollards). It is deliberately
// render-only and never a collision authority.
function heroCellDressing(low = false) {
  const rootGroup = new THREE.Group()
  rootGroup.name = 'equipment-root'
  rootGroup.userData.semanticId = 'equipment:cell-dressing'

  // Chip conveyor and coolant tank attached to the CNC right side.
  const chip = group(rootGroup, 'motor:chip-conveyor')
  chip.position.set(1.42, 0, 3.4)
  mesh(chip, 'chip:body', new THREE.BoxGeometry(0.6, 0.34, 2.2), machineTrim, [0, 0.5, 0])
  mesh(chip, 'chip:auger', new THREE.CylinderGeometry(0.08, 0.08, 2.0, low ? 8 : 12), stainless, [0, 0.5, 0], [Math.PI / 2, 0, 0])
  mesh(chip, 'chip:hatch', new THREE.BoxGeometry(0.02, 0.2, 0.3), hazard, [0.31, 0.6, -0.8])
  mesh(rootGroup, 'chip:coolant-tank', new THREE.BoxGeometry(0.72, 0.5, 0.9), coolantBlue, [1.42, 0.28, 2.2])
  mesh(rootGroup, 'chip:bin', new THREE.BoxGeometry(0.6, 0.62, 0.5), rubber, [-1.65, 0.31, 3.4])

  // Work-in-process buffer racks on the operator side, outside the robot reach.
  for (const [index, z] of [[1, -0.45], [2, 0.75]]) {
    const rack = group(rootGroup, `fixture:buffer:${index}`)
    rack.position.set(3.55, 0, z)
    for (const [dx, dz] of [[-0.45, -0.3], [0.45, -0.3], [-0.45, 0.3], [0.45, 0.3]]) {
      mesh(rack, `buffer:${index}:post:${dx}:${dz}`, new THREE.BoxGeometry(0.06, 1.7, 0.06), rackBlue, [dx, 0.85, dz])
    }
    const shelves = low ? [0.45, 1.35] : [0.4, 0.8, 1.2, 1.6]
    for (const y of shelves) mesh(rack, `buffer:${index}:shelf:${y}`, new THREE.BoxGeometry(0.96, 0.04, 0.66), steel, [0, y, 0])
  }
  const bufferAnchor = group(rootGroup, 'anchor:buffer.access')
  bufferAnchor.position.set(3.0, 0.9, 0.15)

  // Overhead work lighting fixtures (emissive detail only; the renderer's
  // directional/hemisphere lighting remains authoritative).
  for (const [index, z] of [[1, 1.6], [2, -1.6]]) {
    const light = group(rootGroup, `signal:worklight:${index}`)
    light.position.set(0, 3.2, z)
    mesh(light, `worklight:${index}:frame`, new THREE.BoxGeometry(1.3, 0.05, 0.34), machineTrim, [0, 0, 0])
    mesh(light, `worklight:${index}:panel`, new THREE.BoxGeometry(1.2, 0.02, 0.26), workLight, [0, -0.04, 0])
  }

  // Cable drops from the existing machine-level tray down to the floor services.
  for (const [index, x] of [[1, -3.5], [2, 3.5]]) {
    mesh(rootGroup, `cable:drop:${index}`, new THREE.CylinderGeometry(0.03, 0.03, 2.35, 8), darkSteel, [x, 1.18, -3.25])
    mesh(rootGroup, `cable:drop:${index}:base`, new THREE.BoxGeometry(0.18, 0.08, 0.18), machineTrim, [x, 0.04, -3.25])
  }
  mesh(rootGroup, 'cable:conduit', new THREE.BoxGeometry(0.1, 0.1, 0.6), machineTrim, [3.6, 0.5, -2.95])

  // Cell bollards protect the operator access corridor without becoming an
  // analytic collision proxy.
  const bollardCount = low ? 2 : 4
  const bollards = [[-2.0, 1.4], [2.0, 1.4], [-3.3, -1.5], [3.3, -1.5]].slice(0, bollardCount)
  for (const [index, [x, z]] of bollards.entries()) {
    mesh(rootGroup, `bollard:${index}`, new THREE.CylinderGeometry(0.07, 0.08, 0.62, low ? 8 : 12), hazard, [x, 0.31, z])
    mesh(rootGroup, `bollard:${index}:cap`, new THREE.BoxGeometry(0.03, 0.03, 0.03), darkSteel, [x, 0.63, z])
  }

  return rootGroup
}

function sceneSemanticIds(scene) {
  const ids = new Set()
  const names = new Set()
  scene.traverse((node) => {
    if (typeof node.userData?.semanticId === 'string') ids.add(node.userData.semanticId)
    if (node.name) names.add(node.name)
  })
  return { ids, names }
}

function sceneTriangleCount(scene) {
  let triangles = 0
  scene.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return
    const position = node.geometry.getAttribute('position')
    const count = node.geometry.index?.count ?? position?.count ?? 0
    triangles += Math.floor(count / 3)
  })
  return triangles
}

/**
 * Reproducible generation-time validation. It refuses to write a package whose
 * declared semantic nodes, triangle budgets, license or (optionally) bounds do
 * not match the scene that is about to be exported.
 */
function validateScene(label, scene, manifest, options = {}) {
  const { ids, names } = sceneSemanticIds(scene)
  if (options.checkSemanticNodes !== false) {
    for (const node of manifest.semanticNodes ?? []) {
      if (!ids.has(node.id) && !names.has(node.id)) {
        throw new Error(`${manifest.id} ${label}: semantic node '${node.id}' is missing from the scene.`)
      }
    }
  }
  if (options.maxTriangles !== undefined) {
    const triangles = sceneTriangleCount(scene)
    if (triangles > options.maxTriangles) {
      throw new Error(`${manifest.id} ${label}: ${triangles} triangles exceed the ${options.maxTriangles} budget.`)
    }
  }
  if (options.enforceBounds) {
    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())
    const declared = manifest.boundsMeters
    const exceeds = (measured, allowed) => measured > allowed + 0.06
    if (exceeds(size.x, declared.x) || exceeds(size.y, declared.y) || exceeds(size.z, declared.z)) {
      throw new Error(`${manifest.id} ${label}: measured bounds ${size.x.toFixed(3)}x${size.y.toFixed(3)}x${size.z.toFixed(3)} exceed declared ${declared.x}x${declared.y}x${declared.z}.`)
    }
  }
  if (!manifest.license?.name?.trim()) throw new Error(`${manifest.id} ${label}: license metadata is required.`)
  if (manifest.robotRig) {
    const expected = ['joint:j1', 'joint:j2', 'joint:j3', 'joint:j4', 'joint:j5', 'joint:j6']
    for (const [index, joint] of expected.entries()) {
      if (!ids.has(joint) && !names.has(joint)) throw new Error(`${manifest.id} ${label}: robot pivot '${joint}' is missing.`)
      if (index > 0 && !(ids.has(joint) || names.has(joint))) throw new Error(`${manifest.id} ${label}: robot pivot chain is incomplete.`)
    }
  }
}

async function exportScene(scene, output) {
  const exporter = new GLTFExporter()
  const glb = await new Promise((resolve, reject) => {
    exporter.parse(scene, resolve, reject, { binary: true, onlyVisible: false })
  })
  await fs.mkdir(path.dirname(output), { recursive: true })
  await fs.writeFile(output, Buffer.from(glb))
  return (await import('node:crypto')).createHash('sha256').update(await fs.readFile(output)).digest('hex')
}

function thumbnail(id) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect fill="#19222b" width="640" height="360"/><rect x="80" y="145" width="480" height="70" rx="8" fill="#39424b"/><text x="320" y="105" fill="#f1f4f6" font-family="Arial" font-size="28" text-anchor="middle">${id}</text><text x="320" y="270" fill="#d69b00" font-family="Arial" font-size="18" text-anchor="middle">Fabrik3D generic industrial asset</text></svg>`
}

async function writeAsset(id, scene, lodScene, manifest, options = {}) {
  const target = path.join(publicRoot, id)
  await fs.mkdir(target, { recursive: true })
  const modelPath = path.join(target, 'model.glb')
  const lodPath = path.join(target, 'lod', 'lod1.glb')
  const thumbPath = path.join(target, 'thumbnail.svg')
  const hash = await exportScene(scene, modelPath)
  const lodHash = await exportScene(lodScene, lodPath)
  await fs.writeFile(thumbPath, thumbnail(id), 'utf8')
  const crypto = await import('node:crypto')
  const thumbHash = crypto.createHash('sha256').update(await fs.readFile(thumbPath)).digest('hex')
  const packageManifest = manifest({ hash, lodHash, thumbHash })
  validateScene('primary', scene, packageManifest, {
    ...options,
    maxTriangles: options.enforceBudgets === true ? options.maxPrimaryTriangles : undefined,
  })
  const lodBudget = packageManifest.visual.lods[0]?.triangleBudget
  validateScene('lod1', lodScene, packageManifest, {
    ...options,
    maxTriangles: options.enforceBudgets === true ? lodBudget : undefined,
    checkSemanticNodes: options.checkLodSemanticNodes === true,
  })
  await fs.writeFile(path.join(target, 'equipment.asset.json'), `${JSON.stringify(packageManifest, null, 2)}\n`, 'utf8')
  return { id, path: modelPath, hash, lodHash, thumbHash, bytes: (await fs.stat(modelPath)).size }
}

const results = await Promise.all([
  writeAsset('generic-conveyor-v1', conveyor(), conveyor(true), ({ hash, lodHash, thumbHash }) => ({
    schemaVersion: '1.0', id: 'generic-conveyor-v1', equipmentDefinitionId: 'belt-conveyor', category: 'conveyor', version: '1.0.0',
    coordinateSystem: { units: 'meters', upAxis: 'Y', handedness: 'right', origin: 'equipment-base' }, boundsMeters: { x: 6, y: 0.82, z: 0.76 },
    visual: { glb: { path: 'model.glb', sha256: hash }, lods: [{ id: 'lod1', glb: { path: 'lod/lod1.glb', sha256: lodHash }, triangleBudget: 2500 }] },
    collision: { id: 'conveyor-1', kind: 'box', dimensionsMeters: { x: 6, y: 0.64, z: 0.72 } },
    semanticNodes: [{ id: 'motor:main', kind: 'motor' }, { id: 'sensor:infeed', kind: 'sensor' }, { id: 'sensor:station', kind: 'sensor' }, { id: 'sensor:outfeed', kind: 'sensor' }, { id: 'anchor:material.in', kind: 'anchor' }, { id: 'anchor:material.out', kind: 'anchor' }],
    anchors: [{ id: 'anchor:material.in', transform: { frameId: 'equipment-base', position: { x: -3, y: 0.64, z: 0 }, rotation: { x: 0, y: 0, z: 0 } } }, { id: 'anchor:material.out', transform: { frameId: 'equipment-base', position: { x: 3, y: 0.64, z: 0 }, rotation: { x: 0, y: 0, z: 0 } } }],
    materials: ['painted-steel', 'dark-steel', 'belt-rubber', 'safety-yellow'], thumbnail: { path: 'thumbnail.svg', sha256: thumbHash }, license: { name: 'Fabrik3D generated generic asset; educational use' }, integrity: { path: 'model.glb', sha256: hash },
  })),
  writeAsset('generic-pallet-station-v1', palletStation(), palletStation(true), ({ hash, lodHash, thumbHash }) => ({
    schemaVersion: '1.0', id: 'generic-pallet-station-v1', equipmentDefinitionId: 'pallet-station', category: 'pallet-station', version: '1.0.0',
    coordinateSystem: { units: 'meters', upAxis: 'Y', handedness: 'right', origin: 'equipment-base' }, boundsMeters: { x: 0.6, y: 0.17, z: 0.6 },
    visual: { glb: { path: 'model.glb', sha256: hash }, lods: [{ id: 'lod1', glb: { path: 'lod/lod1.glb', sha256: lodHash }, triangleBudget: 700 }] },
    collision: { id: 'pallet-work-object', kind: 'box', dimensionsMeters: { x: 0.6, y: 0.087, z: 0.6 } },
    semanticNodes: [{ id: 'fixture:locator:1', kind: 'fixture' }, { id: 'fixture:clamp:1', kind: 'fixture' }, { id: 'sensor:presence', kind: 'sensor' }, { id: 'anchor:robot.grasp', kind: 'anchor' }],
    anchors: [{ id: 'anchor:robot.grasp', transform: { frameId: 'pallet', position: { x: 0, y: 0.12, z: 0 }, rotation: { x: 0, y: 0, z: 0 } } }],
    materials: ['pallet-blue', 'steel', 'locator-yellow'], thumbnail: { path: 'thumbnail.svg', sha256: thumbHash }, license: { name: 'Fabrik3D generated generic asset; educational use' }, integrity: { path: 'model.glb', sha256: hash },
  })),
  ...[
    ['compact', { scale: 0.8, baseHeight: 0.4, shoulderHeight: 0.4, upperArmLength: 0.7, forearmLength: 0.55, wristLength: 0.1 }, { x: 1.0, y: 1.7, z: 1.0 }],
    ['medium', { scale: 1.25, baseHeight: 0.4, shoulderHeight: 0.4, upperArmLength: 1.05, forearmLength: 0.88, wristLength: 0.1 }, { x: 1.55, y: 3.1, z: 1.55 }],
    ['heavy', { scale: 1.6, baseHeight: 0.4, shoulderHeight: 0.4, upperArmLength: 1.4, forearmLength: 1.2, wristLength: 0.1 }, { x: 2.0, y: 4.0, z: 2.0 }],
  ].map(([size, dimensions, bounds]) => writeAsset(`generic-6axis-${size}-v1`, professionalRobot(dimensions), professionalRobot(dimensions, true), ({ hash, lodHash, thumbHash }) => ({
    schemaVersion: '1.0', id: `generic-6axis-${size}-v1`, equipmentDefinitionId: `${size}-6axis`, category: 'robot', version: '1.0.0',
    coordinateSystem: { units: 'meters', upAxis: 'Y', handedness: 'right', origin: 'equipment-base' }, boundsMeters: bounds,
    visual: { glb: { path: 'model.glb', sha256: hash }, lods: [{ id: 'lod1', glb: { path: 'lod/lod1.glb', sha256: lodHash }, triangleBudget: 1800 }] },
    collision: { id: 'capsule-6axis', kind: 'capsule' },
    semanticNodes: [1, 2, 3, 4, 5, 6].map((index) => ({ id: `joint:j${index}`, kind: 'joint' })).concat([{ id: 'tool:flange', kind: 'tool' }, { id: 'tool:tcp', kind: 'tool' }]),
    anchors: [{ id: 'anchor:base', transform: { frameId: 'equipment-base', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } } }],
    robotRig: { joints: [{ id: 'joint:j1', axis: 'y', direction: 1 }, { id: 'joint:j2', axis: 'z', direction: 1, parentId: 'joint:j1' }, { id: 'joint:j3', axis: 'z', direction: 1, parentId: 'joint:j2' }, { id: 'joint:j4', axis: 'x', direction: 1, parentId: 'joint:j3' }, { id: 'joint:j5', axis: 'z', direction: 1, parentId: 'joint:j4' }, { id: 'joint:j6', axis: 'x', direction: 1, parentId: 'joint:j5' }], baseFrameNode: 'frame:base', flangeNode: 'tool:flange', toolFrameNode: 'tool:tcp' },
    materials: ['robot-orange', 'robot-orange-light', 'dark-steel', 'safety-label'], thumbnail: { path: 'thumbnail.svg', sha256: thumbHash }, license: { name: 'Fabrik3D generated generic asset; educational use' }, integrity: { path: 'model.glb', sha256: hash },
  }))),
  // S55 flagship CNC machine and cell dressing.
  writeAsset('hero-cnc-machine-v1', heroCncMachine(), heroCncMachine(true), ({ hash, lodHash, thumbHash }) => ({
    schemaVersion: '1.0', id: 'hero-cnc-machine-v1', equipmentDefinitionId: 'educational-cnc', category: 'machine', version: '1.0.0',
    coordinateSystem: { units: 'meters', upAxis: 'Y', handedness: 'right', origin: 'equipment-base' }, boundsMeters: { x: 2.25, y: 2.5, z: 1.95 },
    visual: { glb: { path: 'model.glb', sha256: hash }, lods: [{ id: 'lod1', glb: { path: 'lod/lod1.glb', sha256: lodHash }, triangleBudget: 6000 }] },
    collision: { id: 'cnc-1', kind: 'box', dimensionsMeters: { x: 2.0, y: 2.2, z: 1.6 } },
    semanticNodes: [
      { id: 'door:loading', kind: 'door' }, { id: 'fixture:chuck', kind: 'fixture' },
      { id: 'fixture:jaw-left', kind: 'fixture' }, { id: 'fixture:jaw-right', kind: 'fixture' },
      { id: 'signal:panel-screen', kind: 'signal' }, { id: 'signal:stack-light', kind: 'signal' },
    ],
    anchors: [{ id: 'anchor:load-door', transform: { frameId: 'equipment-base', position: { x: 0, y: 1.0, z: 0.82 }, rotation: { x: 0, y: 0, z: 0 } } }],
    materials: ['machine-body', 'machine-trim', 'stainless', 'safety-hazard', 'chamber-dark', 'glass'], thumbnail: { path: 'thumbnail.svg', sha256: thumbHash }, license: { name: 'Fabrik3D generated generic asset; educational use' }, integrity: { path: 'model.glb', sha256: hash },
  }), { enforceBudgets: true, maxPrimaryTriangles: 16000, enforceBounds: true, checkLodSemanticNodes: true }),
  writeAsset('hero-cell-dressing-v1', heroCellDressing(), heroCellDressing(true), ({ hash, lodHash, thumbHash }) => ({
    schemaVersion: '1.0', id: 'hero-cell-dressing-v1', equipmentDefinitionId: 'cell-environment', category: 'machine', version: '1.0.0',
    coordinateSystem: { units: 'meters', upAxis: 'Y', handedness: 'right', origin: 'equipment-base' }, boundsMeters: { x: 8.4, y: 3.3, z: 9.0 },
    visual: { glb: { path: 'model.glb', sha256: hash }, lods: [{ id: 'lod1', glb: { path: 'lod/lod1.glb', sha256: lodHash }, triangleBudget: 6000 }] },
    collision: { id: 'cell-dressing-proxy', kind: 'mesh' },
    semanticNodes: [
      { id: 'motor:chip-conveyor', kind: 'motor' }, { id: 'fixture:buffer:1', kind: 'fixture' },
      { id: 'fixture:buffer:2', kind: 'fixture' }, { id: 'signal:worklight:1', kind: 'signal' },
      { id: 'signal:worklight:2', kind: 'signal' }, { id: 'anchor:buffer.access', kind: 'anchor' },
    ],
    anchors: [{ id: 'anchor:buffer.access', transform: { frameId: 'equipment-base', position: { x: 3.0, y: 0.9, z: 0.15 }, rotation: { x: 0, y: 0, z: 0 } } }],
    materials: ['machine-trim', 'stainless', 'safety-hazard', 'rack-blue', 'work-light', 'concrete'], thumbnail: { path: 'thumbnail.svg', sha256: thumbHash }, license: { name: 'Fabrik3D generated generic asset; educational use' }, integrity: { path: 'model.glb', sha256: hash },
  }), { enforceBudgets: true, maxPrimaryTriangles: 12000, enforceBounds: true, checkLodSemanticNodes: true }),
])
console.log(JSON.stringify(results, null, 2))
