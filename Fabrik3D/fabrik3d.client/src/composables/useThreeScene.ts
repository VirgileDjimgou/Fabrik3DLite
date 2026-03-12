import { ref, shallowRef, onBeforeUnmount, type Ref, type ShallowRef } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export interface ThreeSceneContext {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  controls: OrbitControls

  /** Add any Object3D to the scene. */
  addObject(obj: THREE.Object3D): void
  /** Remove an Object3D from the scene. */
  removeObject(obj: THREE.Object3D): void
  /** Dispose the entire scene context. */
  dispose(): void
}

/**
 * Composable that creates a Three.js scene with renderer, camera,
 * orbit controls, lights, floor grid, and resize handling.
 *
 * @param containerRef  template ref to the host `<div>`
 */
export function useThreeScene(containerRef: Ref<HTMLDivElement | null>): {
  context: ShallowRef<ThreeSceneContext | null>
  errorMessage: Ref<string | null>
  init: () => void
} {
  const context = shallowRef<ThreeSceneContext | null>(null)
  const errorMessage = ref<string | null>(null)

  function onResize() {
    const ctx = context.value
    const el = containerRef.value
    if (!ctx || !el) return
    const w = el.clientWidth
    const h = el.clientHeight
    ctx.camera.aspect = w / h
    ctx.camera.updateProjectionMatrix()
    ctx.renderer.setSize(w, h)
  }

  function init() {
    const container = containerRef.value
    if (!container) {
      errorMessage.value = 'Container element not found.'
      return
    }

    try {
      const width = container.clientWidth
      const height = container.clientHeight

      // Renderer
      const renderer = new THREE.WebGLRenderer({ antialias: true })
      renderer.setSize(width, height)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.PCFShadowMap
      container.appendChild(renderer.domElement)

      // Scene
      const scene = new THREE.Scene()
      scene.background = new THREE.Color(0x1a1a2e)

      // Camera
      const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100)
      camera.position.set(3, 2.5, 3)
      camera.lookAt(0, 1, 0)

      // Controls
      const controls = new OrbitControls(camera, renderer.domElement)
      controls.target.set(0, 1, 0)
      controls.enableDamping = true
      controls.dampingFactor = 0.08
      controls.update()

      // Lights
      scene.add(new THREE.AmbientLight(0xffffff, 0.5))

      const dirLight = new THREE.DirectionalLight(0xffffff, 1.2)
      dirLight.position.set(5, 8, 4)
      dirLight.castShadow = true
      dirLight.shadow.mapSize.set(1024, 1024)
      scene.add(dirLight)

      const fillLight = new THREE.DirectionalLight(0x8888ff, 0.3)
      fillLight.position.set(-3, 4, -2)
      scene.add(fillLight)

      // Floor grid
      scene.add(new THREE.GridHelper(10, 20, 0x444466, 0x333355))

      // Floor plane (shadow receiver)
      const floorMat = new THREE.MeshStandardMaterial({
        color: 0x2a2a3e,
        roughness: 0.9,
        metalness: 0.1,
      })
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), floorMat)
      floor.rotation.x = -Math.PI / 2
      floor.receiveShadow = true
      scene.add(floor)

      const ctx: ThreeSceneContext = {
        scene,
        camera,
        renderer,
        controls,
        addObject: (obj) => scene.add(obj),
        removeObject: (obj) => scene.remove(obj),
        dispose: () => {
          controls.dispose()
          renderer.dispose()
          scene.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose()
              const mat = child.material
              if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
              else mat.dispose()
            }
          })
          container.removeChild(renderer.domElement)
        },
      }

      context.value = ctx
      window.addEventListener('resize', onResize)
    } catch (e) {
      console.error('Failed to initialize Three.js scene:', e)
      errorMessage.value =
        e instanceof Error ? e.message : 'Unknown error initializing WebGL.'
    }
  }

  onBeforeUnmount(() => {
    window.removeEventListener('resize', onResize)
    context.value?.dispose()
    context.value = null
  })

  return { context, errorMessage, init }
}
