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
// S65 scenario-equipment palette.
const sensorGlass = new THREE.MeshStandardMaterial({ color: 0x9fe3ff, metalness: 0.1, roughness: 0.2 })
const plastic = new THREE.MeshStandardMaterial({ color: 0x2b6f8f, metalness: 0.1, roughness: 0.8 })
const enclosure = new THREE.MeshStandardMaterial({ color: 0xb9c2c8, metalness: 0.35, roughness: 0.55 })

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
//
// S60 deepens the manipulator with a realistic base, cast-arm shapes, joint
// housings, reducers/motors, wrist, flange, cable routing/dress pack, bolts,
// covers, labels, warning decals and a two-finger gripper. The `low` variant
// deliberately reduces segment counts and drops small detailing while keeping
// the silhouette and every semantic node, so LOD1 is a real LOD.
function professionalRobot(profile, low = false) {
  const rootGroup = new THREE.Group()
  rootGroup.name = 'equipment-root'
  rootGroup.userData.semanticId = 'equipment-root'
  rootGroup.scale.setScalar(profile.scale)
  const d = profile
  const seg = low ? 10 : 28
  const fine = low ? 8 : 18

  const base = group(rootGroup, 'frame:base')
  mesh(base, 'base:plate', new THREE.CylinderGeometry(0.55, 0.62, 0.06, seg), darkSteel, [0, 0.03, 0])
  mesh(base, 'base:pedestal', new THREE.CylinderGeometry(0.46, 0.5, 0.28, seg), robotPaint, [0, 0.17, 0])
  mesh(base, 'base:collar', new THREE.CylinderGeometry(0.44, 0.46, 0.05, seg), robotLightPaint, [0, 0.31, 0])
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2
    mesh(base, `base:bolt:${index}`, new THREE.CylinderGeometry(0.025, 0.025, 0.025, 10), steel, [Math.cos(angle) * 0.48, 0.075, Math.sin(angle) * 0.48])
  }
  if (!low) {
    mesh(base, 'base:cable-entry', new THREE.BoxGeometry(0.12, 0.16, 0.08), darkSteel, [-0.24, 0.14, -0.4])
    mesh(base, 'base:cover', new THREE.BoxGeometry(0.3, 0.18, 0.03), robotLightPaint, [0, 0.16, 0.5])
    mesh(base, 'label:base', new THREE.BoxGeometry(0.16, 0.05, 0.004), labelWhite, [0.24, 0.12, 0.49])
  }

  const j1 = group(rootGroup, 'joint:j1'); j1.position.set(0, d.baseHeight, 0)
  mesh(j1, 'joint-cover:j1', new THREE.CylinderGeometry(0.38, 0.42, 0.13, seg), robotLightPaint, [0, 0.02, 0])
  mesh(j1, 'joint-housing:j1', new THREE.CylinderGeometry(0.34, 0.36, 0.1, seg), robotPaint, [0, 0.11, 0])
  const j2 = group(j1, 'joint:j2'); j2.position.set(0, d.shoulderHeight, 0)
  mesh(j1, 'link:shoulder', new THREE.CylinderGeometry(0.3, 0.34, d.shoulderHeight * 0.88, seg), robotPaint, [0, d.shoulderHeight * 0.44, 0])
  mesh(j1, 'link:shoulder-rib', new THREE.BoxGeometry(0.1, d.shoulderHeight * 0.7, 0.42), robotLightPaint, [0, d.shoulderHeight * 0.44, 0])
  mesh(j1, 'motor:j2', new THREE.CylinderGeometry(0.14, 0.14, 0.2, fine), darkSteel, [0.31, d.shoulderHeight * 0.7, 0], [0, 0, Math.PI / 2])
  mesh(j1, 'reducer:j2', new THREE.CylinderGeometry(0.11, 0.11, 0.06, fine), steel, [0.43, d.shoulderHeight * 0.7, 0], [0, 0, Math.PI / 2])
  mesh(j2, 'joint-cover:j2', new THREE.SphereGeometry(0.22, seg, Math.max(8, seg - 6)), darkSteel)

  const j3 = group(j2, 'joint:j3'); j3.position.set(0, d.upperArmLength, 0)
  mesh(j2, 'link:upper-arm', new THREE.BoxGeometry(0.26, d.upperArmLength, 0.28), robotPaint, [0, d.upperArmLength / 2, 0])
  mesh(j2, 'link:upper-arm-panel', new THREE.BoxGeometry(0.275, d.upperArmLength * 0.72, 0.025), robotLightPaint, [0, d.upperArmLength * 0.52, 0.153])
  mesh(j2, 'link:upper-arm-rib', new THREE.BoxGeometry(0.08, d.upperArmLength * 0.8, 0.3), robotLightPaint, [0, d.upperArmLength * 0.5, 0])
  mesh(j2, 'motor:j3', new THREE.CylinderGeometry(0.125, 0.125, 0.18, fine), darkSteel, [-0.25, d.upperArmLength * 0.84, 0], [0, 0, Math.PI / 2])
  mesh(j2, 'reducer:j3', new THREE.CylinderGeometry(0.1, 0.1, 0.05, fine), steel, [-0.36, d.upperArmLength * 0.84, 0], [0, 0, Math.PI / 2])
  mesh(j3, 'joint-cover:j3', new THREE.CylinderGeometry(0.19, 0.22, 0.13, seg), darkSteel, [0, 0, 0], [Math.PI / 2, 0, 0])
  if (!low) {
    mesh(j2, 'dress:cable-bundle', new THREE.CylinderGeometry(0.03, 0.03, d.upperArmLength * 0.9, 8), darkSteel, [0, d.upperArmLength * 0.5, -0.17])
    mesh(j2, 'label:warning', new THREE.BoxGeometry(0.1, 0.06, 0.006), safetyYellow, [0, d.upperArmLength * 0.36, 0.165])
  }

  const j4 = group(j3, 'joint:j4'); j4.position.set(0, d.forearmLength, 0)
  mesh(j3, 'link:forearm', new THREE.BoxGeometry(0.21, d.forearmLength, 0.23), robotPaint, [0, d.forearmLength / 2, 0])
  mesh(j3, 'link:forearm-rib', new THREE.BoxGeometry(0.07, d.forearmLength * 0.8, 0.25), robotLightPaint, [0, d.forearmLength * 0.5, 0])
  mesh(j3, 'cable:external', new THREE.CylinderGeometry(0.025, 0.025, d.forearmLength * 0.82, 10), darkSteel, [0.15, d.forearmLength * 0.47, 0.12])
  mesh(j3, 'motor:j4', new THREE.CylinderGeometry(0.1, 0.1, 0.14, fine), darkSteel, [-0.2, d.forearmLength * 0.82, 0], [0, 0, Math.PI / 2])
  mesh(j4, 'joint-cover:j4', new THREE.CylinderGeometry(0.14, 0.14, 0.23, seg), robotLightPaint, [0, 0, 0], [0, 0, Math.PI / 2])
  if (!low) {
    mesh(j3, 'cable:loop', new THREE.TorusGeometry(0.06, 0.012, 6, 10), darkSteel, [0.1, d.forearmLength * 0.18, 0.1], [Math.PI / 2, 0, 0])
    for (let index = 0; index < 4; index += 1) {
      const angle = (index / 4) * Math.PI * 2
      mesh(j4, `bolt:j4:${index}`, new THREE.CylinderGeometry(0.012, 0.012, 0.02, 6), steel, [Math.cos(angle) * 0.08, Math.sin(angle) * 0.08, 0.13])
    }
  }

  const j5 = group(j4, 'joint:j5')
  mesh(j5, 'joint-cover:j5', new THREE.SphereGeometry(0.13, fine + 4, fine + 2), darkSteel, [0, 0.08, 0])
  mesh(j5, 'joint-housing:j5', new THREE.CylinderGeometry(0.1, 0.12, 0.08, seg), robotPaint, [0, 0, 0])
  const j6 = group(j5, 'joint:j6'); j6.position.set(0, d.wristLength, 0)
  mesh(j6, 'joint-cover:j6', new THREE.CylinderGeometry(0.1, 0.1, 0.14, seg), robotLightPaint, [0, 0.02, 0], [0, 0, Math.PI / 2])
  const flange = group(j6, 'tool:flange'); flange.position.set(0, 0.09, 0)
  mesh(flange, 'flange:iso-50', new THREE.CylinderGeometry(0.085, 0.085, 0.035, 20), steel, [0, 0.017, 0])
  for (let index = 0; index < 6; index += 1) {
    const angle = (index / 6) * Math.PI * 2
    mesh(flange, `flange:bolt:${index}`, new THREE.CylinderGeometry(0.008, 0.008, 0.015, 8), darkSteel, [Math.cos(angle) * 0.057, 0.04, Math.sin(angle) * 0.057])
  }
  // Generic two-finger gripper: render-only geometry, mounted below the flange
  // so `tool:tcp` stays at the grasp point between the fingers.
  mesh(flange, 'gripper:body', new THREE.BoxGeometry(0.12, 0.06, 0.08), darkSteel, [0, 0.02, 0])
  mesh(flange, 'gripper:finger-left', new THREE.BoxGeometry(0.018, 0.07, 0.05), steel, [-0.035, 0.045, 0])
  mesh(flange, 'gripper:finger-right', new THREE.BoxGeometry(0.018, 0.07, 0.05), steel, [0.035, 0.045, 0])
  const tcp = group(flange, 'tool:tcp'); tcp.position.set(0, 0.06, 0)
  if (!low) {
    mesh(j1, 'label:axis-1', new THREE.BoxGeometry(0.08, 0.045, 0.005), labelWhite, [0.42, 0.02, 0])
    mesh(j2, 'label:warning', new THREE.BoxGeometry(0.1, 0.06, 0.006), safetyYellow, [0, 0.12, 0.225])
    mesh(j3, 'label:warning-2', new THREE.BoxGeometry(0.08, 0.05, 0.005), safetyYellow, [-0.115, d.forearmLength * 0.4, 0])
    mesh(j3, 'cover:j4', new THREE.BoxGeometry(0.2, 0.06, 0.24), robotLightPaint, [0, d.forearmLength * 0.9, 0])
    mesh(j1, 'bolt:shoulder:0', new THREE.CylinderGeometry(0.018, 0.018, 0.03, 8), steel, [0.24, d.shoulderHeight * 0.44, 0.14])
    mesh(j1, 'bolt:shoulder:1', new THREE.CylinderGeometry(0.018, 0.018, 0.03, 8), steel, [-0.24, d.shoulderHeight * 0.44, 0.14])
  }
  return rootGroup
}

