import type { InjectionKey, ShallowRef } from 'vue'
import type { ThreeSceneContext } from '../composables/useThreeScene'
import type { FrameCallback } from '../composables/useAnimationLoop'
import type { EquipmentAssetRuntime } from '../equipment/assets/EquipmentAssetRuntime'

export interface AnimationLoopApi {
  onFrame: (cb: FrameCallback) => void
}

export const SCENE_CONTEXT_KEY: InjectionKey<ShallowRef<ThreeSceneContext | null>> =
  Symbol('ThreeSceneContext')

export const ANIMATION_LOOP_KEY: InjectionKey<AnimationLoopApi> =
  Symbol('AnimationLoop')

/** One shared equipment asset runtime per scene/application lifetime (S54). */
export const ASSET_RUNTIME_KEY: InjectionKey<EquipmentAssetRuntime> =
  Symbol('EquipmentAssetRuntime')
