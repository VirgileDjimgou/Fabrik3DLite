<template>
  <CellEditor :robot-catalog="catalog" />
</template>

<script setup lang="ts">
import CellEditor from './CellEditor.vue'
import { createDefaultRobotCatalog } from '../robot/catalog'

const catalog = createDefaultRobotCatalog()
</script>