// ── S55 flagship CNC machining centre ──────────────────────────────
// Geometry and semantic-node contract intentionally mirror
// src/equipment/visuals/cncMachineVisual.ts. A test asserts node-id parity so
// the generated GLB can never silently drift from the runtime binding.
//
// S60 deepens the hero CNC with side panels, bevels, chamber rails, a thicker
// door, a detailed spindle/collet, stepped jaws, an operator panel with controls,
// a coolant system, a cable chain, work lighting and safety labelling. Every
// state-bearing node name from S55 is preserved unchanged.
function heroCncMachine(low = false) {
  const rootGroup = new THREE.Group()
  rootGroup.name = 'equipment-root'
  rootGroup.userData.semanticId = 'equipment:cnc'
  const seg = low ? 10 : 18

  const bodyW = 2.0, bodyH = 2.2, bodyD = 1.6
  mesh(rootGroup, 'machine:body', new THREE.BoxGeometry(bodyW, bodyH, bodyD), machineBody, [0, bodyH / 2, 0])
  mesh(rootGroup, 'machine:roof', new THREE.BoxGeometry(bodyW + 0.06, 0.12, bodyD + 0.06), machineTrim, [0, bodyH + 0.06, 0])
  mesh(rootGroup, 'machine:plinth', new THREE.BoxGeometry(bodyW + 0.1, 0.1, bodyD + 0.1), machineTrim, [0, 0.05, 0])
  mesh(rootGroup, 'marking:warning-stripe', new THREE.BoxGeometry(bodyW + 0.1, 0.05, 0.02), hazard, [0, 0.14, bodyD / 2 + 0.06])

  // Side panels, edge bevels and chamber linear rails.
  for (const sign of [-1, 1]) {
    mesh(rootGroup, `machine:panel:${sign}`, new THREE.BoxGeometry(0.02, bodyH * 0.82, bodyD * 0.88), machineTrim, [sign * (bodyW / 2 + 0.01), bodyH * 0.46, 0])
    mesh(rootGroup, `machine:bevel:${sign}`, new THREE.BoxGeometry(0.05, 0.05, bodyD + 0.04), machineTrim, [sign * (bodyW / 2 - 0.01), bodyH + 0.005, 0])
    if (!low) {
      mesh(rootGroup, `machine:rail:${sign}`, new THREE.BoxGeometry(0.05, 0.05, bodyD * 0.7), stainless, [sign * (bodyW / 2 - 0.08), 0.9, bodyD / 2 - 0.5])
      mesh(rootGroup, `machine:rail-guard:${sign}`, new THREE.BoxGeometry(0.04, 0.22, bodyD * 0.72), machineTrim, [sign * (bodyW / 2 - 0.08), 0.79, bodyD / 2 - 0.5])
    }
  }

  const doorW = 0.9, doorH = 1.0
  mesh(rootGroup, 'door:frame', new THREE.BoxGeometry(doorW + 0.08, doorH + 0.08, 0.05), machineTrim, [0, 1.0, bodyD / 2 + 0.005])
  const door = mesh(rootGroup, 'door:loading', new THREE.BoxGeometry(doorW, doorH, 0.02), machineGlass, [0, 1.0, bodyD / 2 + 0.02])
  mesh(rootGroup, 'door:inner', new THREE.BoxGeometry(doorW - 0.06, doorH - 0.06, 0.02), machineGlass, [0, 1.0, bodyD / 2 + 0.04])
  mesh(rootGroup, 'chamber:interior', new THREE.BoxGeometry(doorW - 0.1, doorH - 0.1, 0.4), machineChamber, [0, 1.0, bodyD / 2 - 0.22])
  mesh(rootGroup, 'chamber:back', new THREE.BoxGeometry(doorW - 0.06, doorH - 0.06, 0.03), machineChamber, [0, 1.0, bodyD / 2 - 0.44])
  if (!low) mesh(rootGroup, 'door:handle', new THREE.BoxGeometry(0.05, 0.28, 0.03), stainless, [0.4, 1.0, bodyD / 2 + 0.045])

  const spindle = group(rootGroup, 'spindle:main')
  spindle.position.set(0, 1.45, bodyD / 2 - 0.42)
  const spindleHousing = mesh(spindle, 'spindle:housing', new THREE.CylinderGeometry(0.13, 0.16, 0.32, seg), machineTrim)
  spindleHousing.rotation.x = Math.PI / 2
  const spindleCollar = mesh(spindle, 'spindle:collar', new THREE.CylinderGeometry(0.1, 0.13, 0.08, seg), stainless)
  spindleCollar.rotation.x = Math.PI / 2
  spindleCollar.position.z = -0.2
  const spindleTool = mesh(spindle, 'spindle:tool', new THREE.CylinderGeometry(0.035, 0.02, 0.22, low ? 8 : 12), stainless)
  spindleTool.rotation.x = Math.PI / 2
  spindleTool.position.z = 0.19
  if (!low) {
    const holder = mesh(spindle, 'spindle:holder', new THREE.CylinderGeometry(0.045, 0.055, 0.06, 14), stainless)
    holder.rotation.x = Math.PI / 2
    holder.position.z = 0.06
  }

  mesh(rootGroup, 'axis:feed', new THREE.BoxGeometry(0.46, 0.06, 0.34), stainless, [0, 0.72, bodyD / 2 - 0.39])
  const chuck = mesh(rootGroup, 'fixture:chuck', new THREE.CylinderGeometry(0.19, 0.19, 0.1, low ? 10 : 16), machineTrim, [0, 0.72, bodyD / 2 - 0.39])
  chuck.rotation.x = Math.PI / 2
  mesh(rootGroup, 'fixture:jaw-left', new THREE.BoxGeometry(0.07, 0.09, 0.16), stainless, [-0.22, 0.72, bodyD / 2 - 0.39])
  mesh(rootGroup, 'fixture:jaw-right', new THREE.BoxGeometry(0.07, 0.09, 0.16), stainless, [0.22, 0.72, bodyD / 2 - 0.39])
  if (!low) {
    mesh(rootGroup, 'fixture:jaw-step-left', new THREE.BoxGeometry(0.05, 0.05, 0.16), machineTrim, [-0.22, 0.78, bodyD / 2 - 0.39])
    mesh(rootGroup, 'fixture:jaw-step-right', new THREE.BoxGeometry(0.05, 0.05, 0.16), machineTrim, [0.22, 0.78, bodyD / 2 - 0.39])
  }

  mesh(rootGroup, 'coolant:nozzle', new THREE.CylinderGeometry(0.012, 0.012, 0.14, 8), coolantBlue, [0.2, 1.28, bodyD / 2 - 0.3])
  if (!low) {
    mesh(rootGroup, 'coolant:tank', new THREE.BoxGeometry(0.4, 0.3, 0.3), coolantBlue, [-0.6, 0.2, bodyD / 2 - 0.2])
    mesh(rootGroup, 'coolant:pump', new THREE.CylinderGeometry(0.06, 0.06, 0.1, 12), machineTrim, [-0.6, 0.4, bodyD / 2 - 0.2])
    mesh(rootGroup, 'coolant:hose', new THREE.CylinderGeometry(0.015, 0.015, 0.6, 8), rubber, [-0.35, 0.55, bodyD / 2 - 0.2], [0, 0, Math.PI / 2])
  }

  const panelGroup = group(rootGroup, 'panel:control')
  panelGroup.position.set(bodyW / 2 + 0.02, 1.5, bodyD / 2 - 0.3)
  panelGroup.rotation.y = -Math.PI / 8
  mesh(panelGroup, 'panel:body', new THREE.BoxGeometry(0.05, 0.5, 0.35), panelDark)
  if (!low) mesh(panelGroup, 'panel:bezel', new THREE.BoxGeometry(0.02, 0.32, 0.26), machineTrim, [0.02, 0.05, 0])
  mesh(panelGroup, 'signal:panel-screen', new THREE.BoxGeometry(0.01, 0.28, 0.22), screenGreen, [0.03, 0.05, 0])
  mesh(panelGroup, 'safety:emergency-stop-base', new THREE.CylinderGeometry(0.045, 0.045, 0.02, low ? 8 : 16), hazard, [0.045, -0.16, 0.1], [0, 0, Math.PI / 2])
  const estop = mesh(panelGroup, 'safety:emergency-stop', new THREE.CylinderGeometry(0.03, 0.03, 0.03, low ? 8 : 16), signalRed, [0.06, -0.16, 0.1], [0, 0, Math.PI / 2])
  estop.name = 'safety:emergency-stop'
  if (!low) {
    for (const [index, z] of [[1, -0.08], [2, 0.02], [3, 0.12]]) {
      mesh(panelGroup, `panel:button:${index}`, new THREE.CylinderGeometry(0.012, 0.012, 0.015, 8), hazard, [0.03, -0.14, z], [0, 0, Math.PI / 2])
    }
  }

  mesh(rootGroup, 'label:equipment', new THREE.BoxGeometry(0.5, 0.09, 0.01), labelWhite, [-0.5, 1.9, bodyD / 2 + 0.005])
  mesh(rootGroup, 'label:safety-1', new THREE.BoxGeometry(0.16, 0.12, 0.008), safetyYellow, [0.5, 1.55, bodyD / 2 + 0.005])
  if (!low) mesh(rootGroup, 'label:safety-2', new THREE.BoxGeometry(0.16, 0.12, 0.008), safetyYellow, [-0.5, 0.6, bodyD / 2 + 0.005])

  mesh(rootGroup, 'signal:stack-light', new THREE.CylinderGeometry(0.045, 0.045, 0.11, low ? 8 : 16), new THREE.MeshStandardMaterial({ color: 0x1fa85a, emissive: 0x1fa85a, emissiveIntensity: 0.5, metalness: 0.1, roughness: 0.35 }), [0, bodyH + 0.15, 0])
  mesh(rootGroup, 'signal:stack-light-amber', new THREE.CylinderGeometry(0.045, 0.045, 0.11, low ? 8 : 16), new THREE.MeshStandardMaterial({ color: 0xd6a400, emissive: 0xd6a400, emissiveIntensity: 0.5, metalness: 0.1, roughness: 0.35 }), [0.14, bodyH + 0.15, 0])
  mesh(rootGroup, 'signal:stack-light-red', new THREE.CylinderGeometry(0.045, 0.045, 0.11, low ? 8 : 16), new THREE.MeshStandardMaterial({ color: 0xd64040, emissive: 0xd64040, emissiveIntensity: 0.5, metalness: 0.1, roughness: 0.35 }), [-0.14, bodyH + 0.15, 0])

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
    mesh(rootGroup, 'machine:work-light-2', new THREE.BoxGeometry(0.36, 0.04, 0.12), workLight, [0, bodyH - 0.02, -bodyD / 2 + 0.12])
    mesh(rootGroup, 'machine:coolant-return', new THREE.CylinderGeometry(0.03, 0.03, 1.1, 8), coolantBlue, [-bodyW / 2 - 0.04, 0.55, 0.3])
    for (const x of [-0.75, 0.75]) for (const z of [-0.6, 0.6]) {
      mesh(rootGroup, `machine:foot:${x}:${z}`, new THREE.CylinderGeometry(0.05, 0.05, 0.06, 10), machineTrim, [x, 0.03, z])
    }
    // Cable chain running from the cabinet side to the spindle head.
    for (let index = 0; index < 4; index += 1) {
      mesh(rootGroup, `cable:chain:${index}`, new THREE.BoxGeometry(0.06, 0.04, 0.16), rubber, [-bodyW / 2 + 0.25 + index * 0.12, bodyH + 0.16, bodyD / 2 - 0.3])
    }
    // Painted floor footprint around the machine.
    for (const [name, x, z, sx, sz] of [
      ['marking:footprint-front', 0, 0.84, 2.14, 0.03],
      ['marking:footprint-back', 0, -0.84, 2.14, 0.03],
      ['marking:footprint-left', -1.06, 0, 0.03, 1.7],
      ['marking:footprint-right', 1.06, 0, 0.03, 1.7],
    ]) mesh(rootGroup, name, new THREE.BoxGeometry(sx, 0.01, sz), hazard, [x, 0.006, z])
  }

  return rootGroup
}

