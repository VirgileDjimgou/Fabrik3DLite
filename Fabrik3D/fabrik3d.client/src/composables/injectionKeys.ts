import type { InjectionKey, ShallowRef } from 'vue'
import type { ThreeSceneContext } from '../composables/useThreeScene'
import type { FrameCallback } from '../composables/useAnimationLoop'

export interface AnimationLoopApi {
  onFrame: (cb: FrameCallback) => void
}

export const SCENE_CONTEXT_KEY: InjectionKey<ShallowRef<ThreeSceneContext | null>> =
  Symbol('ThreeSceneContext')

export const ANIMATION_LOOP_KEY: InjectionKey<AnimationLoopApi> =
  Symbol('AnimationLoop')
