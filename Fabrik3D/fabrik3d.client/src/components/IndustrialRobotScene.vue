<template>
  <div ref="containerRef" class="robot-scene">
    <div v-if="errorMessage" class="error-overlay">
      <h2>3D Rendering Error</h2>
      <p>{{ errorMessage }}</p>
      <p>Please make sure your browser supports WebGL and hardware acceleration is enabled.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

// ── Refs ──────────────────────────────────────────────────────────────
const containerRef = ref<HTMLDivElement | null>(null)
const errorMessage = ref<string | null>(null)

let renderer: THREE.WebGLRenderer
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let controls: OrbitControls
let animationId: number
let startTime: number

// Materials are created lazily inside initScene()
let fanucYellow: THREE.MeshStandardMaterial
let motorBlack: THREE.MeshStandardMaterial
let jointGreen: THREE.MeshStandardMaterial
let gripperMat: THREE.MeshStandardMaterial
let cableMat: THREE.MeshStandardMaterial

// ── Robot joint groups ────────────────────────────────────────────────
interface Robot {
  axis1: THREE.Group
  axis2: THREE.Group
  axis3: THREE.Group
  axis4: THREE.Group
  axis5: THREE.Group
  axis6: THREE.Group
}

let robot: Robot

// ── Build robot ───────────────────────────────────────────────────────
function buildRobot(): THREE.Group {
  const root = new THREE.Group()

  // ── Base ──────────────────────────────────────────────────────────
  const baseCylinder = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.55, 0.3, 24),
    darkMat,
  )
  baseCylinder.position.y = 0.15
  root.add(baseCylinder)

  const basePlate = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.4, 0.1, 24),
    orangeMat,
  )
  basePlate.position.y = 0.35
  root.add(basePlate)

  // ── Axis 1 – base rotation (Y) ───────────────────────────────────
  const axis1 = new THREE.Group()
  axis1.position.y = 0.4
  root.add(axis1)

  // Shoulder motor housing
  const shoulderHousing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.28, 0.35, 20),
    orangeMat,
  )
  shoulderHousing.position.y = 0.175
  axis1.add(shoulderHousing)

  // Shoulder joint sphere
  const shoulderSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 16, 12),
    darkMat,
  )
  shoulderSphere.position.y = 0.4
  axis1.add(shoulderSphere)

  // ── Axis 2 – shoulder (Z) ────────────────────────────────────────
  const axis2 = new THREE.Group()
  axis2.position.y = 0.4
  axis1.add(axis2)

  // Upper arm
  const upperArm = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.9, 0.18),
    orangeMat,
  )
  upperArm.position.y = 0.45
  axis2.add(upperArm)

  // Elbow joint sphere
  const elbowSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 14, 10),
    darkMat,
  )
  elbowSphere.position.y = 0.9
  axis2.add(elbowSphere)

  // ── Axis 3 – elbow (Z) ───────────────────────────────────────────
  const axis3 = new THREE.Group()
  axis3.position.y = 0.9
  axis2.add(axis3)

  // Forearm
  const forearm = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.7, 0.14),
    orangeMat,
  )
  forearm.position.y = 0.35
  axis3.add(forearm)

  // Wrist housing cylinder
  const wristHousing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.12, 0.12, 16),
    darkMat,
  )
  wristHousing.position.y = 0.72
  axis3.add(wristHousing)

  // ── Axis 4 – wrist roll (X) ──────────────────────────────────────
  const axis4 = new THREE.Group()
  axis4.position.y = 0.76
  axis3.add(axis4)

  const wristRollCyl = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 0.15, 14),
    orangeMat,
  )
  wristRollCyl.rotation.z = Math.PI / 2
  axis4.add(wristRollCyl)

  // ── Axis 5 – wrist pitch (Z) ─────────────────────────────────────
  const axis5 = new THREE.Group()
  axis5.position.y = 0.0
  axis4.add(axis5)

  const wristPitchSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 12, 8),
    darkMat,
  )
  wristPitchSphere.position.y = 0.1
  axis5.add(wristPitchSphere)

  // ── Axis 6 – wrist yaw (X) ───────────────────────────────────────
  const axis6 = new THREE.Group()
  axis6.position.y = 0.1
  axis5.add(axis6)

  const flangeDisc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.07, 0.04, 14),
    orangeMat,
  )
  flangeDisc.position.y = 0.02
  axis6.add(flangeDisc)

  // ── Tool – simple gripper ────────────────────────────────────────
  const toolGroup = new THREE.Group()
  toolGroup.position.y = 0.05
  axis6.add(toolGroup)

  const gripperBase = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.04, 0.12),
    gripperMat,
  )
  gripperBase.position.y = 0.02
  toolGroup.add(gripperBase)

  const fingerLeft = new THREE.Mesh(
    new THREE.BoxGeometry(0.015, 0.1, 0.02),
    gripperMat,
  )
  fingerLeft.position.set(0, 0.09, 0.045)
  toolGroup.add(fingerLeft)

  const fingerRight = new THREE.Mesh(
    new THREE.BoxGeometry(0.015, 0.1, 0.02),
    gripperMat,
  )
  fingerRight.position.set(0, 0.09, -0.045)
  toolGroup.add(fingerRight)

  // Store axis references
  robot = { axis1, axis2, axis3, axis4, axis5, axis6 }

  return root
}