// ── S55 hero-cell dressing ─────────────────────────────────────────
// Additive industrial environment detail (chip handling, work-in-process
// buffering, work lighting, cable drops and cell bollards). It is deliberately
// render-only and never a collision authority.
//
// S60 adds electrical cabinets, painted floor markings, extra cable drops and
// safety labelling to make the cell legible as a real industrial environment.
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
  if (!low) mesh(rootGroup, 'chip:pump', new THREE.CylinderGeometry(0.08, 0.08, 0.14, 10), machineTrim, [1.42, 0.6, 2.2])

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
  const bollards = [[-2.0, 1.4], [2.0, 1.4], [-3.3, -1.5], [3.3, -1.5], [-1.0, -2.6], [1.0, -2.6]]
  const bollardCount = low ? 2 : bollards.length
  for (const [index, [x, z]] of bollards.slice(0, bollardCount).entries()) {
    mesh(rootGroup, `bollard:${index}`, new THREE.CylinderGeometry(0.07, 0.08, 0.62, low ? 8 : 12), hazard, [x, 0.31, z])
    mesh(rootGroup, `bollard:${index}:cap`, new THREE.BoxGeometry(0.03, 0.03, 0.03), darkSteel, [x, 0.63, z])
  }

  if (!low) {
    // Electrical cabinets with ventilation and labelling.
    for (const [index, [x, z]] of ([[1, 3.7, -2.7], [2, 3.7, -1.5]]).entries()) {
      const cabinet = group(rootGroup, `cabinet:electrical:${index + 1}`)
      cabinet.position.set(x, 0, z)
      mesh(cabinet, `cabinet:${index + 1}:body`, new THREE.BoxGeometry(0.7, 1.9, 0.5), cabinetPaint, [0, 0.95, 0])
      mesh(cabinet, `cabinet:${index + 1}:door`, new THREE.BoxGeometry(0.62, 1.7, 0.02), guardMesh, [0, 0.95, 0.26])
      mesh(cabinet, `cabinet:${index + 1}:handle`, new THREE.BoxGeometry(0.03, 0.22, 0.03), stainless, [0.24, 0.95, 0.28])
      for (let vent = 0; vent < 3; vent += 1) {
        mesh(cabinet, `cabinet:${index + 1}:vent:${vent}`, new THREE.BoxGeometry(0.4, 0.03, 0.02), machineTrim, [0, 1.7 - vent * 0.06, 0.27])
      }
      mesh(cabinet, `label:cabinet:${index + 1}`, new THREE.BoxGeometry(0.2, 0.1, 0.005), labelWhite, [0, 1.55, 0.272])
    }

    // Painted floor markings: pedestrian lane and protected-zone border.
    const markings = [
      ['marking:pedestrian:left', 2.35, 0, 0.06, 6.2],
      ['marking:pedestrian:right', 2.65, 0, 0.06, 6.2],
      ['marking:zone:front', 0, 2.5, 5.2, 0.06],
      ['marking:zone:back', 0, -2.5, 5.2, 0.06],
    ]
    for (const [name, x, z, sx, sz] of markings) {
      mesh(rootGroup, name, new THREE.BoxGeometry(sx, 0.012, sz), hazard, [x, 0.007, z])
    }
    mesh(rootGroup, 'label:cell', new THREE.BoxGeometry(0.6, 0.12, 0.01), labelWhite, [0, 1.2, 2.0])
  }

  return rootGroup
}

