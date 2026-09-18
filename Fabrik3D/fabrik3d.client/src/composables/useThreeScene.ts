import { ref, shallowRef, onBeforeUnmount } from 'vue'
import type { Ref, ShallowRef } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

export type SceneQuality = 'low' | 'medium' | 'high'

export interface SceneQualityPreset {
  shadows: boolean
  shadowMapSize: number
  pixelRatioCap: number
  toneMappingExposure: number
}

export const SCENE_QUALITY_PRESETS: Record<SceneQuality, SceneQualityPreset> = {
  low: { shadows: false, shadowMapSize: 512, pixelRatioCap: 1, toneMappingExposure: 0.9 },
  medium: { shadows: true, shadowMapSize: 2048, pixelRatioCap: 2, toneMappingExposure: 1.0 },
  high: { shadows: true, shadowMapSize: 4096, pixelRatioCap: 2, toneMappingExposure: 1.08 },
}

export function resolveSceneQuality(search = ''): SceneQuality {
  const requested = new URLSearchParams(search).get('quality')
  return requested === 'low' || requested === 'high' ? requested : 'medium'
}

export interface ThreeSceneContext {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  controls: OrbitControls
  quality: SceneQuality

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
      const quality = resolveSceneQuality(window.location.search)
      const preset = SCENE_QUALITY_PRESETS[quality]

      // Renderer
      const renderer = new THREE.WebGLRenderer({ antialias: true })
      renderer.setSize(width, height)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, preset.pixelRatioCap))
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = preset.toneMappingExposure
      renderer.shadowMap.enabled = preset.shadows
      renderer.shadowMap.type = THREE.PCFSoftShadowMap
      container.appendChild(renderer.domElement)

      // Scene
      const scene = new THREE.Scene()
      scene.background = new THREE.Color(0x202a31)
      const pmrem = new THREE.PMREMGenerator(renderer)
      const room = new RoomEnvironment()
      const environmentTarget = pmrem.fromScene(room, 0.04)
      scene.environment = environmentTarget.texture
      room.dispose()
      pmrem.dispose()

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
      scene.add(new THREE.HemisphereLight(0xdfeaf2, 0x2a3130, 1.4))

      const dirLight = new THREE.DirectionalLight(0xfff4df, 2.4)
      dirLight.position.set(5, 8, 4)
      dirLight.castShadow = true
      dirLight.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize)
      scene.add(dirLight)

      const fillLight = new THREE.DirectionalLight(0x9bc8e8, 0.55)
      fillLight.position.set(-3, 4, -2)
      scene.add(fillLight)

      // Floor grid
      scene.add(new THREE.GridHelper(10, 20, 0x52616a, 0x354148))

      // Floor plane (shadow receiver)
      const floorMat = new THREE.MeshStandardMaterial({
        color: 0x596064,
        roughness: 0.94,
        metalness: 0.03,
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
        quality,
        addObject: (obj) => scene.add(obj),
        removeObject: (obj) => scene.remove(obj),
        dispose: () => {
          controls.dispose()
          environmentTarget.dispose()
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
