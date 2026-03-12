<template>
  <!-- Renderless – manages pallet spawning & conveyor movement for one line -->
  <RawMaterialPallet
    v-for="p in activePallets"
    :key="p.id"
    :ref="el => setPalletRef(p.id, el)"
    :pallet-id="p.id"
    :rows="p.rows"
    :cols="p.cols"
    :cavity-shape="p.cavityShape"
    :material-type="p.materialType"
    :initial-position="[p.worldX, conveyorSurfaceY, conveyorZ]"
  />
</template>

<script setup lang="ts">
import { inject, ref, onBeforeUnmount } from 'vue'
import { ANIMATION_LOOP_KEY } from '../composables/injectionKeys'
import { ConveyorPalletFlow, type ConveyorFlowConfig } from '../simulation/ConveyorPalletFlow'
import type { PalletData } from '../simulation/PalletModels'
import RawMaterialPallet from './RawMaterialPallet.vue'

const props = withDefaults(defineProps<{
  flowConfig?: Partial<ConveyorFlowConfig>
  /** Y height of conveyor surface (pallets sit here). */
  conveyorSurfaceY?: number
  /** Z position of the conveyor centre. */
  conveyorZ?: number
}>(), {
  conveyorSurfaceY: 0.6,
  conveyorZ: 0,
})

const animLoop = inject(ANIMATION_LOOP_KEY)!

const activePallets = ref<PalletData[]>([])
const palletRefs = new Map<string, InstanceType<typeof RawMaterialPallet>>()

const flow = new ConveyorPalletFlow(props.flowConfig)

flow.onSpawn = (pallet) => {
  activePallets.value = [...flow.pallets]
}

flow.onMove = (pallets) => {
  for (const p of pallets) {
    const comp = palletRefs.get(p.id)
    comp?.setWorldX(p.worldX)
  }
}

function setPalletRef(id: string, el: unknown) {
  if (el) palletRefs.set(id, el as InstanceType<typeof RawMaterialPallet>)
  else palletRefs.delete(id)
}

animLoop.onFrame((_time, delta) => {
  flow.update(delta)
})

/** Get the first stopped pallet (closest to robot). */
function getFirstStoppedPallet(): PalletData | null {
  return flow.pallets.find(p => p.state === 'stopped') ?? null
}

/** Get the RawMaterialPallet component ref for a given pallet id. */
function getPalletComponent(palletId: string) {
  return palletRefs.get(palletId) ?? null
}

defineExpose({ getFirstStoppedPallet, getPalletComponent })

onBeforeUnmount(() => {
  palletRefs.clear()
})
</script>