// ── S65 scenario-specific industrial equipment ─────────────────────
// One generated, license-safe GLB package per equipment class used by the five
// flagship scenario cells. Geometry is deliberately generic (no OEM extraction)
// and moderate-budget. Every state-bearing node consumed by
// `ScenarioCellAnimator` is preserved by name; the portable manifest declares the
// subset expressible in the semantic-node namespaces and the pipeline test
// asserts the full animator contract via `requiredNodeIds`.
//
// The `low` variant keeps the silhouette and every animator node while dropping
// fine detail, so LOD1 is a real LOD rather than a duplicate.
function scenarioEquipment(definitionId, low = false) {
  const rootGroup = new THREE.Group()
  rootGroup.name = 'equipment-root'
  rootGroup.userData.semanticId = 'equipment-root'
  const seg = low ? 10 : 20
  const fine = low ? 8 : 14

  switch (definitionId) {
    case 'straight-conveyor': {
      const length = 2.0, beltWidth = 0.5, surfaceY = 0.5
      const frame = group(rootGroup, 'frame')
      for (const z of [-0.28, 0.28]) {
        mesh(frame, `frame:rail:${z}`, new THREE.BoxGeometry(length, 0.07, 0.05), steel, [0, 0.42, z])
        mesh(frame, `guard:rail:${z}`, new THREE.BoxGeometry(length, 0.1, 0.02), safetyYellow, [0, 0.55, z])
      }
      for (const x of (low ? [-0.8, 0.8] : [-0.9, 0, 0.9])) {
        for (const z of [-0.25, 0.25]) {
          mesh(frame, `leg:${x}:${z}`, new THREE.BoxGeometry(0.06, 0.4, 0.06), steel, [x, 0.2, z])
          mesh(frame, `foot:${x}:${z}`, new THREE.CylinderGeometry(0.06, 0.06, 0.012, 12), darkSteel, [x, 0.006, z])
        }
      }
      const rollers = group(rootGroup, 'rollers')
      const rollerGeometry = new THREE.CylinderGeometry(0.04, 0.04, beltWidth, 12)
      rollerGeometry.rotateX(Math.PI / 2)
      const rollerCount = low ? 6 : 14
      for (let index = 0; index < rollerCount; index += 1) {
        const x = -0.9 + index * (1.8 / (rollerCount - 1))
        mesh(rollers, `roller:${index}`, rollerGeometry, darkSteel, [x, 0.46, 0])
      }
      const segments = group(rootGroup, 'belt')
      const segmentCount = low ? 8 : 20
      for (let index = 0; index < segmentCount; index += 1) {
        const x = -0.92 + index * (1.84 / (segmentCount - 1))
        mesh(segments, `belt:segment:${index}`, new THREE.BoxGeometry(0.1, 0.01, beltWidth), beltRubber, [x, surfaceY, 0])
      }
      const drive = group(rootGroup, 'motor:main')
      mesh(drive, 'motor:body', new THREE.CylinderGeometry(0.08, 0.08, 0.2, seg), steel, [-0.9, 0.38, -0.3], [Math.PI / 2, 0, 0])
      mesh(drive, 'motor:gearbox', new THREE.BoxGeometry(0.12, 0.12, 0.1), darkSteel, [-0.9, 0.42, -0.22])
      for (const [id, x] of [['sensor:infeed', -0.6], ['sensor:outfeed', 0.6]]) {
        const sensor = group(rootGroup, id)
        mesh(sensor, `${id}:body`, new THREE.BoxGeometry(0.04, 0.09, 0.04), darkSteel, [x, 0.58, 0.29])
        mesh(sensor, `${id}:lens`, new THREE.SphereGeometry(0.015, 10, 8), sensorGreen, [x, 0.6, 0.27])
      }
      const inAnchor = group(rootGroup, 'anchor:material.in'); inAnchor.position.set(-1.0, surfaceY, 0)
      const outAnchor = group(rootGroup, 'anchor:material.out'); outAnchor.position.set(1.0, surfaceY, 0)
      return rootGroup
    }
    case 'vision-inspection-station': {
      const legHeight = 1.85
      for (const sign of [-1, 1]) {
        mesh(rootGroup, `leg:${sign}`, new THREE.BoxGeometry(0.07, legHeight, 0.07), darkSteel, [sign * 0.38, legHeight / 2, 0])
        mesh(rootGroup, `foot:${sign}`, new THREE.BoxGeometry(0.12, 0.03, 0.12), steel, [sign * 0.38, 0.015, 0])
      }
      mesh(rootGroup, 'beam', new THREE.BoxGeometry(0.9, 0.11, 0.6), steel, [0, legHeight + 0.055, 0])
      mesh(rootGroup, 'camera', new THREE.BoxGeometry(0.2, 0.16, 0.2), darkSteel, [0, legHeight - 0.08, 0])
      mesh(rootGroup, 'lens', new THREE.CylinderGeometry(0.06, 0.06, 0.02, seg), sensorGlass, [0, legHeight - 0.18, 0])
      mesh(rootGroup, 'inspection-light', new THREE.BoxGeometry(0.28, 0.02, 0.28), sensorGlass, [0, legHeight - 0.22, 0])
      if (!low) {
        mesh(rootGroup, 'camera:mount', new THREE.BoxGeometry(0.08, 0.06, 0.08), steel, [0, legHeight + 0.02, 0])
        mesh(rootGroup, 'label:station', new THREE.BoxGeometry(0.16, 0.05, 0.005), labelWhite, [0, legHeight - 0.02, 0.31])
      }
      return rootGroup
    }
    case 'photoelectric-sensor': {
      mesh(rootGroup, 'body', new THREE.BoxGeometry(0.1, 0.1, 0.1), plastic, [0, 0.06, 0])
      mesh(rootGroup, 'lens', new THREE.CylinderGeometry(0.025, 0.025, 0.015, seg), sensorGlass, [0, 0.06, 0.055], [Math.PI / 2, 0, 0])
      if (!low) mesh(rootGroup, 'bracket', new THREE.BoxGeometry(0.04, 0.04, 0.04), darkSteel, [0, 0.02, -0.05])
      return rootGroup
    }
    case 'diverter-pusher': {
      mesh(rootGroup, 'body', new THREE.BoxGeometry(0.5, 0.4, 0.6), steel, [0, 0.2, 0])
      mesh(rootGroup, 'piston', new THREE.CylinderGeometry(0.04, 0.04, 0.5, seg), darkSteel, [0, 0.28, 0], [0, 0, Math.PI / 2])
      mesh(rootGroup, 'pusher', new THREE.BoxGeometry(0.06, 0.24, 0.5), safetyYellow, [0.3, 0.28, 0])
      if (!low) {
        mesh(rootGroup, 'valve', new THREE.BoxGeometry(0.1, 0.1, 0.1), darkSteel, [-0.2, 0.42, 0])
        mesh(rootGroup, 'label:pusher', new THREE.BoxGeometry(0.12, 0.04, 0.005), labelWhite, [0, 0.36, 0.31])
      }
      return rootGroup
    }
    case 'storage-bin': {
      mesh(rootGroup, 'bin', new THREE.BoxGeometry(0.6, 0.45, 0.5), plastic, [0, 0.225, 0])
      mesh(rootGroup, 'opening', new THREE.BoxGeometry(0.54, 0.02, 0.44), darkSteel, [0, 0.46, 0])
      if (!low) {
        mesh(rootGroup, 'bin:lip', new THREE.BoxGeometry(0.62, 0.03, 0.52), steel, [0, 0.44, 0])
        mesh(rootGroup, 'label:bin', new THREE.BoxGeometry(0.16, 0.06, 0.005), labelWhite, [0, 0.24, 0.253])
      }
      return rootGroup
    }
    case 'plc-cabinet':
    case 'robot-controller-cabinet': {
      const w = definitionId === 'plc-cabinet' ? 1.0 : 0.8
      const h = definitionId === 'plc-cabinet' ? 2.0 : 1.8
      const d = definitionId === 'plc-cabinet' ? 0.5 : 0.65
      mesh(rootGroup, 'cabinet', new THREE.BoxGeometry(w, h, d), enclosure, [0, h / 2, 0])
      mesh(rootGroup, 'door', new THREE.BoxGeometry(w * 0.9, h * 0.88, 0.02), guardMesh, [0, h / 2, d / 2 + 0.01])
      mesh(rootGroup, 'panel', new THREE.BoxGeometry(w * 0.5, h * 0.16, 0.02), darkSteel, [0, h * 0.72, d / 2 + 0.025])
      if (!low) {
        mesh(rootGroup, 'handle', new THREE.BoxGeometry(0.03, 0.2, 0.03), stainless, [w * 0.34, h / 2, d / 2 + 0.03])
        for (let vent = 0; vent < 3; vent += 1) {
          mesh(rootGroup, `vent:${vent}`, new THREE.BoxGeometry(w * 0.5, 0.025, 0.02), machineTrim, [0, h * 0.9 - vent * 0.05, d / 2 + 0.02])
        }
        mesh(rootGroup, 'label:cabinet', new THREE.BoxGeometry(0.2, 0.08, 0.005), labelWhite, [0, h * 0.6, d / 2 + 0.03])
      }
      return rootGroup
    }
    case 'operator-hmi-pedestal': {
      mesh(rootGroup, 'column', new THREE.BoxGeometry(0.3, 0.9, 0.25), darkSteel, [0, 0.45, 0])
      mesh(rootGroup, 'screen', new THREE.BoxGeometry(0.55, 0.4, 0.04), plastic, [0, 1.05, 0])
      if (!low) {
        mesh(rootGroup, 'screen:bezel', new THREE.BoxGeometry(0.6, 0.45, 0.02), darkSteel, [0, 1.05, -0.02])
        mesh(rootGroup, 'base', new THREE.BoxGeometry(0.4, 0.05, 0.35), steel, [0, 0.025, 0])
        mesh(rootGroup, 'label:hmi', new THREE.BoxGeometry(0.2, 0.05, 0.005), labelWhite, [0, 0.8, 0.13])
      }
      return rootGroup
    }
    case 'configurable-part': {
      mesh(rootGroup, 'part', new THREE.BoxGeometry(0.12, 0.08, 0.12), enclosure, [0, 0.04, 0])
      if (!low) mesh(rootGroup, 'part:top', new THREE.BoxGeometry(0.1, 0.01, 0.1), steel, [0, 0.085, 0])
      return rootGroup
    }
    case 'vacuum-gripper': {
      mesh(rootGroup, 'tool-body', new THREE.BoxGeometry(0.2, 0.1, 0.2), darkSteel, [0, 0.05, 0])
      mesh(rootGroup, 'interface', new THREE.BoxGeometry(0.12, 0.03, 0.12), safetyYellow, [0, 0.11, 0])
      if (!low) {
        for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
          mesh(rootGroup, `cup:${sx}:${sz}`, new THREE.CylinderGeometry(0.03, 0.03, 0.03, fine), rubber, [sx * 0.06, 0.015, sz * 0.06])
        }
      }
      return rootGroup
    }
    case 'carton': {
      mesh(rootGroup, 'carton', new THREE.BoxGeometry(0.4, 0.3, 0.3), enclosure, [0, 0.15, 0])
      if (!low) {
        mesh(rootGroup, 'carton:tape', new THREE.BoxGeometry(0.4, 0.005, 0.05), labelWhite, [0, 0.302, 0])
        mesh(rootGroup, 'carton:flap', new THREE.BoxGeometry(0.4, 0.01, 0.14), steel, [0, 0.305, 0.08])
      }
      return rootGroup
    }
    case 'euro-pallet': {
      mesh(rootGroup, 'pallet', new THREE.BoxGeometry(1.2, 0.045, 0.8), safetyYellow, [0, 0.0225, 0])
      for (const z of [-0.3, 0, 0.3]) mesh(rootGroup, `runner:${z}`, new THREE.BoxGeometry(1.16, 0.02, 0.1), darkSteel, [0, 0.01, z])
      for (const [index, x, z] of (low ? [[1, -0.5, -0.3], [2, 0.5, 0.3]] : [[1, -0.5, -0.3], [2, 0.5, -0.3], [3, -0.5, 0.3], [4, 0.5, 0.3]])) {
        mesh(rootGroup, `block:${index}`, new THREE.BoxGeometry(0.12, 0.1, 0.12), safetyYellow, [x, 0.05, z])
      }
      if (!low) mesh(rootGroup, 'label:pallet', new THREE.BoxGeometry(0.2, 0.05, 0.005), labelWhite, [0, 0.05, 0.401])
      return rootGroup
    }
    case 'infeed-buffer':
    case 'outfeed-buffer': {
      mesh(rootGroup, 'deck', new THREE.BoxGeometry(1.2, 0.07, 0.8), steel, [0, 0.365, 0])
      for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        mesh(rootGroup, `leg:${sx}:${sz}`, new THREE.BoxGeometry(0.06, 0.33, 0.06), darkSteel, [sx * 0.54, 0.165, sz * 0.34])
      }
      if (!low) {
        for (const z of [-0.34, 0.34]) mesh(rootGroup, `rail:${z}`, new THREE.BoxGeometry(1.2, 0.05, 0.04), safetyYellow, [0, 0.42, z])
        mesh(rootGroup, 'label:buffer', new THREE.BoxGeometry(0.2, 0.05, 0.005), labelWhite, [0, 0.3, 0.401])
      }
      return rootGroup
    }
    case 'fence-panel': {
      mesh(rootGroup, 'panel', new THREE.BoxGeometry(2.4, 2.1, 0.04), safetyYellow, [0, 1.05, 0])
      for (const sign of [-1, 1]) mesh(rootGroup, `post:${sign}`, new THREE.BoxGeometry(0.08, 2.1, 0.08), darkSteel, [sign * 1.16, 1.05, 0])
      if (!low) {
        mesh(rootGroup, 'kick-plate', new THREE.BoxGeometry(2.4, 0.16, 0.05), darkSteel, [0, 0.08, 0])
        for (let bar = 0; bar < 4; bar += 1) mesh(rootGroup, `bar:${bar}`, new THREE.BoxGeometry(2.3, 0.03, 0.02), guardMesh, [0, 0.5 + bar * 0.4, 0.03])
      }
      return rootGroup
    }
    case 'light-curtain': {
      mesh(rootGroup, 'post-a', new THREE.BoxGeometry(0.06, 1.8, 0.06), darkSteel, [-0.67, 0.9, 0])
      mesh(rootGroup, 'field', new THREE.BoxGeometry(0.05, 1.44, 0.04), sensorGlass, [0, 0.9, 0])
      mesh(rootGroup, 'emitter', new THREE.BoxGeometry(1.4, 0.07, 0.05), darkSteel, [0, 1.8, 0])
      if (!low) {
        mesh(rootGroup, 'post-b', new THREE.BoxGeometry(0.06, 1.8, 0.06), darkSteel, [0.67, 0.9, 0])
        mesh(rootGroup, 'receiver', new THREE.BoxGeometry(1.4, 0.07, 0.05), darkSteel, [0, 0.02, 0])
      }
      return rootGroup
    }
    case 'machining-fixture': {
      mesh(rootGroup, 'fixture', new THREE.BoxGeometry(0.55, 0.16, 0.55), darkSteel, [0, 0.08, 0])
      mesh(rootGroup, 'workface', new THREE.BoxGeometry(0.4, 0.02, 0.4), steel, [0, 0.17, 0])
      if (!low) {
        for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
          mesh(rootGroup, `bolt:${sx}:${sz}`, new THREE.CylinderGeometry(0.012, 0.012, 0.02, fine), stainless, [sx * 0.2, 0.18, sz * 0.2])
        }
      }
      return rootGroup
    }
    case 'toggle-clamp': {
      mesh(rootGroup, 'base', new THREE.BoxGeometry(0.2, 0.08, 0.12), darkSteel, [0, 0.04, 0])
      mesh(rootGroup, 'handle', new THREE.BoxGeometry(0.06, 0.12, 0.06), safetyYellow, [0, 0.14, 0])
      if (!low) {
        mesh(rootGroup, 'arm', new THREE.BoxGeometry(0.16, 0.03, 0.04), steel, [0.02, 0.1, 0])
        mesh(rootGroup, 'spindle', new THREE.CylinderGeometry(0.012, 0.012, 0.06, fine), stainless, [0.08, 0.06, 0])
      }
      return rootGroup
    }
    case 'part-presence-sensor': {
      mesh(rootGroup, 'sensor', new THREE.BoxGeometry(0.1, 0.08, 0.1), plastic, [0, 0.04, 0])
      mesh(rootGroup, 'port', new THREE.CylinderGeometry(0.02, 0.02, 0.01, seg), sensorGlass, [0, 0.04, 0.055], [Math.PI / 2, 0, 0])
      if (!low) mesh(rootGroup, 'cable', new THREE.CylinderGeometry(0.012, 0.012, 0.08, fine), darkSteel, [0, 0.04, -0.08], [Math.PI / 2, 0, 0])
      return rootGroup
    }
    case 'barcode-rfid-reader': {
      mesh(rootGroup, 'body', new THREE.BoxGeometry(0.2, 0.16, 0.15), darkSteel, [0, 0.08, 0])
      mesh(rootGroup, 'window', new THREE.BoxGeometry(0.14, 0.02, 0.11), sensorGlass, [0, 0.005, 0])
      if (!low) {
        mesh(rootGroup, 'reader:mount', new THREE.BoxGeometry(0.06, 0.06, 0.06), steel, [0, 0.18, 0])
        mesh(rootGroup, 'label:reader', new THREE.BoxGeometry(0.1, 0.03, 0.005), labelWhite, [0, 0.1, 0.078])
      }
      return rootGroup
    }
    case 'workholding-adapter': {
      mesh(rootGroup, 'adapter', new THREE.BoxGeometry(0.35, 0.12, 0.35), steel, [0, 0.06, 0])
      if (!low) {
        mesh(rootGroup, 'adapter:plate', new THREE.BoxGeometry(0.28, 0.02, 0.28), darkSteel, [0, 0.13, 0])
        for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
          mesh(rootGroup, `adapter:bolt:${sx}:${sz}`, new THREE.CylinderGeometry(0.01, 0.01, 0.02, fine), stainless, [sx * 0.12, 0.14, sz * 0.12])
        }
      }
      return rootGroup
    }
    case 'interlocked-gate': {
      mesh(rootGroup, 'gate', new THREE.BoxGeometry(1.2, 2.1, 0.05), safetyYellow, [0, 1.05, 0])
      mesh(rootGroup, 'interlock', new THREE.BoxGeometry(0.12, 0.12, 0.06), signalRed, [0.5, 1.26, 0.05])
      if (!low) {
        for (let bar = 0; bar < 4; bar += 1) mesh(rootGroup, `gate:bar:${bar}`, new THREE.BoxGeometry(1.1, 0.03, 0.02), guardMesh, [0, 0.5 + bar * 0.4, 0.04])
        mesh(rootGroup, 'gate:handle', new THREE.BoxGeometry(0.04, 0.24, 0.04), stainless, [-0.5, 1.05, 0.05])
      }
      return rootGroup
    }
    case 'area-scanner': {
      mesh(rootGroup, 'scanner', new THREE.CylinderGeometry(0.11, 0.12, 0.2, seg), darkSteel, [0, 0.1, 0])
      mesh(rootGroup, 'window', new THREE.BoxGeometry(0.12, 0.02, 0.12), sensorGlass, [0, 0.21, 0])
      if (!low) {
        mesh(rootGroup, 'scanner:base', new THREE.CylinderGeometry(0.13, 0.13, 0.02, seg), steel, [0, 0.01, 0])
        mesh(rootGroup, 'scanner:ring', new THREE.CylinderGeometry(0.115, 0.115, 0.02, seg), safetyYellow, [0, 0.16, 0])
      }
      return rootGroup
    }
    case 'emergency-stop': {
      mesh(rootGroup, 'pedestal', new THREE.BoxGeometry(0.3, 1.1, 0.3), darkSteel, [0, 0.55, 0])
      mesh(rootGroup, 'button', new THREE.CylinderGeometry(0.09, 0.09, 0.05, seg), signalRed, [0, 1.13, 0])
      if (!low) {
        mesh(rootGroup, 'button:base', new THREE.CylinderGeometry(0.11, 0.11, 0.03, seg), safetyYellow, [0, 1.1, 0])
        mesh(rootGroup, 'label:estop', new THREE.BoxGeometry(0.16, 0.06, 0.005), labelWhite, [0, 0.9, 0.153])
      }
      return rootGroup
    }
    case 'stack-light': {
      mesh(rootGroup, 'red', new THREE.CylinderGeometry(0.06, 0.06, 0.18, seg), signalRed, [0, 0.56, 0])
      mesh(rootGroup, 'amber', new THREE.CylinderGeometry(0.06, 0.06, 0.18, seg), safetyYellow, [0, 0.37, 0])
      mesh(rootGroup, 'green', new THREE.CylinderGeometry(0.06, 0.06, 0.18, seg), sensorGreen, [0, 0.18, 0])
      if (!low) {
        mesh(rootGroup, 'stack:pole', new THREE.CylinderGeometry(0.02, 0.02, 0.65, fine), darkSteel, [0, 0.325, 0])
        mesh(rootGroup, 'stack:base', new THREE.CylinderGeometry(0.07, 0.07, 0.03, seg), darkSteel, [0, 0.015, 0])
      }
      return rootGroup
    }
    case 'safety-zone': {
      mesh(rootGroup, 'zone-floor', new THREE.BoxGeometry(2.5, 0.03, 2.5), safetyYellow, [0, 0.015, 0])
      mesh(rootGroup, 'zone-edge-a', new THREE.BoxGeometry(2.5, 0.04, 0.06), darkSteel, [0, 0.02, -1.25])
      mesh(rootGroup, 'zone-edge-b', new THREE.BoxGeometry(2.5, 0.04, 0.06), darkSteel, [0, 0.02, 1.25])
      mesh(rootGroup, 'zone-edge-c', new THREE.BoxGeometry(0.06, 0.04, 2.5), darkSteel, [-1.25, 0.02, 0])
      mesh(rootGroup, 'zone-edge-d', new THREE.BoxGeometry(0.06, 0.04, 2.5), darkSteel, [1.25, 0.02, 0])
      if (!low) {
        for (const [index, x, z] of [[1, -1.1, -1.1], [2, 1.1, -1.1], [3, -1.1, 1.1], [4, 1.1, 1.1]]) {
          mesh(rootGroup, `zone-corner:${index}`, new THREE.BoxGeometry(0.12, 0.05, 0.12), hazard, [x, 0.025, z])
        }
      }
      return rootGroup
    }
    default:
      throw new Error(`No S65 scenario equipment builder for '${definitionId}'.`)
  }
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