// ── Create materials ──────────────────────────────────────────────────
function createMaterials() {
  orangeMat = new THREE.MeshStandardMaterial({
    color: 0xff6600,
    metalness: 0.4,
    roughness: 0.35,
  })
  darkMat = new THREE.MeshStandardMaterial({
    color: 0x222222,
    metalness: 0.6,
    roughness: 0.3,
  })
  gripperMat = new THREE.MeshStandardMaterial({
    color: 0x444444,
    metalness: 0.5,
    roughness: 0.4,
  })
}

// ── Scene setup ───────────────────────────────────────────────────────
function initScene() {
  const container = containerRef.value!
  const width = container.clientWidth
  const height = container.clientHeight

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  container.appendChild(renderer.domElement)

  // Create materials after the renderer (and its WebGL context) exist
  createMaterials()

  // Scene
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x1a1a2e)

  // Camera
  camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100)
  camera.position.set(3, 2.5, 3)
  camera.lookAt(0, 1, 0)

  // Controls
  controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(0, 1, 0)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.update()

  // Lights
  const ambient = new THREE.AmbientLight(0xffffff, 0.5)
  scene.add(ambient)

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.2)
  dirLight.position.set(5, 8, 4)
  dirLight.castShadow = true
  dirLight.shadow.mapSize.set(1024, 1024)
  scene.add(dirLight)

  const fillLight = new THREE.DirectionalLight(0x8888ff, 0.3)
  fillLight.position.set(-3, 4, -2)
  scene.add(fillLight)

  // Floor grid
  const grid = new THREE.GridHelper(10, 20, 0x444466, 0x333355)
  scene.add(grid)

  // Floor plane (receives shadow)
  const floorGeo = new THREE.PlaneGeometry(10, 10)
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a3e,
    roughness: 0.9,
    metalness: 0.1,
  })
  const floor = new THREE.Mesh(floorGeo, floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  // Robot
  const robotRoot = buildRobot()
  scene.add(robotRoot)

  // Enable shadows on all robot meshes
  robotRoot.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true
      child.receiveShadow = true
    }
  })
}

// ── Animation ─────────────────────────────────────────────────────────
function animate() {
  animationId = requestAnimationFrame(animate)

  const t = (performance.now() - startTime) / 1000

  // Pick-and-place style demo motion
  robot.axis1.rotation.y = Math.sin(t * 0.4) * 1.2
  robot.axis2.rotation.z = Math.sin(t * 0.6) * 0.4 - 0.2
  robot.axis3.rotation.z = Math.sin(t * 0.8 + 1.0) * 0.5 + 0.3
  robot.axis4.rotation.x = t * 1.5
  robot.axis5.rotation.z = Math.sin(t * 1.0) * 0.6
  robot.axis6.rotation.x = Math.sin(t * 1.2 + 0.5) * 0.4

  controls.update()
  renderer.render(scene, camera)
}

// ── Resize handler ────────────────────────────────────────────────────
function onResize() {
  const container = containerRef.value
  if (!container) return
  const width = container.clientWidth
  const height = container.clientHeight
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setSize(width, height)
}

// ── Lifecycle ─────────────────────────────────────────────────────────
onMounted(() => {
  try {
    initScene()
    startTime = performance.now()
    animate()
    window.addEventListener('resize', onResize)
  } catch (e) {
    console.error('Failed to initialize 3D scene:', e)
    errorMessage.value =
      e instanceof Error ? e.message : 'Unknown error initializing WebGL.'
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  cancelAnimationFrame(animationId)
  if (!renderer) return
  controls.dispose()
  renderer.dispose()
  scene.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose()
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose())
      } else {
        child.material.dispose()
      }
    }
  })
  containerRef.value?.removeChild(renderer.domElement)
})
</script>

<style scoped>
.robot-scene {
  width: 100%;
  height: 100vh;
  overflow: hidden;
  position: relative;
}

.error-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #1a1a2e;
  color: #f0f0f0;
  font-family: sans-serif;
  text-align: center;
  padding: 2rem;
}

.error-overlay h2 {
  color: #ff6600;
  margin-bottom: 0.5rem;
}
</style>
