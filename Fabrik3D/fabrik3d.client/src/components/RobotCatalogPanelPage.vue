<template>
  <div class="catalog-page">
    <RobotCatalogPanel
      :robots="robots"
      :selected-id="selectedId"
      :tools="tools"
      @select="selectedId = $event"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import RobotCatalogPanel from './RobotCatalogPanel.vue'
import { createDefaultRobotCatalog, DEFAULT_ROBOT_ID } from '../robot/catalog'

const catalog = createDefaultRobotCatalog()
const selectedId = ref(DEFAULT_ROBOT_ID)

const robots = computed(() => catalog.listRobots())
const tools = computed(() => catalog.listTools())
</script>

<style scoped>
.catalog-page {
  position: relative;
  width: 100vw;
  height: 100vh;
  background: #101020;
}
.catalog-page :deep(.robot-catalog-panel) {
  position: relative !important;
  top: auto !important;
  left: auto !important;
  right: auto !important;
  bottom: auto !important;
  margin: 2rem;
}
</style>