// S65 scenario equipment catalog. `semanticNodes` is the portable manifest
// subset; `requiredNodes` is the full animator contract asserted by the pipeline
// test (some state-bearing node names are not expressible in the manifest
// namespaces). `bounds` are the declared SI envelopes the generated geometry
// must fit inside.
const SCENARIO_EQUIPMENT_SPECS = [
  {
    assetId: 'scenario-straight-conveyor-v1', definitionId: 'straight-conveyor', category: 'conveyor',
    bounds: { x: 2.0, y: 0.62, z: 0.66 }, primaryBudget: 6000, lodBudget: 2200,
    collision: { id: 'scenario-conveyor-1', kind: 'box', dimensionsMeters: { x: 2.0, y: 0.5, z: 0.6 } },
    semanticNodes: [{ id: 'motor:main', kind: 'motor' }, { id: 'sensor:infeed', kind: 'sensor' }, { id: 'sensor:outfeed', kind: 'sensor' }, { id: 'anchor:material.in', kind: 'anchor' }, { id: 'anchor:material.out', kind: 'anchor' }],
    anchors: [{ id: 'anchor:material.in', transform: { frameId: 'equipment-base', position: { x: -1.0, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 } } }, { id: 'anchor:material.out', transform: { frameId: 'equipment-base', position: { x: 1.0, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 } } }],
    materials: ['painted-steel', 'dark-steel', 'belt-rubber', 'safety-yellow'],
    requiredNodes: ['frame', 'belt', 'motor:main', 'sensor:infeed', 'sensor:outfeed', 'anchor:material.in', 'anchor:material.out'],
  },
  {
    assetId: 'scenario-vision-inspection-station-v1', definitionId: 'vision-inspection-station', category: 'machine',
    bounds: { x: 0.9, y: 2.0, z: 0.7 }, primaryBudget: 4000, lodBudget: 1600,
    collision: { id: 'scenario-vision-station-1', kind: 'box', dimensionsMeters: { x: 0.9, y: 2.0, z: 0.7 } },
    semanticNodes: [{ id: 'sensor:camera', kind: 'sensor' }, { id: 'signal:inspection-light', kind: 'signal' }],
    anchors: [],
    materials: ['dark-steel', 'painted-steel', 'sensor-glass'],
    requiredNodes: ['leg:1', 'leg:-1', 'beam', 'camera', 'lens', 'inspection-light'],
  },
  {
    assetId: 'scenario-photoelectric-sensor-v1', definitionId: 'photoelectric-sensor', category: 'sensor',
    bounds: { x: 0.12, y: 0.12, z: 0.12 }, primaryBudget: 800, lodBudget: 400,
    collision: { id: 'scenario-photoelectric-1', kind: 'box', dimensionsMeters: { x: 0.12, y: 0.12, z: 0.12 } },
    semanticNodes: [{ id: 'sensor:lens', kind: 'sensor' }],
    anchors: [],
    materials: ['plastic', 'sensor-glass'],
    requiredNodes: ['body', 'lens'],
  },
  {
    assetId: 'scenario-diverter-pusher-v1', definitionId: 'diverter-pusher', category: 'conveyor',
    bounds: { x: 0.75, y: 0.5, z: 0.75 }, primaryBudget: 2500, lodBudget: 1000,
    collision: { id: 'scenario-diverter-1', kind: 'box', dimensionsMeters: { x: 0.75, y: 0.5, z: 0.75 } },
    semanticNodes: [{ id: 'motor:pusher', kind: 'motor' }, { id: 'sensor:extended', kind: 'sensor' }],
    anchors: [],
    materials: ['painted-steel', 'dark-steel', 'safety-yellow'],
    requiredNodes: ['body', 'piston', 'pusher'],
  },
  {
    assetId: 'scenario-storage-bin-v1', definitionId: 'storage-bin', category: 'pallet-station',
    bounds: { x: 0.62, y: 0.48, z: 0.52 }, primaryBudget: 1500, lodBudget: 700,
    collision: { id: 'scenario-bin-1', kind: 'box', dimensionsMeters: { x: 0.6, y: 0.45, z: 0.5 } },
    semanticNodes: [{ id: 'sensor:level', kind: 'sensor' }, { id: 'anchor:material.out', kind: 'anchor' }],
    anchors: [{ id: 'anchor:material.out', transform: { frameId: 'equipment-base', position: { x: 0, y: 0.45, z: 0 }, rotation: { x: 0, y: 0, z: 0 } } }],
    materials: ['plastic', 'dark-steel'],
    requiredNodes: ['bin', 'opening'],
  },
  {
    assetId: 'scenario-plc-cabinet-v1', definitionId: 'plc-cabinet', category: 'machine',
    bounds: { x: 1.0, y: 2.0, z: 0.5 }, primaryBudget: 3000, lodBudget: 1200,
    collision: { id: 'scenario-plc-1', kind: 'box', dimensionsMeters: { x: 1.0, y: 2.0, z: 0.5 } },
    semanticNodes: [{ id: 'signal:panel', kind: 'signal' }, { id: 'door:panel', kind: 'door' }],
    anchors: [],
    materials: ['enclosure', 'dark-steel'],
    requiredNodes: ['cabinet', 'door', 'panel'],
  },
  {
    assetId: 'scenario-operator-hmi-pedestal-v1', definitionId: 'operator-hmi-pedestal', category: 'machine',
    bounds: { x: 0.6, y: 1.35, z: 0.45 }, primaryBudget: 2200, lodBudget: 900,
    collision: { id: 'scenario-hmi-1', kind: 'box', dimensionsMeters: { x: 0.55, y: 1.35, z: 0.45 } },
    semanticNodes: [{ id: 'signal:screen', kind: 'signal' }],
    anchors: [],
    materials: ['dark-steel', 'plastic'],
    requiredNodes: ['column', 'screen'],
  },
  {
    assetId: 'scenario-configurable-part-v1', definitionId: 'configurable-part', category: 'pallet-station',
    bounds: { x: 0.12, y: 0.09, z: 0.12 }, primaryBudget: 400, lodBudget: 200,
    collision: { id: 'scenario-part-1', kind: 'box', dimensionsMeters: { x: 0.12, y: 0.08, z: 0.12 } },
    semanticNodes: [{ id: 'anchor:grasp', kind: 'anchor' }],
    anchors: [{ id: 'anchor:grasp', transform: { frameId: 'equipment-base', position: { x: 0, y: 0.08, z: 0 }, rotation: { x: 0, y: 0, z: 0 } } }],
    materials: ['enclosure'],
    requiredNodes: ['part'],
  },
  {
    assetId: 'scenario-vacuum-gripper-v1', definitionId: 'vacuum-gripper', category: 'tool',
    bounds: { x: 0.2, y: 0.14, z: 0.2 }, primaryBudget: 1200, lodBudget: 500,
    collision: { id: 'scenario-vacuum-1', kind: 'box', dimensionsMeters: { x: 0.2, y: 0.14, z: 0.2 } },
    semanticNodes: [{ id: 'tool:interface', kind: 'tool' }, { id: 'sensor:vacuum', kind: 'sensor' }],
    anchors: [],
    materials: ['dark-steel', 'safety-yellow'],
    requiredNodes: ['tool-body', 'interface'],
  },
  {
    assetId: 'scenario-carton-v1', definitionId: 'carton', category: 'pallet-station',
    bounds: { x: 0.4, y: 0.31, z: 0.3 }, primaryBudget: 600, lodBudget: 300,
    collision: { id: 'scenario-carton-1', kind: 'box', dimensionsMeters: { x: 0.4, y: 0.3, z: 0.3 } },
    semanticNodes: [{ id: 'anchor:grasp', kind: 'anchor' }],
    anchors: [{ id: 'anchor:grasp', transform: { frameId: 'equipment-base', position: { x: 0, y: 0.3, z: 0 }, rotation: { x: 0, y: 0, z: 0 } } }],
    materials: ['enclosure'],
    requiredNodes: ['carton'],
  },
  {
    assetId: 'scenario-euro-pallet-v1', definitionId: 'euro-pallet', category: 'pallet-station',
    bounds: { x: 1.2, y: 0.15, z: 0.8 }, primaryBudget: 1800, lodBudget: 800,
    collision: { id: 'scenario-pallet-1', kind: 'box', dimensionsMeters: { x: 1.2, y: 0.15, z: 0.8 } },
    semanticNodes: [{ id: 'fixture:locator', kind: 'fixture' }, { id: 'anchor:grasp', kind: 'anchor' }],
    anchors: [{ id: 'anchor:grasp', transform: { frameId: 'equipment-base', position: { x: 0, y: 0.15, z: 0 }, rotation: { x: 0, y: 0, z: 0 } } }],
    materials: ['safety-yellow', 'dark-steel'],
    requiredNodes: ['pallet', 'runner:-0.3', 'runner:0', 'runner:0.3'],
  },
  {
    assetId: 'scenario-infeed-buffer-v1', definitionId: 'infeed-buffer', category: 'pallet-station',
    bounds: { x: 1.2, y: 0.45, z: 0.8 }, primaryBudget: 1600, lodBudget: 700,
    collision: { id: 'scenario-infeed-buffer-1', kind: 'box', dimensionsMeters: { x: 1.2, y: 0.4, z: 0.8 } },
    semanticNodes: [{ id: 'sensor:presence', kind: 'sensor' }, { id: 'anchor:material.in', kind: 'anchor' }, { id: 'anchor:material.out', kind: 'anchor' }],
    anchors: [{ id: 'anchor:material.in', transform: { frameId: 'equipment-base', position: { x: -0.6, y: 0.4, z: 0 }, rotation: { x: 0, y: 0, z: 0 } } }, { id: 'anchor:material.out', transform: { frameId: 'equipment-base', position: { x: 0.6, y: 0.4, z: 0 }, rotation: { x: 0, y: 0, z: 0 } } }],
    materials: ['painted-steel', 'dark-steel', 'safety-yellow'],
    requiredNodes: ['deck', 'leg:-1:-1', 'leg:-1:1', 'leg:1:-1', 'leg:1:1'],
  },
  {
    assetId: 'scenario-outfeed-buffer-v1', definitionId: 'outfeed-buffer', category: 'pallet-station',
    bounds: { x: 1.2, y: 0.45, z: 0.8 }, primaryBudget: 1600, lodBudget: 700,
    collision: { id: 'scenario-outfeed-buffer-1', kind: 'box', dimensionsMeters: { x: 1.2, y: 0.4, z: 0.8 } },
    semanticNodes: [{ id: 'sensor:presence', kind: 'sensor' }, { id: 'anchor:material.in', kind: 'anchor' }, { id: 'anchor:material.out', kind: 'anchor' }],
    anchors: [{ id: 'anchor:material.in', transform: { frameId: 'equipment-base', position: { x: -0.6, y: 0.4, z: 0 }, rotation: { x: 0, y: 0, z: 0 } } }, { id: 'anchor:material.out', transform: { frameId: 'equipment-base', position: { x: 0.6, y: 0.4, z: 0 }, rotation: { x: 0, y: 0, z: 0 } } }],
    materials: ['painted-steel', 'dark-steel', 'safety-yellow'],
    requiredNodes: ['deck', 'leg:-1:-1', 'leg:-1:1', 'leg:1:-1', 'leg:1:1'],
  },
  {
    assetId: 'scenario-fence-panel-v1', definitionId: 'fence-panel', category: 'safety-device',
    bounds: { x: 2.4, y: 2.1, z: 0.08 }, primaryBudget: 2000, lodBudget: 900,
    collision: { id: 'scenario-fence-1', kind: 'box', dimensionsMeters: { x: 2.4, y: 2.1, z: 0.06 } },
    semanticNodes: [{ id: 'signal:interlock', kind: 'signal' }],
    anchors: [],
    materials: ['safety-yellow', 'dark-steel'],
    requiredNodes: ['panel', 'post:-1', 'post:1'],
  },
  {
    assetId: 'scenario-light-curtain-v1', definitionId: 'light-curtain', category: 'safety-device',
    bounds: { x: 1.4, y: 1.84, z: 0.08 }, primaryBudget: 1400, lodBudget: 600,
    collision: { id: 'scenario-light-curtain-1', kind: 'box', dimensionsMeters: { x: 1.4, y: 1.8, z: 0.08 } },
    semanticNodes: [{ id: 'sensor:field', kind: 'sensor' }],
    anchors: [],
    materials: ['dark-steel', 'sensor-glass'],
    requiredNodes: ['post-a', 'field', 'emitter'],
  },
  {
    assetId: 'scenario-robot-controller-cabinet-v1', definitionId: 'robot-controller-cabinet', category: 'machine',
    bounds: { x: 0.8, y: 1.8, z: 0.65 }, primaryBudget: 2800, lodBudget: 1100,
    collision: { id: 'scenario-robot-controller-1', kind: 'box', dimensionsMeters: { x: 0.8, y: 1.8, z: 0.65 } },
    semanticNodes: [{ id: 'signal:panel', kind: 'signal' }, { id: 'door:panel', kind: 'door' }],
    anchors: [],
    materials: ['enclosure', 'dark-steel'],
    requiredNodes: ['cabinet', 'door', 'panel'],
  },
  {
    assetId: 'scenario-machining-fixture-v1', definitionId: 'machining-fixture', category: 'machine',
    bounds: { x: 0.55, y: 0.2, z: 0.55 }, primaryBudget: 1600, lodBudget: 700,
    collision: { id: 'scenario-fixture-1', kind: 'box', dimensionsMeters: { x: 0.55, y: 0.2, z: 0.55 } },
    semanticNodes: [{ id: 'fixture:workface', kind: 'fixture' }, { id: 'anchor:material.in', kind: 'anchor' }],
    anchors: [{ id: 'anchor:material.in', transform: { frameId: 'equipment-base', position: { x: 0, y: 0.18, z: 0 }, rotation: { x: 0, y: 0, z: 0 } } }],
    materials: ['dark-steel', 'painted-steel'],
    requiredNodes: ['fixture', 'workface'],
  },
  {
    assetId: 'scenario-toggle-clamp-v1', definitionId: 'toggle-clamp', category: 'machine',
    bounds: { x: 0.2, y: 0.2, z: 0.12 }, primaryBudget: 900, lodBudget: 400,
    collision: { id: 'scenario-clamp-1', kind: 'box', dimensionsMeters: { x: 0.2, y: 0.2, z: 0.12 } },
    semanticNodes: [{ id: 'fixture:clamp', kind: 'fixture' }, { id: 'sensor:clamped', kind: 'sensor' }],
    anchors: [],
    materials: ['dark-steel', 'safety-yellow'],
    requiredNodes: ['base', 'handle'],
  },
  {
    assetId: 'scenario-part-presence-sensor-v1', definitionId: 'part-presence-sensor', category: 'sensor',
    bounds: { x: 0.12, y: 0.1, z: 0.12 }, primaryBudget: 700, lodBudget: 350,
    collision: { id: 'scenario-presence-1', kind: 'box', dimensionsMeters: { x: 0.12, y: 0.1, z: 0.12 } },
    semanticNodes: [{ id: 'sensor:presence', kind: 'sensor' }],
    anchors: [],
    materials: ['plastic', 'sensor-glass'],
    requiredNodes: ['sensor', 'port'],
  },
  {
    assetId: 'scenario-barcode-rfid-reader-v1', definitionId: 'barcode-rfid-reader', category: 'sensor',
    bounds: { x: 0.2, y: 0.18, z: 0.15 }, primaryBudget: 900, lodBudget: 400,
    collision: { id: 'scenario-reader-1', kind: 'box', dimensionsMeters: { x: 0.2, y: 0.18, z: 0.15 } },
    semanticNodes: [{ id: 'sensor:reader', kind: 'sensor' }, { id: 'signal:data', kind: 'signal' }],
    anchors: [],
    materials: ['dark-steel', 'sensor-glass'],
    requiredNodes: ['body', 'window'],
  },
  {
    assetId: 'scenario-workholding-adapter-v1', definitionId: 'workholding-adapter', category: 'machine',
    bounds: { x: 0.35, y: 0.15, z: 0.35 }, primaryBudget: 1200, lodBudget: 500,
    collision: { id: 'scenario-adapter-1', kind: 'box', dimensionsMeters: { x: 0.35, y: 0.14, z: 0.35 } },
    semanticNodes: [{ id: 'fixture:adapter', kind: 'fixture' }, { id: 'anchor:material.in', kind: 'anchor' }],
    anchors: [{ id: 'anchor:material.in', transform: { frameId: 'equipment-base', position: { x: 0, y: 0.14, z: 0 }, rotation: { x: 0, y: 0, z: 0 } } }],
    materials: ['painted-steel', 'dark-steel'],
    requiredNodes: ['adapter'],
  },
  {
    assetId: 'scenario-interlocked-gate-v1', definitionId: 'interlocked-gate', category: 'safety-device',
    bounds: { x: 1.2, y: 2.1, z: 0.08 }, primaryBudget: 1800, lodBudget: 800,
    collision: { id: 'scenario-gate-1', kind: 'box', dimensionsMeters: { x: 1.2, y: 2.1, z: 0.08 } },
    semanticNodes: [{ id: 'door:gate', kind: 'door' }, { id: 'signal:interlock', kind: 'signal' }],
    anchors: [],
    materials: ['safety-yellow', 'signal-red'],
    requiredNodes: ['gate', 'interlock'],
  },
  {
    assetId: 'scenario-area-scanner-v1', definitionId: 'area-scanner', category: 'safety-device',
    bounds: { x: 0.26, y: 0.23, z: 0.26 }, primaryBudget: 900, lodBudget: 400,
    collision: { id: 'scenario-scanner-1', kind: 'box', dimensionsMeters: { x: 0.25, y: 0.22, z: 0.25 } },
    semanticNodes: [{ id: 'sensor:scanner', kind: 'sensor' }],
    anchors: [],
    materials: ['dark-steel', 'sensor-glass'],
    requiredNodes: ['scanner', 'window'],
  },
  {
    assetId: 'scenario-emergency-stop-v1', definitionId: 'emergency-stop', category: 'safety-device',
    bounds: { x: 0.35, y: 1.16, z: 0.35 }, primaryBudget: 1200, lodBudget: 500,
    collision: { id: 'scenario-estop-1', kind: 'box', dimensionsMeters: { x: 0.35, y: 1.15, z: 0.35 } },
    semanticNodes: [{ id: 'signal:estop', kind: 'signal' }],
    anchors: [],
    materials: ['dark-steel', 'signal-red'],
    requiredNodes: ['pedestal', 'button'],
  },
  {
    assetId: 'scenario-stack-light-v1', definitionId: 'stack-light', category: 'safety-device',
    bounds: { x: 0.15, y: 0.66, z: 0.15 }, primaryBudget: 1000, lodBudget: 450,
    collision: { id: 'scenario-stack-light-1', kind: 'box', dimensionsMeters: { x: 0.15, y: 0.65, z: 0.15 } },
    semanticNodes: [{ id: 'signal:stack', kind: 'signal' }],
    anchors: [],
    materials: ['signal-red', 'safety-yellow', 'signal-green'],
    requiredNodes: ['red', 'amber', 'green'],
  },
  {
    assetId: 'scenario-safety-zone-v1', definitionId: 'safety-zone', category: 'safety-device',
    bounds: { x: 2.5, y: 0.05, z: 2.5 }, primaryBudget: 1400, lodBudget: 600,
    collision: { id: 'scenario-safety-zone-1', kind: 'box', dimensionsMeters: { x: 2.5, y: 0.04, z: 2.5 } },
    semanticNodes: [{ id: 'signal:zone', kind: 'signal' }],
    anchors: [],
    materials: ['safety-yellow', 'dark-steel'],
    requiredNodes: ['zone-floor', 'zone-edge-a', 'zone-edge-b', 'zone-edge-c', 'zone-edge-d'],
  },
]

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
    ['compact', { scale: 0.8, baseHeight: 0.4, shoulderHeight: 0.4, upperArmLength: 0.7, forearmLength: 0.55, wristLength: 0.1 }, { x: 1.05, y: 1.95, z: 1.05 }],
    ['medium', { scale: 1.25, baseHeight: 0.4, shoulderHeight: 0.4, upperArmLength: 1.05, forearmLength: 0.88, wristLength: 0.1 }, { x: 1.6, y: 3.85, z: 1.6 }],
    ['heavy', { scale: 1.6, baseHeight: 0.4, shoulderHeight: 0.4, upperArmLength: 1.4, forearmLength: 1.2, wristLength: 0.1 }, { x: 2.05, y: 6.05, z: 2.05 }],
  ].map(([size, dimensions, bounds]) => writeAsset(`generic-6axis-${size}-v1`, professionalRobot(dimensions), professionalRobot(dimensions, true), ({ hash, lodHash, thumbHash }) => ({
    schemaVersion: '1.0', id: `generic-6axis-${size}-v1`, equipmentDefinitionId: `${size}-6axis`, category: 'robot', version: '1.0.0',
    coordinateSystem: { units: 'meters', upAxis: 'Y', handedness: 'right', origin: 'equipment-base' }, boundsMeters: bounds,
    visual: { glb: { path: 'model.glb', sha256: hash }, lods: [{ id: 'lod1', glb: { path: 'lod/lod1.glb', sha256: lodHash }, triangleBudget: 2500 }] },
    collision: { id: 'capsule-6axis', kind: 'capsule' },
    semanticNodes: [1, 2, 3, 4, 5, 6].map((index) => ({ id: `joint:j${index}`, kind: 'joint' })).concat([{ id: 'tool:flange', kind: 'tool' }, { id: 'tool:tcp', kind: 'tool' }]),
    anchors: [{ id: 'anchor:base', transform: { frameId: 'equipment-base', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } } }],
    robotRig: { joints: [{ id: 'joint:j1', axis: 'y', direction: 1 }, { id: 'joint:j2', axis: 'z', direction: 1, parentId: 'joint:j1' }, { id: 'joint:j3', axis: 'z', direction: 1, parentId: 'joint:j2' }, { id: 'joint:j4', axis: 'x', direction: 1, parentId: 'joint:j3' }, { id: 'joint:j5', axis: 'z', direction: 1, parentId: 'joint:j4' }, { id: 'joint:j6', axis: 'x', direction: 1, parentId: 'joint:j5' }], baseFrameNode: 'frame:base', flangeNode: 'tool:flange', toolFrameNode: 'tool:tcp' },
    materials: ['robot-orange', 'robot-orange-light', 'dark-steel', 'safety-label'], thumbnail: { path: 'thumbnail.svg', sha256: thumbHash }, license: { name: 'Fabrik3D generated generic asset; educational use' }, integrity: { path: 'model.glb', sha256: hash },
  }), { enforceBudgets: true, maxPrimaryTriangles: 25000, enforceBounds: true, checkLodSemanticNodes: true })),
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
  // S65 scenario-specific industrial equipment packages.
  ...SCENARIO_EQUIPMENT_SPECS.map((spec) => {
    const primary = scenarioEquipment(spec.definitionId)
    const lod = scenarioEquipment(spec.definitionId, true)
    // Declared portable semantic nodes must exist in both levels. Builders that
    // already create a node with the semantic name keep it; the rest get a
    // marker group so the manifest contract is real and testable.
    for (const node of spec.semanticNodes) {
      if (!primary.getObjectByName(node.id)) group(primary, node.id)
      if (!lod.getObjectByName(node.id)) group(lod, node.id)
    }
    return writeAsset(
      spec.assetId,
      primary,
      lod,
      ({ hash, lodHash, thumbHash }) => ({
      schemaVersion: '1.0', id: spec.assetId, equipmentDefinitionId: spec.definitionId, category: spec.category, version: '1.0.0',
      coordinateSystem: { units: 'meters', upAxis: 'Y', handedness: 'right', origin: 'equipment-base' }, boundsMeters: spec.bounds,
      visual: { glb: { path: 'model.glb', sha256: hash }, lods: [{ id: 'lod1', glb: { path: 'lod/lod1.glb', sha256: lodHash }, triangleBudget: spec.lodBudget }] },
      collision: spec.collision,
      semanticNodes: spec.semanticNodes,
      anchors: spec.anchors,
      materials: spec.materials, thumbnail: { path: 'thumbnail.svg', sha256: thumbHash },
      license: { name: 'Fabrik3D generated generic asset; educational use' }, integrity: { path: 'model.glb', sha256: hash },
      }),
      { enforceBudgets: true, maxPrimaryTriangles: spec.primaryBudget, enforceBounds: true, checkLodSemanticNodes: true },
    )
  }),
])
console.log(JSON.stringify(results, null, 2))
