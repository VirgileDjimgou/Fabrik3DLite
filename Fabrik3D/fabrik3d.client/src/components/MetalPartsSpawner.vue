<template>
  <MetalPart
    v-for="part in partConfigs"
    :key="part.id"
    :ref="(el: any) => setPartRef(part.id, el)"
    :part-id="part.id"
    :shape="part.shape"
    :initial-position="part.position"
  />
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import * as THREE from 'three'
import MetalPart from './MetalPart.vue'
import {
  PartManager,
  ALL_PART_SHAPES,
  getPartHalfHeight,
  type PartShape,
} from '../simulation/PartManager'

const props = withDefaults(defineProps<{
  tablePosition?: [number, number, number]
  count?: number
}>(), {
  tablePosition: () => [-2, 0, 0] as [number, number, number],
  count: 6,
})

const emit = defineEmits<{
  (e: 'parts-ready', manager: PartManager): void
}>()

const partManager = new PartManager()

interface PartConfig {
  id: string
  shape: PartShape
  position: [number, number, number]
}

const partConfigs: PartConfig[] = []
const partRefs = new Map<string, InstanceType<typeof MetalPart>>()

function setPartRef(id: string, el: any) {
  if (el) partRefs.set(id, el)
  else partRefs.delete(id)
}

// Generate part configurations on the table surface
const [tx, ty, tz] = props.tablePosition
const surfaceY = ty + 0.87 // table-top surface in world space
const halfW = 0.45 // half table width with margin
const halfD = 0.28 // half table depth with margin

for (let i = 0; i < props.count; i++) {
  const shape = ALL_PART_SHAPES[i % ALL_PART_SHAPES.length]!
  const x = tx + (Math.random() * 2 - 1) * halfW
  const z = tz + (Math.random() * 2 - 1) * halfD
  const partHalfH = getPartHalfHeight(shape)
  const pos: [number, number, number] = [x, surfaceY + partHalfH, z]

  const data = partManager.register(shape, new THREE.Vector3(...pos))
  partConfigs.push({ id: data.id, shape, position: pos })
}

/** Get a MetalPart component ref by part id. */
function getPartRef(id: string) {
  return partRefs.get(id)
}

defineExpose({ partManager, getPartRef })

onMounted(() => {
  emit('parts-ready', partManager)
})
</script>
